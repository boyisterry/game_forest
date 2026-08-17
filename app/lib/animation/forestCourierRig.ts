export const FOREST_COURIER_RIG_VERSION = "1.0.0";
export const FOREST_COURIER_MASTER_MODEL_URL = "/models/characters/rabbit/rabbit-courier-rigged-runtime.glb";

export const FOREST_COURIER_BASE_ACTION_IDS = ["idle", "walk", "run", "jump"] as const;
export const FOREST_COURIER_ACTION_IDS = [
  ...FOREST_COURIER_BASE_ACTION_IDS,
  "walk_jump",
  "run_jump",
] as const;
export type ForestCourierActionId = (typeof FOREST_COURIER_ACTION_IDS)[number];

export type ForestCourierBoneChannel = "core" | "twist" | "tail";

export type ForestCourierBoneId =
  | "root" | "hip" | "pelvis"
  | "leg.l.thigh" | "leg.l.thigh_twist_01" | "leg.l.thigh_twist_02"
  | "leg.l.calf" | "leg.l.calf_twist_01" | "leg.l.calf_twist_02" | "leg.l.foot" | "leg.l.toe"
  | "leg.r.thigh" | "leg.r.thigh_twist_01" | "leg.r.thigh_twist_02"
  | "leg.r.calf" | "leg.r.calf_twist_01" | "leg.r.calf_twist_02" | "leg.r.foot" | "leg.r.toe"
  | "body.waist" | "body.spine_01" | "body.spine_02" | "body.neck_01" | "body.neck_02" | "body.head"
  | "arm.l.clavicle" | "arm.l.upper" | "arm.l.upper_twist_01" | "arm.l.upper_twist_02"
  | "arm.l.forearm" | "arm.l.forearm_twist_01" | "arm.l.forearm_twist_02" | "arm.l.hand"
  | "arm.r.clavicle" | "arm.r.upper" | "arm.r.upper_twist_01" | "arm.r.upper_twist_02"
  | "arm.r.forearm" | "arm.r.forearm_twist_01" | "arm.r.forearm_twist_02" | "arm.r.hand"
  | "tail.01" | "tail.02" | "tail.03" | "tail.04";

export type ForestCourierBoneDefinition = {
  id: ForestCourierBoneId;
  name: string;
  parent: ForestCourierBoneId | null;
  channel: ForestCourierBoneChannel;
  /** Every compatible consumer rig must provide a mapping for this semantic bone. */
  requiredForConsumer: boolean;
  source: "rabbit" | "tiger";
};

const bone = (
  id: ForestCourierBoneId,
  name: string,
  parent: ForestCourierBoneId | null,
  channel: ForestCourierBoneChannel,
  requiredForConsumer: boolean,
  source: "rabbit" | "tiger" = "rabbit",
): ForestCourierBoneDefinition => ({ id, name, parent, channel, requiredForConsumer, source });

/**
 * ForestCourierRig v1 is the rabbit's complete 41-bone Tripo Biped hierarchy,
 * extended by the tiger's four-bone tail chain. Rabbit names remain canonical
 * so the existing master locomotion clips do not need a lossy rename pass.
 */
export const FOREST_COURIER_BONES: readonly ForestCourierBoneDefinition[] = [
  bone("root", "Root", null, "core", false),
  bone("hip", "Hip", "root", "core", false),
  bone("pelvis", "Pelvis", "hip", "core", true),

  bone("leg.l.thigh", "L_Thigh", "pelvis", "core", true),
  bone("leg.l.calf", "L_Calf", "leg.l.thigh", "core", true),
  bone("leg.l.foot", "L_Foot", "leg.l.calf", "core", true),
  bone("leg.l.toe", "L_ToeBase", "leg.l.foot", "core", true),
  bone("leg.l.calf_twist_01", "L_CalfTwist01", "leg.l.calf", "twist", false),
  bone("leg.l.calf_twist_02", "L_CalfTwist02", "leg.l.calf_twist_01", "twist", false),
  bone("leg.l.thigh_twist_01", "L_ThighTwist01", "leg.l.thigh", "twist", false),
  bone("leg.l.thigh_twist_02", "L_ThighTwist02", "leg.l.thigh_twist_01", "twist", false),

  bone("leg.r.thigh", "R_Thigh", "pelvis", "core", true),
  bone("leg.r.calf", "R_Calf", "leg.r.thigh", "core", true),
  bone("leg.r.foot", "R_Foot", "leg.r.calf", "core", true),
  bone("leg.r.toe", "R_ToeBase", "leg.r.foot", "core", true),
  bone("leg.r.calf_twist_01", "R_CalfTwist01", "leg.r.calf", "twist", false),
  bone("leg.r.calf_twist_02", "R_CalfTwist02", "leg.r.calf_twist_01", "twist", false),
  bone("leg.r.thigh_twist_01", "R_ThighTwist01", "leg.r.thigh", "twist", false),
  bone("leg.r.thigh_twist_02", "R_ThighTwist02", "leg.r.thigh_twist_01", "twist", false),

  bone("body.waist", "Waist", "hip", "core", false),
  bone("body.spine_01", "Spine01", "body.waist", "core", true),
  bone("body.spine_02", "Spine02", "body.spine_01", "core", true),
  bone("body.neck_01", "NeckTwist01", "body.spine_02", "core", true),
  bone("body.neck_02", "NeckTwist02", "body.neck_01", "twist", false),
  bone("body.head", "Head", "body.neck_02", "core", true),

  bone("arm.l.clavicle", "L_Clavicle", "body.spine_02", "core", true),
  bone("arm.l.upper", "L_Upperarm", "arm.l.clavicle", "core", true),
  bone("arm.l.forearm", "L_Forearm", "arm.l.upper", "core", true),
  bone("arm.l.hand", "L_Hand", "arm.l.forearm", "core", true),
  bone("arm.l.forearm_twist_01", "L_ForearmTwist01", "arm.l.forearm", "twist", false),
  bone("arm.l.forearm_twist_02", "L_ForearmTwist02", "arm.l.forearm_twist_01", "twist", false),
  bone("arm.l.upper_twist_01", "L_UpperarmTwist01", "arm.l.upper", "twist", false),
  bone("arm.l.upper_twist_02", "L_UpperarmTwist02", "arm.l.upper_twist_01", "twist", false),

  bone("arm.r.clavicle", "R_Clavicle", "body.spine_02", "core", true),
  bone("arm.r.upper", "R_Upperarm", "arm.r.clavicle", "core", true),
  bone("arm.r.forearm", "R_Forearm", "arm.r.upper", "core", true),
  bone("arm.r.hand", "R_Hand", "arm.r.forearm", "core", true),
  bone("arm.r.forearm_twist_01", "R_ForearmTwist01", "arm.r.forearm", "twist", false),
  bone("arm.r.forearm_twist_02", "R_ForearmTwist02", "arm.r.forearm_twist_01", "twist", false),
  bone("arm.r.upper_twist_01", "R_UpperarmTwist01", "arm.r.upper", "twist", false),
  bone("arm.r.upper_twist_02", "R_UpperarmTwist02", "arm.r.upper_twist_01", "twist", false),

  bone("tail.01", "Tail01", "pelvis", "tail", false, "tiger"),
  bone("tail.02", "Tail02", "tail.01", "tail", false, "tiger"),
  bone("tail.03", "Tail03", "tail.02", "tail", false, "tiger"),
  bone("tail.04", "Tail04", "tail.03", "tail", false, "tiger"),
] as const;

export const FOREST_COURIER_ACTION_CONTRACT = {
  idle: { loop: "repeat", syncGroup: "locomotion", rootMotion: "in_place", headLiftDegrees: 18 },
  walk: { loop: "repeat", syncGroup: "locomotion", rootMotion: "in_place", headLiftDegrees: 18 },
  run: { loop: "repeat", syncGroup: "locomotion", rootMotion: "in_place", headLiftDegrees: 42 },
  jump: { loop: "once", syncGroup: "airborne", rootMotion: "gameplay", headLiftDegrees: 10 },
  walk_jump: { loop: "once", syncGroup: "airborne", rootMotion: "gameplay", headLiftDegrees: 10 },
  run_jump: { loop: "once", syncGroup: "airborne", rootMotion: "gameplay", headLiftDegrees: 10 },
} as const satisfies Record<ForestCourierActionId, {
  loop: "repeat" | "once";
  syncGroup: "locomotion" | "airborne";
  rootMotion: "in_place" | "gameplay";
  headLiftDegrees: number;
}>;

export type ForestCourierRigProfileId = "rabbit" | "fox" | "tiger";

/**
 * Existing assets keep clips authored for their own bind axes. The game-facing
 * action ids stay shared even though the internal GLB clip names are custom.
 */
export const FOREST_COURIER_CHARACTER_ACTION_CLIPS = {
  rabbit: {
    idle: "preset:biped:idle",
    walk: "preset:biped:walk",
    run: "preset:biped:run",
    jump: "preset:biped:jump",
    walk_jump: "preset:biped:jump",
    run_jump: "preset:biped:jump",
  },
  fox: {
    idle: "CombatIdle",
    walk: "Walk",
    run: "Run",
    jump: "RunJump",
    walk_jump: "RunJump",
    run_jump: "RunJump",
  },
  tiger: {
    idle: "jump",
    walk: "walk",
    run: "run",
    jump: "jump",
    walk_jump: "jump",
    run_jump: "run_jump",
  },
} as const satisfies Record<ForestCourierRigProfileId, Partial<Record<ForestCourierActionId, string>>>;

export type ForestCourierRigProfile = {
  id: ForestCourierRigProfileId;
  label: string;
  modelUrl: string;
  /** Canonical semantic bone id -> bone name in this asset. */
  bones: Partial<Record<ForestCourierBoneId, string>>;
  groundBones: readonly string[];
  tailBones: readonly string[];
};

const rabbitBones = Object.fromEntries(
  FOREST_COURIER_BONES
    .filter((definition) => definition.source === "rabbit")
    .map((definition) => [definition.id, definition.name]),
) as Partial<Record<ForestCourierBoneId, string>>;

export const FOREST_COURIER_RIG_PROFILES: Readonly<Record<ForestCourierRigProfileId, ForestCourierRigProfile>> = {
  rabbit: {
    id: "rabbit",
    label: "Rabbit · canonical master",
    modelUrl: FOREST_COURIER_MASTER_MODEL_URL,
    bones: rabbitBones,
    groundBones: ["L_ToeBase", "R_ToeBase", "L_Foot", "R_Foot"],
    tailBones: [],
  },
  fox: {
    id: "fox",
    label: "Fox · legacy bridge",
    modelUrl: "/models/characters/fox-tpose/fox-courier-rigged-runtime.glb",
    bones: {
      root: "root", pelvis: "hips",
      "body.waist": "spine_01", "body.spine_01": "spine_02", "body.spine_02": "chest",
      "body.neck_01": "neck", "body.head": "head",
      "arm.l.clavicle": "clavicle_L", "arm.l.upper": "upper_arm_L", "arm.l.forearm": "lower_arm_L", "arm.l.hand": "hand_L",
      "arm.r.clavicle": "clavicle_R", "arm.r.upper": "upper_arm_R", "arm.r.forearm": "lower_arm_R", "arm.r.hand": "hand_R",
      "leg.l.thigh": "thigh_L", "leg.l.calf": "shin_L", "leg.l.foot": "foot_L", "leg.l.toe": "toe_L",
      "leg.r.thigh": "thigh_R", "leg.r.calf": "shin_R", "leg.r.foot": "foot_R", "leg.r.toe": "toe_R",
      "tail.01": "tail_01", "tail.02": "tail_02", "tail.03": "tail_03", "tail.04": "tail_04",
    },
    groundBones: ["toe_L", "toe_R", "foot_L", "foot_R"],
    tailBones: ["tail_01", "tail_02", "tail_03", "tail_04", "tail_05", "tail_06"],
  },
  tiger: {
    id: "tiger",
    label: "Tiger · tail reference bridge",
    modelUrl: "/models/characters/tiger-tpose/tiger-courier-rigged-runtime.glb",
    bones: {
      pelvis: "hips", "body.spine_01": "spine", "body.spine_02": "chest",
      "body.neck_01": "neck", "body.head": "head",
      "arm.l.clavicle": "shoulder.L", "arm.l.upper": "upper_arm.L", "arm.l.forearm": "forearm.L", "arm.l.hand": "hand.L",
      "arm.r.clavicle": "shoulder.R", "arm.r.upper": "upper_arm.R", "arm.r.forearm": "forearm.R", "arm.r.hand": "hand.R",
      "leg.l.thigh": "thigh.L", "leg.l.calf": "shin.L", "leg.l.foot": "foot.L", "leg.l.toe": "toe.L",
      "leg.r.thigh": "thigh.R", "leg.r.calf": "shin.R", "leg.r.foot": "foot.R", "leg.r.toe": "toe.R",
      "tail.01": "tail.01", "tail.02": "tail.02", "tail.03": "tail.03", "tail.04": "tail.04",
    },
    groundBones: ["toe.L", "toe.R", "foot.L", "foot.R"],
    tailBones: ["tail.01", "tail.02", "tail.03", "tail.04"],
  },
};

export type ForestCourierRigValidation = {
  profileId: ForestCourierRigProfileId;
  compatible: boolean;
  mappedBoneCount: number;
  mappedCoreCount: number;
  mappedTailCount: number;
  missingAssetBones: string[];
  missingRequiredMappings: ForestCourierBoneId[];
  extensionBones: string[];
};

/** Match Three.js GLTFLoader's runtime node-name sanitization. */
export function forestCourierRuntimeBoneName(name: string) {
  return name.replace(/\s/g, "_").replace(/[\[\]\.:/]/g, "");
}

export function validateForestCourierRig(
  profile: ForestCourierRigProfile,
  assetBoneNames: Iterable<string>,
): ForestCourierRigValidation {
  const available = new Set(assetBoneNames);
  const declaredTargets = new Set(Object.values(profile.bones).filter((name): name is string => Boolean(name)));
  const missingAssetBones = [...declaredTargets].filter((name) => !available.has(name)).sort();
  const missingRequiredMappings = FOREST_COURIER_BONES
    .filter((definition) => definition.requiredForConsumer && !profile.bones[definition.id])
    .map((definition) => definition.id);
  const mappedDefinitions = FOREST_COURIER_BONES.filter((definition) => {
    const target = profile.bones[definition.id];
    return Boolean(target && available.has(target));
  });
  return {
    profileId: profile.id,
    compatible: missingAssetBones.length === 0 && missingRequiredMappings.length === 0,
    mappedBoneCount: mappedDefinitions.length,
    mappedCoreCount: mappedDefinitions.filter((definition) => definition.channel === "core").length,
    mappedTailCount: mappedDefinitions.filter((definition) => definition.channel === "tail").length,
    missingAssetBones,
    missingRequiredMappings,
    extensionBones: [...available].filter((name) => !declaredTargets.has(name)).sort(),
  };
}

/** Map a target asset's bone names to the rabbit master bone names. Tail bones are excluded until the canonical tail tracks are baked. */
export function buildTargetToRabbitBoneMap(profile: ForestCourierRigProfile) {
  const mapping: Record<string, string> = {};
  for (const definition of FOREST_COURIER_BONES) {
    if (definition.source !== "rabbit") continue;
    const targetBone = profile.bones[definition.id];
    if (targetBone) {
      mapping[forestCourierRuntimeBoneName(targetBone)] = forestCourierRuntimeBoneName(definition.name);
    }
  }
  return mapping;
}

export function normalizeForestCourierActionName(name: string): ForestCourierActionId | null {
  const normalized = name.toLowerCase().replace(/[\s:-]+/g, "_");
  if (normalized.includes("walk") && normalized.includes("jump")) return "walk_jump";
  if (normalized.includes("run") && normalized.includes("jump")) return "run_jump";
  if (normalized.includes("idle") || normalized.includes("wait")) return "idle";
  if (normalized.includes("walk")) return "walk";
  if (normalized.includes("jump")) return "jump";
  if (normalized.includes("run")) return "run";
  return null;
}
