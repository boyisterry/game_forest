import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import {
  buildTargetToRabbitBoneMap,
  forestCourierRuntimeBoneName,
  FOREST_COURIER_ACTION_CONTRACT,
  FOREST_COURIER_BONES,
  FOREST_COURIER_CHARACTER_ACTION_CLIPS,
  FOREST_COURIER_RIG_PROFILES,
  normalizeForestCourierActionName,
  validateForestCourierRig,
} from "../app/lib/animation/forestCourierRig.ts";
import {
  prepareForestCourierMasterClip,
  retargetForestCourierClip,
} from "../app/lib/animation/forestCourierRetarget.ts";

function readGlbJson(buffer) {
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.toString("utf8", offset + 8, offset + 8 + length).replace(/\u0000+$/, ""));
    }
    offset += 8 + length;
  }
  throw new Error("GLB JSON chunk missing");
}

async function assetBoneNames(modelUrl) {
  const file = new URL(`../public${modelUrl}`, import.meta.url);
  const json = readGlbJson(await readFile(file));
  const joints = json.skins?.flatMap((skin) => skin.joints ?? []) ?? [];
  return [...new Set(joints.map((index) => json.nodes?.[index]?.name).filter(Boolean))];
}

async function assetAnimationNames(modelUrl) {
  const file = new URL(`../public${modelUrl}`, import.meta.url);
  const json = readGlbJson(await readFile(file));
  return new Set((json.animations ?? []).map((animation) => animation.name).filter(Boolean));
}

test("defines a rabbit-first 45-bone master rig with the tiger tail extension", () => {
  assert.equal(FOREST_COURIER_BONES.length, 45);
  assert.equal(FOREST_COURIER_BONES.filter((bone) => bone.source === "rabbit").length, 41);
  assert.deepEqual(
    FOREST_COURIER_BONES.filter((bone) => bone.channel === "tail").map((bone) => bone.name),
    ["Tail01", "Tail02", "Tail03", "Tail04"],
  );
  assert.equal(FOREST_COURIER_BONES.find((bone) => bone.id === "tail.01")?.parent, "pelvis");
  assert.equal(FOREST_COURIER_ACTION_CONTRACT.walk.syncGroup, "locomotion");
  assert.equal(FOREST_COURIER_ACTION_CONTRACT.jump.loop, "once");
  assert.equal(FOREST_COURIER_ACTION_CONTRACT.walk_jump.loop, "once");
  assert.equal(FOREST_COURIER_ACTION_CONTRACT.run_jump.syncGroup, "airborne");
});

test("maps every existing character to the required master-rig semantics", async () => {
  for (const profile of Object.values(FOREST_COURIER_RIG_PROFILES)) {
    const report = validateForestCourierRig(profile, await assetBoneNames(profile.modelUrl));
    assert.equal(report.compatible, true, `${profile.id}: ${JSON.stringify(report)}`);
    assert.equal(report.missingAssetBones.length, 0);
    assert.equal(report.missingRequiredMappings.length, 0);
  }
  assert.equal(FOREST_COURIER_RIG_PROFILES.rabbit.tailBones.length, 0);
  assert.equal(FOREST_COURIER_RIG_PROFILES.tiger.tailBones.length, 4);
  assert.equal(FOREST_COURIER_RIG_PROFILES.fox.tailBones.length, 6);
});

test("builds target-to-rabbit maps without pretending the rabbit has tail bones", () => {
  const foxMap = buildTargetToRabbitBoneMap(FOREST_COURIER_RIG_PROFILES.fox);
  assert.equal(foxMap.hips, "Pelvis");
  assert.equal(foxMap.chest, "Spine02");
  assert.equal(foxMap.upper_arm_L, "L_Upperarm");
  assert.equal(foxMap.tail_01, undefined);

  const tigerMap = buildTargetToRabbitBoneMap(FOREST_COURIER_RIG_PROFILES.tiger);
  assert.equal(tigerMap.hips, "Pelvis");
  assert.equal(tigerMap.forearmR, "R_Forearm");
  assert.equal(forestCourierRuntimeBoneName("tail.01"), "tail01");
});

test("normalizes legacy action names into the shared action contract", () => {
  assert.equal(normalizeForestCourierActionName("preset:biped:idle"), "idle");
  assert.equal(normalizeForestCourierActionName("RunJump"), "run_jump");
  assert.equal(normalizeForestCourierActionName("Walk Jump"), "walk_jump");
  assert.equal(normalizeForestCourierActionName("CombatIdle"), "idle");
  assert.equal(normalizeForestCourierActionName("RoundhouseKick"), null);
});

test("bakes the rabbit head correction and Hip-axis fix into a reusable master clip", () => {
  const clip = new THREE.AnimationClip("preset:biped:idle", 1, [
    new THREE.VectorKeyframeTrack("Armature.position", [0, 1], [0, 0, 0, 0, 0, 0]),
    new THREE.VectorKeyframeTrack("Head.scale", [0, 1], [1, 1, 1, 1, 1, 1]),
    new THREE.QuaternionKeyframeTrack("NeckTwist01.quaternion", [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]),
    new THREE.VectorKeyframeTrack("Hip.position", [0, 1], [0.1, 0, 0, -0.05, 0, 0]),
  ]);
  const prepared = prepareForestCourierMasterClip(clip, "idle", new THREE.Vector3(0, 0, 0.24));
  assert.equal(prepared.name, "forest-courier:v1:idle");

  const neck = prepared.tracks.find((track) => track.name === "NeckTwist01.quaternion");
  const expected = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), THREE.MathUtils.degToRad(18));
  const actual = new THREE.Quaternion().fromArray(neck.values, 0);
  assert.ok(actual.angleTo(expected) < 1e-6);

  const hip = prepared.tracks.find((track) => track.name === "Hip.position");
  const expectedHipValues = [0, 0, 0.34, 0, 0, 0.19];
  assert.ok(Array.from(hip.values).every((value, index) => Math.abs(value - expectedHipValues[index]) < 1e-6));
  const originalHipValues = [0.1, 0, 0, -0.05, 0, 0];
  assert.ok(Array.from(clip.tracks[3].values).every((value, index) => Math.abs(value - originalHipValues[index]) < 1e-6));
  assert.equal(prepared.tracks.some((track) => track.name === "Armature.position"), false);
  assert.equal(prepared.tracks.some((track) => track.name.endsWith(".scale")), false);
});

test("retargets a master bone track to a differently named local skeleton", () => {
  const sourceScene = new THREE.Group();
  const sourceMesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const sourcePelvis = new THREE.Bone();
  sourcePelvis.name = "Pelvis";
  sourceMesh.add(sourcePelvis);
  sourceMesh.bind(new THREE.Skeleton([sourcePelvis]));
  sourceScene.add(sourceMesh);

  const targetScene = new THREE.Group();
  const targetMesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const targetHips = new THREE.Bone();
  targetHips.name = "hips";
  targetMesh.add(targetHips);
  targetMesh.bind(new THREE.Skeleton([targetHips]));
  targetScene.add(targetMesh);

  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 4);
  const clip = new THREE.AnimationClip("forest-courier:v1:idle", 1, [
    new THREE.QuaternionKeyframeTrack("Pelvis.quaternion", [0, 1], [0, 0, 0, 1, turn.x, turn.y, turn.z, turn.w]),
  ]);
  const converted = retargetForestCourierClip(sourceScene, targetScene, clip, "fox", { fps: 2 });
  assert.ok(converted.tracks.some((track) => track.name === "hips.quaternion"));
  assert.ok(converted.tracks.some((track) => track.name === "hips.position"));
  assert.equal(converted.tracks.some((track) => track.name.startsWith(".bones[")), false);
  assert.equal(converted.name, clip.name);
});

test("uses explicit native clips for each legacy rig instead of ambiguous runtime retargeting", async () => {
  for (const [profileId, actionClips] of Object.entries(FOREST_COURIER_CHARACTER_ACTION_CLIPS)) {
    assert.equal(Object.keys(actionClips).length, 6, `${profileId} must expose all six actions`);
    const available = await assetAnimationNames(FOREST_COURIER_RIG_PROFILES[profileId].modelUrl);
    for (const [actionId, clipName] of Object.entries(actionClips)) {
      assert.ok(available.has(clipName), `${profileId}.${actionId} is missing native clip ${clipName}`);
    }
  }
  assert.equal(FOREST_COURIER_CHARACTER_ACTION_CLIPS.fox.idle, "CombatIdle");
  assert.equal(FOREST_COURIER_CHARACTER_ACTION_CLIPS.fox.jump, "RunJump");
  assert.equal(FOREST_COURIER_CHARACTER_ACTION_CLIPS.tiger.jump, "jump");
  assert.equal(FOREST_COURIER_CHARACTER_ACTION_CLIPS.tiger.idle, "jump");
  assert.equal(FOREST_COURIER_CHARACTER_ACTION_CLIPS.tiger.run_jump, "run_jump");
  assert.notEqual(FOREST_COURIER_CHARACTER_ACTION_CLIPS.tiger.jump, "run_jump");
});
