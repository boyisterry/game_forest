import * as THREE from "three";

export const RIDER_CONTACT_SHADOW_SURFACE_OFFSET_METERS = 0.018;
export const RIDER_CONTACT_SHADOW_FADE_START_METERS = 0.18;
export const RIDER_CONTACT_SHADOW_FADE_END_METERS = 1.35;
export const RIDER_CONTACT_SHADOW_BASE_OPACITY = 0.42;

// The city sun sits at (-28, 48, 22) relative to its focus. A cast shadow
// extends along the opposite horizontal direction and must not depend on a
// cached DirectionalLight whose transform only changes on shadow refreshes.
export const CITY_RIDER_SHADOW_DIRECTION = Object.freeze({ x: 28, y: 0, z: -22 });

export type RiderContactShadowInput = Readonly<{
  enabled: boolean;
  riderVisible: boolean;
  riderX: number;
  riderY: number;
  riderZ: number;
  surfaceHeight: number;
  surfaceNormalX: number;
  surfaceNormalY: number;
  surfaceNormalZ: number;
}>;

export type RiderContactShadowPose = Readonly<{
  visible: boolean;
  opacity: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  airHeight: number;
}>;

const fallbackNormal = new THREE.Vector3(0, 1, 0);
const sunDirection = new THREE.Vector3(
  CITY_RIDER_SHADOW_DIRECTION.x,
  CITY_RIDER_SHADOW_DIRECTION.y,
  CITY_RIDER_SHADOW_DIRECTION.z,
).normalize();

type MutableRiderContactShadowPose = {
  visible: boolean;
  opacity: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
  airHeight: number;
};

type RiderContactShadowScratch = {
  normal: THREE.Vector3;
  longAxis: THREE.Vector3;
  shortAxis: THREE.Vector3;
  basis: THREE.Matrix4;
};

function createPoseStorage(): MutableRiderContactShadowPose {
  return {
    visible: false,
    opacity: 0,
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    airHeight: Infinity,
  };
}

function createScratch(): RiderContactShadowScratch {
  return {
    normal: new THREE.Vector3(),
    longAxis: new THREE.Vector3(),
    shortAxis: new THREE.Vector3(),
    basis: new THREE.Matrix4(),
  };
}

function smoothstep01(value: number) {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function writeRiderContactShadowPose(
  input: RiderContactShadowInput,
  pose: MutableRiderContactShadowPose,
  scratch: RiderContactShadowScratch,
): MutableRiderContactShadowPose {
  const finite = Number.isFinite(input.riderX)
    && Number.isFinite(input.riderY)
    && Number.isFinite(input.riderZ)
    && Number.isFinite(input.surfaceHeight)
    && Number.isFinite(input.surfaceNormalX)
    && Number.isFinite(input.surfaceNormalY)
    && Number.isFinite(input.surfaceNormalZ);
  const normal = finite
    ? scratch.normal.set(
      input.surfaceNormalX,
      input.surfaceNormalY,
      input.surfaceNormalZ,
    ).normalize()
    : scratch.normal.copy(fallbackNormal);
  if (normal.lengthSq() < 0.5 || normal.y <= 0.05) normal.copy(fallbackNormal);

  const airHeight = finite ? Math.max(0, input.riderY - input.surfaceHeight) : Infinity;
  const fade = 1 - smoothstep01(
    (airHeight - RIDER_CONTACT_SHADOW_FADE_START_METERS)
      / (RIDER_CONTACT_SHADOW_FADE_END_METERS - RIDER_CONTACT_SHADOW_FADE_START_METERS),
  );
  const visible = input.enabled && input.riderVisible && finite && fade > 0.001;

  const longAxis = scratch.longAxis.copy(sunDirection).addScaledVector(normal, -sunDirection.dot(normal));
  if (longAxis.lengthSq() < 1e-6) longAxis.set(0, 0, -1).addScaledVector(normal, normal.z);
  longAxis.normalize();
  const shortAxis = scratch.shortAxis.crossVectors(longAxis, normal).normalize();
  scratch.basis.makeBasis(shortAxis, longAxis, normal);
  const offset = 0.28 + Math.min(airHeight, RIDER_CONTACT_SHADOW_FADE_END_METERS) * 0.16;
  pose.position.set(input.riderX, input.surfaceHeight, input.riderZ)
    .addScaledVector(longAxis, offset)
    .addScaledVector(normal, RIDER_CONTACT_SHADOW_SURFACE_OFFSET_METERS);
  pose.visible = visible;
  pose.opacity = RIDER_CONTACT_SHADOW_BASE_OPACITY * fade;
  pose.quaternion.setFromRotationMatrix(scratch.basis);
  pose.scale.set(
    1.5 + Math.min(airHeight, 1) * 0.12,
    3.05 + Math.min(airHeight, 1) * 0.4,
    1,
  );
  pose.airHeight = airHeight;
  return pose;
}

export function computeRiderContactShadowPose(
  input: RiderContactShadowInput,
): RiderContactShadowPose {
  return Object.freeze(writeRiderContactShadowPose(input, createPoseStorage(), createScratch()));
}

export type RiderContactShadow = Readonly<{
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  update(input: RiderContactShadowInput): RiderContactShadowPose;
  dispose(): void;
}>;

export function createRiderContactShadow(): RiderContactShadow {
  const geometry = new THREE.PlaneGeometry(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      shadowColor: { value: new THREE.Color(0x101820) },
      opacity: { value: RIDER_CONTACT_SHADOW_BASE_OPACITY },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 shadowColor;
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        vec2 centered = (vUv - 0.5) * 2.0;
        float radius = length(centered);
        float falloff = 1.0 - smoothstep(0.08, 1.0, radius);
        falloff *= falloff;
        if (falloff <= 0.001) discard;
        gl_FragColor = vec4(shadowColor, opacity * falloff);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "rider-contact-shadow";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 4;
  mesh.visible = false;
  const pose = createPoseStorage();
  const scratch = createScratch();

  return Object.freeze({
    mesh,
    update(input) {
      writeRiderContactShadowPose(input, pose, scratch);
      mesh.visible = pose.visible;
      mesh.position.copy(pose.position);
      mesh.quaternion.copy(pose.quaternion);
      mesh.scale.copy(pose.scale);
      material.uniforms.opacity.value = pose.opacity;
      return pose;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  });
}
