#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  FOREST_COURIER_BASE_ACTION_IDS,
  FOREST_COURIER_BONES,
  FOREST_COURIER_CHARACTER_ACTION_CLIPS,
  FOREST_COURIER_RIG_PROFILES,
  FOREST_COURIER_RIG_VERSION,
  normalizeForestCourierActionName,
  validateForestCourierRig,
} from "../app/lib/animation/forestCourierRig.ts";

function readGlbJson(buffer, file) {
  if (buffer.toString("utf8", 0, 4) !== "glTF") throw new Error(`${file} is not a binary glTF`);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.toString("utf8", offset + 8, offset + 8 + length).replace(/\u0000+$/, ""));
    }
    offset += 8 + length;
  }
  throw new Error(`${file} has no JSON chunk`);
}

async function inspectProfile(profile) {
  const file = path.join(process.cwd(), "public", profile.modelUrl.replace(/^\//, ""));
  const json = readGlbJson(await readFile(file), file);
  const jointIndexes = json.skins?.flatMap((skin) => skin.joints ?? []) ?? [];
  const boneNames = [...new Set(jointIndexes.map((index) => json.nodes?.[index]?.name).filter(Boolean))];
  const animationDetails = (json.animations ?? []).map((animation, index) => ({
    name: animation.name ?? `animation_${index}`,
    tailRotationChannels: (animation.channels ?? []).filter((channel) => {
      const nodeName = json.nodes?.[channel.target?.node]?.name ?? "";
      return profile.tailBones.includes(nodeName) && channel.target?.path === "rotation";
    }).length,
  }));
  return {
    ...validateForestCourierRig(profile, boneNames),
    file: path.relative(process.cwd(), file),
    assetBoneCount: boneNames.length,
    animations: animationDetails.map((animation) => animation.name),
    animationDetails,
  };
}

const reports = await Promise.all(Object.values(FOREST_COURIER_RIG_PROFILES).map(inspectProfile));
const rabbitReport = reports.find((report) => report.profileId === "rabbit");
const tigerReport = reports.find((report) => report.profileId === "tiger");
const rabbitMasterActions = new Set(
  rabbitReport?.animations.map(normalizeForestCourierActionName).filter(Boolean) ?? [],
);
const missingRabbitMasterActions = FOREST_COURIER_BASE_ACTION_IDS.filter((actionId) => !rabbitMasterActions.has(actionId));
const tigerTailActions = ["walk", "run", "jump"].filter((actionId) => {
  const animation = tigerReport?.animationDetails.find((candidate) => candidate.name.toLowerCase() === actionId);
  return animation && animation.tailRotationChannels >= 4;
});
const missingTigerTailActions = ["walk", "run", "jump"].filter((actionId) => !tigerTailActions.includes(actionId));
const unifiedActionSourcesCompatible = missingRabbitMasterActions.length === 0 && missingTigerTailActions.length === 0;
const missingRuntimeClips = reports.flatMap((report) => {
  const declared = FOREST_COURIER_CHARACTER_ACTION_CLIPS[report.profileId];
  return Object.entries(declared)
    .filter(([, clipName]) => !report.animations.includes(clipName))
    .map(([actionId, clipName]) => `${report.profileId}.${actionId}:${clipName}`);
});
const runtimeClipsCompatible = missingRuntimeClips.length === 0;
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    version: FOREST_COURIER_RIG_VERSION,
    canonicalBoneCount: FOREST_COURIER_BONES.length,
    unifiedActionSourcesCompatible,
    runtimeClipsCompatible,
    missingRuntimeClips,
    missingRabbitMasterActions,
    missingTigerTailActions,
    reports,
  }, null, 2));
} else {
  console.log(`ForestCourierRig ${FOREST_COURIER_RIG_VERSION} · ${FOREST_COURIER_BONES.length} canonical bones`);
  console.log(
    `${runtimeClipsCompatible ? "PASS" : "FAIL"} runtime-actions rabbit=6 fox=6 tiger=6`,
  );
  console.log(
    `${unifiedActionSourcesCompatible ? "PASS" : "FAIL"} offline-master rabbit-body=${rabbitMasterActions.size}/4 tiger-tail=${tigerTailActions.length}/3`,
  );
  for (const report of reports) {
    const state = report.compatible ? "PASS" : "FAIL";
    console.log(
      `${state.padEnd(4)} ${report.profileId.padEnd(6)} asset=${String(report.assetBoneCount).padStart(2)} mapped=${String(report.mappedBoneCount).padStart(2)} core=${String(report.mappedCoreCount).padStart(2)} tail=${report.mappedTailCount} actions=${report.animations.length}`,
    );
    if (report.missingRequiredMappings.length) console.log(`     missing semantic mappings: ${report.missingRequiredMappings.join(", ")}`);
    if (report.missingAssetBones.length) console.log(`     mapped names absent from asset: ${report.missingAssetBones.join(", ")}`);
    if (report.extensionBones.length) console.log(`     local extension bones: ${report.extensionBones.join(", ")}`);
  }
}

if (!runtimeClipsCompatible || !unifiedActionSourcesCompatible || reports.some((report) => !report.compatible)) process.exitCode = 1;
