import * as THREE from "three";

export type CityMaterialBatchKeyOptions = Readonly<{
  includeDiffuseColor?: boolean;
}>;

export const PHYSICAL_PROPERTY_MANIFEST = Object.freeze([
  "allowOverride", "alphaHash", "alphaMap", "alphaTest", "alphaToCoverage",
  "anisotropy", "anisotropyMap", "anisotropyRotation", "aoMap", "aoMapIntensity",
  "attenuationColor", "attenuationDistance", "blendAlpha", "blendColor", "blendDst",
  "blendDstAlpha", "blendEquation", "blendEquationAlpha", "blendSrc", "blendSrcAlpha",
  "blending", "bumpMap", "bumpScale", "clearcoat", "clearcoatMap", "clearcoatNormalMap",
  "clearcoatNormalScale", "clearcoatRoughness", "clearcoatRoughnessMap", "clipIntersection",
  "clipShadows", "clippingPlanes", "color", "colorWrite", "defines", "depthFunc",
  "depthTest", "depthWrite", "dispersion", "displacementBias", "displacementMap",
  "displacementScale", "dithering", "emissive", "emissiveIntensity", "emissiveMap",
  "envMap", "envMapIntensity", "envMapRotation", "flatShading", "fog", "forceSinglePass",
  "ior", "iridescence", "iridescenceIOR", "iridescenceMap", "iridescenceThicknessMap",
  "iridescenceThicknessRange", "isMaterial", "isMeshPhysicalMaterial", "isMeshStandardMaterial",
  "lightMap", "lightMapIntensity", "map", "metalness", "metalnessMap", "name", "needsUpdate",
  "normalMap", "normalMapType", "normalScale", "opacity", "polygonOffset",
  "polygonOffsetFactor", "polygonOffsetUnits", "precision", "premultipliedAlpha", "roughness",
  "roughnessMap", "shadowSide", "sheen", "sheenColor", "sheenColorMap", "sheenRoughness",
  "sheenRoughnessMap", "side", "specularColor", "specularColorMap", "specularIntensity",
  "specularIntensityMap", "stencilFail", "stencilFunc", "stencilFuncMask", "stencilRef",
  "stencilWrite", "stencilWriteMask", "stencilZFail", "stencilZPass", "thickness",
  "thicknessMap", "toneMapped", "transmission", "transmissionMap", "transparent", "type",
  "userData", "uuid", "version", "vertexColors", "visible", "wireframe", "wireframeLinecap",
  "wireframeLinejoin", "wireframeLinewidth",
] as const);

const SUPPORTED_TYPES = new Set([
  "MeshBasicMaterial",
  "MeshPhongMaterial",
  "MeshStandardMaterial",
  "MeshPhysicalMaterial",
]);

const COMMON_ENCODED_PROPERTIES = new Set([
  "alphaMap", "alphaTest", "aoMap", "blending", "color", "depthTest", "depthWrite", "emissive",
  "emissiveIntensity", "emissiveMap", "envMap", "flatShading", "lightMap", "map", "metalness",
  "metalnessMap", "normalMap", "opacity", "premultipliedAlpha", "roughness", "roughnessMap", "side",
  "shininess", "specular", "toneMapped", "transparent", "type", "vertexColors", "wireframe",
]);

const PHYSICAL_ENCODED_PROPERTIES = new Set([
  "attenuationColor", "clearcoat", "clearcoatMap", "clearcoatNormalMap", "clearcoatRoughness",
  "clearcoatRoughnessMap", "ior", "iridescence", "iridescenceMap", "sheen", "sheenColor",
  "sheenColorMap", "sheenRoughnessMap", "specularColor", "specularColorMap", "specularIntensity",
  "specularIntensityMap", "thickness", "thicknessMap", "transmission", "transmissionMap",
]);

const DIAGNOSTIC_PROPERTIES = new Set([
  "isMaterial", "isMeshPhysicalMaterial", "isMeshStandardMaterial", "name", "needsUpdate", "type",
  "userData", "uuid", "version",
]);

const DEFAULTS: Readonly<Record<string, THREE.Material>> = Object.freeze({
  MeshBasicMaterial: new THREE.MeshBasicMaterial(),
  MeshPhongMaterial: new THREE.MeshPhongMaterial(),
  MeshStandardMaterial: new THREE.MeshStandardMaterial(),
  MeshPhysicalMaterial: new THREE.MeshPhysicalMaterial(),
});

function textureIdentity(value: unknown) {
  return value instanceof THREE.Texture ? value.uuid : "";
}

function encodeComparable(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "number") return Number.isNaN(value) ? "NaN" : String(value);
  if (typeof value === "string" || typeof value === "boolean") return String(value);
  if (value instanceof THREE.Texture) return `texture:${value.uuid}`;
  if (value instanceof THREE.Color) return `color:${value.getHexString()}`;
  if (value instanceof THREE.Vector2) return `vector2:${value.x},${value.y}`;
  if (value instanceof THREE.Vector3) return `vector3:${value.x},${value.y},${value.z}`;
  if (value instanceof THREE.Vector4) return `vector4:${value.x},${value.y},${value.z},${value.w}`;
  if (value instanceof THREE.Euler) return `euler:${value.x},${value.y},${value.z},${value.order}`;
  if (Array.isArray(value)) return `array:[${value.map(encodeComparable).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `object:{${entries.map(([key, nested]) => `${key}:${encodeComparable(nested)}`).join(",")}}`;
  }
  return typeof value;
}

function hasUnsupportedNonDefaultState(material: THREE.Material) {
  const baseline = DEFAULTS[material.type] as unknown as Record<string, unknown> | undefined;
  if (!baseline) return true;
  const candidate = material as unknown as Record<string, unknown>;
  const properties = material.type === "MeshPhysicalMaterial"
    ? PHYSICAL_PROPERTY_MANIFEST
    : Object.keys(baseline).filter((name) => !name.startsWith("_"));
  for (const property of properties) {
    if (COMMON_ENCODED_PROPERTIES.has(property)
      || (material.type === "MeshPhysicalMaterial" && PHYSICAL_ENCODED_PROPERTIES.has(property))
      || DIAGNOSTIC_PROPERTIES.has(property)) continue;
    if (encodeComparable(candidate[property]) !== encodeComparable(baseline[property])) return true;
  }
  return false;
}

export function observedPhysicalMaterialProperties() {
  const material = DEFAULTS.MeshPhysicalMaterial;
  const names = new Set(Object.keys(material).filter((name) => !name.startsWith("_")));
  for (let prototype = Object.getPrototypeOf(material);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (descriptor?.get || descriptor?.set) names.add(name);
    }
  }
  return Object.freeze([...names].sort());
}

export function encodeCityMaterialBatchKey(
  material: THREE.Material,
  options: CityMaterialBatchKeyOptions = {},
) {
  if (!SUPPORTED_TYPES.has(material.type) || hasUnsupportedNonDefaultState(material)) return null;
  const includeDiffuseColor = options.includeDiffuseColor ?? true;
  const visual = material as THREE.Material & {
    color?: THREE.Color;
    emissive?: THREE.Color;
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
    shininess?: number;
    specular?: THREE.Color;
    map?: THREE.Texture | null;
    normalMap?: THREE.Texture | null;
    roughnessMap?: THREE.Texture | null;
    metalnessMap?: THREE.Texture | null;
    emissiveMap?: THREE.Texture | null;
    alphaMap?: THREE.Texture | null;
    aoMap?: THREE.Texture | null;
    lightMap?: THREE.Texture | null;
    envMap?: THREE.Texture | null;
    flatShading?: boolean;
    wireframe?: boolean;
  };
  const fields: Array<string | number> = [
    material.type,
    includeDiffuseColor ? visual.color?.getHexString() ?? "" : "<instance-color>",
    visual.emissive?.getHexString() ?? "",
    visual.emissiveIntensity ?? "",
    visual.roughness ?? "",
    visual.metalness ?? "",
    visual.shininess ?? "",
    visual.specular?.getHexString() ?? "",
    material.opacity,
    Number(material.transparent),
    material.alphaTest,
    material.side,
    Number(material.depthTest),
    Number(material.depthWrite),
    material.blending,
    Number(material.premultipliedAlpha),
    Number(material.vertexColors),
    Number(material.toneMapped),
    Number(visual.flatShading),
    Number(visual.wireframe),
    textureIdentity(visual.map),
    textureIdentity(visual.normalMap),
    textureIdentity(visual.roughnessMap),
    textureIdentity(visual.metalnessMap),
    textureIdentity(visual.emissiveMap),
    textureIdentity(visual.alphaMap),
    textureIdentity(visual.aoMap),
    textureIdentity(visual.lightMap),
    textureIdentity(visual.envMap),
    material.customProgramCacheKey(),
  ];
  if (material instanceof THREE.MeshPhysicalMaterial) {
    fields.push(
      "physical",
      material.transmission,
      material.ior,
      material.thickness,
      material.clearcoat,
      material.clearcoatRoughness,
      material.iridescence,
      material.sheen,
      material.specularIntensity,
      material.attenuationColor.getHexString(),
      material.sheenColor.getHexString(),
      material.specularColor.getHexString(),
      textureIdentity(material.transmissionMap),
      textureIdentity(material.thicknessMap),
      textureIdentity(material.clearcoatMap),
      textureIdentity(material.clearcoatNormalMap),
      textureIdentity(material.clearcoatRoughnessMap),
      textureIdentity(material.sheenColorMap),
      textureIdentity(material.sheenRoughnessMap),
      textureIdentity(material.iridescenceMap),
      textureIdentity(material.specularIntensityMap),
      textureIdentity(material.specularColorMap),
    );
  }
  return fields.join("|");
}

export function cityMaterialBatchKey(
  material: THREE.Material,
  options: CityMaterialBatchKeyOptions = {},
) {
  return encodeCityMaterialBatchKey(material, options) ?? `identity:${material.uuid}`;
}
