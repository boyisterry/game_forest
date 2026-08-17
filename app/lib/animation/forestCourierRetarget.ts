import * as THREE from "three";
import { retargetClip } from "three/addons/utils/SkeletonUtils.js";
import {
  buildTargetToRabbitBoneMap,
  forestCourierRuntimeBoneName,
  FOREST_COURIER_ACTION_CONTRACT,
  FOREST_COURIER_BONES,
  FOREST_COURIER_RIG_PROFILES,
  normalizeForestCourierActionName,
  type ForestCourierActionId,
  type ForestCourierRigProfile,
  type ForestCourierRigProfileId,
} from "./forestCourierRig.ts";

export type ForestCourierRetargetOptions = {
  fps?: number;
  scale?: number;
  useFirstFramePosition?: boolean;
};

export type ForestCourierUnifiedActionSources = {
  rabbitRoot: THREE.Object3D;
  rabbitClips: readonly THREE.AnimationClip[];
  targetRoot: THREE.Object3D;
  targetProfile: ForestCourierRigProfile | ForestCourierRigProfileId;
  tigerTailRoot?: THREE.Object3D;
  tigerTailClips?: readonly THREE.AnimationClip[];
};

export function findPrimarySkinnedMesh(root: THREE.Object3D) {
  let primary: THREE.SkinnedMesh | null = null;
  root.traverse((object) => {
    if (!primary && object instanceof THREE.SkinnedMesh) primary = object;
  });
  return primary;
}

function normalizeSceneRootTrackBindings(clip: THREE.AnimationClip) {
  for (const track of clip.tracks) {
    track.name = track.name.replace(/^\.bones\[([^\]]+)\]\./, "$1.");
  }
  return clip;
}

function mappedBoneDistance(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  profile: ForestCourierRigProfile,
  endId: "body.head" | "leg.l.foot" | "leg.r.foot",
) {
  const sourcePelvis = sourceRoot.getObjectByName(forestCourierRuntimeBoneName("Pelvis"));
  const sourceEndName = FOREST_COURIER_BONES.find((bone) => bone.id === endId)?.name;
  const targetPelvisName = profile.bones.pelvis;
  const targetEndName = profile.bones[endId];
  if (!sourcePelvis || !sourceEndName || !targetPelvisName || !targetEndName) return null;
  const sourceEnd = sourceRoot.getObjectByName(forestCourierRuntimeBoneName(sourceEndName));
  const targetPelvis = targetRoot.getObjectByName(forestCourierRuntimeBoneName(targetPelvisName));
  const targetEnd = targetRoot.getObjectByName(forestCourierRuntimeBoneName(targetEndName));
  if (!sourceEnd || !targetPelvis || !targetEnd) return null;

  const sourceStartPosition = sourcePelvis.getWorldPosition(new THREE.Vector3());
  const sourceEndPosition = sourceEnd.getWorldPosition(new THREE.Vector3());
  const targetStartPosition = targetPelvis.getWorldPosition(new THREE.Vector3());
  const targetEndPosition = targetEnd.getWorldPosition(new THREE.Vector3());
  const sourceDistance = sourceStartPosition.distanceTo(sourceEndPosition);
  const targetDistance = targetStartPosition.distanceTo(targetEndPosition);
  return sourceDistance > 1e-6 && targetDistance > 1e-6 ? targetDistance / sourceDistance : null;
}

/** Estimate a stable translation scale from three mapped body spans. */
export function estimateForestCourierRetargetScale(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  profile: ForestCourierRigProfile,
) {
  sourceRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);
  const ratios = (["body.head", "leg.l.foot", "leg.r.foot"] as const)
    .map((endId) => mappedBoneDistance(sourceRoot, targetRoot, profile, endId))
    .filter((ratio): ratio is number => ratio !== null && Number.isFinite(ratio));
  if (ratios.length === 0) return 1;
  ratios.sort((a, b) => a - b);
  return ratios[Math.floor(ratios.length / 2)];
}

/**
 * Convert the current rabbit locomotion clips into ForestCourierRig master
 * clips. This fixes the source neck pose and the Tripo Hip axis mismatch once,
 * before the action is played or retargeted to another animal.
 */
export function prepareForestCourierMasterClip(
  source: THREE.AnimationClip,
  actionId: ForestCourierActionId,
  hipBindPosition: THREE.Vector3,
) {
  const clip = source.clone();
  clip.name = `forest-courier:v1:${actionId}`;
  const rabbitBoneNames = new Set(
    FOREST_COURIER_BONES
      .filter((bone) => bone.source === "rabbit")
      .map((bone) => forestCourierRuntimeBoneName(bone.name)),
  );
  clip.tracks = clip.tracks.filter((track) => {
    const propertySeparator = track.name.lastIndexOf(".");
    const nodeName = propertySeparator >= 0 ? track.name.slice(0, propertySeparator) : track.name;
    return !track.name.endsWith(".scale") && rabbitBoneNames.has(nodeName);
  });
  const headCorrection = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    THREE.MathUtils.degToRad(FOREST_COURIER_ACTION_CONTRACT[actionId].headLiftDegrees),
  );
  const quaternion = new THREE.Quaternion();

  for (const track of clip.tracks) {
    if (
      track instanceof THREE.QuaternionKeyframeTrack
      && track.name.endsWith("NeckTwist01.quaternion")
      && track.getValueSize() === 4
    ) {
      for (let offset = 0; offset < track.values.length; offset += 4) {
        quaternion.fromArray(track.values, offset).normalize().multiply(headCorrection).normalize();
        track.values[offset] = quaternion.x;
        track.values[offset + 1] = quaternion.y;
        track.values[offset + 2] = quaternion.z;
        track.values[offset + 3] = quaternion.w;
      }
    }

    if (
      track instanceof THREE.VectorKeyframeTrack
      && track.name.endsWith("Hip.position")
      && track.getValueSize() === 3
    ) {
      for (let offset = 0; offset < track.values.length; offset += 3) {
        const animatedVertical = track.values[offset];
        track.values[offset] = hipBindPosition.x;
        track.values[offset + 1] = hipBindPosition.y;
        track.values[offset + 2] = hipBindPosition.z + animatedVertical;
      }
    }
  }

  clip.resetDuration();
  return clip;
}

export function prepareForestCourierMasterActions(
  clips: readonly THREE.AnimationClip[],
  hipBindPosition: THREE.Vector3,
) {
  const actions: Partial<Record<ForestCourierActionId, THREE.AnimationClip>> = {};
  for (const clip of clips) {
    const actionId = normalizeForestCourierActionName(clip.name);
    if (!actionId) continue;
    actions[actionId] = prepareForestCourierMasterClip(clip, actionId, hipBindPosition);
  }
  return actions;
}

export function retargetForestCourierClip(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  masterClip: THREE.AnimationClip,
  profileOrId: ForestCourierRigProfile | ForestCourierRigProfileId,
  options: ForestCourierRetargetOptions = {},
) {
  const profile = typeof profileOrId === "string"
    ? FOREST_COURIER_RIG_PROFILES[profileOrId]
    : profileOrId;

  if (profile.id === "rabbit") return masterClip.clone();

  const sourceMesh = findPrimarySkinnedMesh(sourceRoot);
  const targetMesh = findPrimarySkinnedMesh(targetRoot);
  if (!sourceMesh) throw new Error("ForestCourierRig source has no SkinnedMesh");
  if (!targetMesh) throw new Error(`${profile.label} has no SkinnedMesh`);

  sourceMesh.skeleton.pose();
  targetMesh.skeleton.pose();
  sourceRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);

  const converted = retargetClip(targetMesh, sourceMesh, masterClip, {
    names: buildTargetToRabbitBoneMap(profile),
    hip: "Pelvis",
    preserveBoneMatrix: true,
    preserveBonePositions: true,
    useFirstFramePosition: options.useFirstFramePosition ?? false,
    fps: options.fps,
    scale: options.scale ?? estimateForestCourierRetargetScale(sourceRoot, targetRoot, profile),
  });
  converted.name = masterClip.name;
  normalizeSceneRootTrackBindings(converted);

  targetMesh.skeleton.pose();
  targetRoot.updateMatrixWorld(true);
  return converted;
}

export function retargetForestCourierActions(
  sourceRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  masterActions: Partial<Record<ForestCourierActionId, THREE.AnimationClip>>,
  profileOrId: ForestCourierRigProfile | ForestCourierRigProfileId,
  options: ForestCourierRetargetOptions = {},
) {
  const converted: Partial<Record<ForestCourierActionId, THREE.AnimationClip>> = {};
  for (const actionId of Object.keys(masterActions) as ForestCourierActionId[]) {
    const masterClip = masterActions[actionId];
    if (!masterClip) continue;
    converted[actionId] = retargetForestCourierClip(sourceRoot, targetRoot, masterClip, profileOrId, options);
  }
  return converted;
}


function exactActionName(name: string) {
  return name.toLowerCase().replace(/^.*[:/]/, "").replace(/[\s-]+/g, "_");
}

function findTigerTailAction(
  clips: readonly THREE.AnimationClip[],
  actionId: ForestCourierActionId,
) {
  const sourceId = actionId === "idle" ? "walk" : actionId;
  return clips.find((clip) => exactActionName(clip.name) === sourceId) ?? null;
}

function trackBoneName(trackName: string) {
  const skeletonBinding = trackName.match(/\.bones\[([^\]]+)\]\.quaternion$/);
  if (skeletonBinding) return skeletonBinding[1];
  return trackName.endsWith(".quaternion") ? trackName.slice(0, -".quaternion".length) : null;
}

function tigerTailOnlyClip(source: THREE.AnimationClip) {
  const tigerTailNames = new Set(
    FOREST_COURIER_RIG_PROFILES.tiger.tailBones.map(forestCourierRuntimeBoneName),
  );
  const tracks = source.tracks
    .filter((track) => track instanceof THREE.QuaternionKeyframeTrack && tigerTailNames.has(trackBoneName(track.name) ?? ""))
    .map((track) => track.clone());
  return new THREE.AnimationClip(`forest-courier:tail:${source.name}`, source.duration, tracks);
}

function buildTargetToTigerTailMap(profile: ForestCourierRigProfile) {
  const mapping: Record<string, string> = {};
  for (const definition of FOREST_COURIER_BONES) {
    if (definition.channel !== "tail") continue;
    const targetBone = profile.bones[definition.id];
    const sourceBone = FOREST_COURIER_RIG_PROFILES.tiger.bones[definition.id];
    if (targetBone && sourceBone) {
      mapping[forestCourierRuntimeBoneName(targetBone)] = forestCourierRuntimeBoneName(sourceBone);
    }
  }
  return mapping;
}

function retargetTigerTailClip(
  tigerRoot: THREE.Object3D,
  targetRoot: THREE.Object3D,
  source: THREE.AnimationClip,
  profile: ForestCourierRigProfile,
) {
  const tailClip = tigerTailOnlyClip(source);
  if (profile.id === "tiger") return tailClip;
  const sourceMesh = findPrimarySkinnedMesh(tigerRoot);
  const targetMesh = findPrimarySkinnedMesh(targetRoot);
  if (!sourceMesh || !targetMesh) throw new Error("ForestCourierRig tail retarget requires two SkinnedMesh roots");

  sourceMesh.skeleton.pose();
  targetMesh.skeleton.pose();
  tigerRoot.updateMatrixWorld(true);
  targetRoot.updateMatrixWorld(true);
  const converted = retargetClip(targetMesh, sourceMesh, tailClip, {
    names: buildTargetToTigerTailMap(profile),
    hip: "__forest_courier_no_tail_hip__",
    preserveBoneMatrix: true,
    preserveBonePositions: true,
  });
  normalizeSceneRootTrackBindings(converted);
  targetMesh.skeleton.pose();
  targetRoot.updateMatrixWorld(true);
  return converted;
}

function fitTailClipToAction(
  source: THREE.AnimationClip,
  targetRoot: THREE.Object3D,
  profile: ForestCourierRigProfile,
  actionId: ForestCourierActionId,
  duration: number,
) {
  const clip = source.clone();
  const timeScale = source.duration > 1e-6 ? duration / source.duration : 1;
  const motionStrength = actionId === "idle" ? 0.18 : 1;
  const bindInverse = new THREE.Quaternion();
  const animated = new THREE.Quaternion();
  const delta = new THREE.Quaternion();
  const softened = new THREE.Quaternion();

  for (const track of clip.tracks) {
    for (let index = 0; index < track.times.length; index += 1) track.times[index] *= timeScale;
    if (!(track instanceof THREE.QuaternionKeyframeTrack) || motionStrength === 1) continue;
    const bone = targetRoot.getObjectByName(trackBoneName(track.name) ?? "");
    if (!bone) continue;
    bindInverse.copy(bone.quaternion).invert();
    for (let offset = 0; offset < track.values.length; offset += 4) {
      animated.fromArray(track.values, offset).normalize();
      delta.copy(bindInverse).multiply(animated).normalize();
      softened.identity().slerp(delta, motionStrength);
      animated.copy(bone.quaternion).multiply(softened).normalize().toArray(track.values, offset);
    }
  }

  // Fox has two extra tail joints. Continue the canonical Tail04 delta with
  // diminishing influence instead of introducing a second species action.
  const canonicalTailEnd = profile.bones["tail.04"]
    ? forestCourierRuntimeBoneName(profile.bones["tail.04"])
    : undefined;
  const endTrack = canonicalTailEnd
    ? clip.tracks.find((track) => track instanceof THREE.QuaternionKeyframeTrack && trackBoneName(track.name) === canonicalTailEnd)
    : null;
  const endBone = canonicalTailEnd ? targetRoot.getObjectByName(canonicalTailEnd) : null;
  if (endTrack instanceof THREE.QuaternionKeyframeTrack && endBone) {
    const endBindInverse = endBone.quaternion.clone().invert();
    profile.tailBones.slice(4).forEach((profileBoneName, extensionIndex) => {
      const boneName = forestCourierRuntimeBoneName(profileBoneName);
      const bone = targetRoot.getObjectByName(boneName);
      if (!bone) return;
      const influence = Math.max(0.35, 0.68 - extensionIndex * 0.18);
      const values = new Float32Array(endTrack.values.length);
      for (let offset = 0; offset < endTrack.values.length; offset += 4) {
        animated.fromArray(endTrack.values, offset).normalize();
        delta.copy(endBindInverse).multiply(animated).normalize();
        softened.identity().slerp(delta, influence);
        animated.copy(bone.quaternion).multiply(softened).normalize().toArray(values, offset);
      }
      clip.tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, endTrack.times.slice(), values));
    });
  }

  clip.name = `forest-courier:v1:${actionId}:tail`;
  clip.duration = duration;
  return clip;
}

function mergeBodyAndTailClips(
  body: THREE.AnimationClip,
  tail: THREE.AnimationClip | null,
) {
  if (!tail) return body;
  return new THREE.AnimationClip(
    body.name,
    body.duration,
    [...body.tracks.map((track) => track.clone()), ...tail.tracks.map((track) => track.clone())],
  );
}

/**
 * Build the single runtime action set: Rabbit drives the complete body and the
 * Tiger reference supplies Tail01..04 for every animal that has a tail.
 */
export function buildForestCourierUnifiedActions(sources: ForestCourierUnifiedActionSources) {
  const profile = typeof sources.targetProfile === "string"
    ? FOREST_COURIER_RIG_PROFILES[sources.targetProfile]
    : sources.targetProfile;
  const hip = sources.rabbitRoot.getObjectByName("Hip");
  if (!hip) throw new Error("ForestCourierRig rabbit master is missing Hip");

  const masterActions = prepareForestCourierMasterActions(sources.rabbitClips, hip.position.clone());
  const bodyActions = retargetForestCourierActions(
    sources.rabbitRoot,
    sources.targetRoot,
    masterActions,
    profile,
  );
  const unified: Partial<Record<ForestCourierActionId, THREE.AnimationClip>> = {};

  for (const actionId of Object.keys(bodyActions) as ForestCourierActionId[]) {
    const body = bodyActions[actionId];
    if (!body) continue;
    let tail: THREE.AnimationClip | null = null;
    if (profile.tailBones.length > 0) {
      if (!sources.tigerTailRoot || !sources.tigerTailClips) {
        throw new Error(`${profile.label} requires the local Tiger tail action source`);
      }
      const sourceTailAction = findTigerTailAction(sources.tigerTailClips, actionId);
      if (!sourceTailAction) throw new Error(`Tiger tail source is missing ${actionId}`);
      tail = fitTailClipToAction(
        retargetTigerTailClip(sources.tigerTailRoot, sources.targetRoot, sourceTailAction, profile),
        sources.targetRoot,
        profile,
        actionId,
        body.duration,
      );
    }
    unified[actionId] = mergeBodyAndTailClips(body, tail);
  }
  return unified;
}
