import * as THREE from "three";
import type { Season } from "./types";

type SkyPalette = {
  zenith: number;
  horizon: number;
  haze: number;
  cloud: number;
  sun: number;
};

const SKY_PALETTES: Record<Season, SkyPalette> = {
  spring: { zenith: 0x8db6c4, horizon: 0xe9eee3, haze: 0xf3d9ae, cloud: 0xf6f4e8, sun: 0xffd798 },
  summer: { zenith: 0x75a6b8, horizon: 0xdde9dc, haze: 0xefd3a4, cloud: 0xf3f3e6, sun: 0xffd089 },
  autumn: { zenith: 0x9aaeb3, horizon: 0xeee2cf, haze: 0xf2c68d, cloud: 0xf5ead8, sun: 0xffc779 },
};

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uCloud;
  uniform vec3 uSun;
  uniform vec3 uSunDirection;
  uniform float uCloudAmount;

  varying vec3 vWorldPosition;

  float hash(vec2 point) {
    return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    return mix(
      mix(hash(cell), hash(cell + vec2(1.0, 0.0)), local.x),
      mix(hash(cell + vec2(0.0, 1.0)), hash(cell + vec2(1.0, 1.0)), local.x),
      local.y
    );
  }

  float cloudNoise(vec2 point) {
    float value = noise(point) * 0.58;
    value += noise(point * 2.07 + 9.2) * 0.28;
    value += noise(point * 4.13 - 4.7) * 0.14;
    return value;
  }

  void main() {
    vec3 direction = normalize(vWorldPosition - cameraPosition);
    float altitude = clamp(direction.y, 0.0, 1.0);
    float skyMix = pow(altitude, 0.42);
    vec3 color = mix(uHorizon, uZenith, skyMix);

    // A warm, misty strip makes the procedural sky meet the world fog without
    // producing a hard horizon line behind the distant trees and mountains.
    float horizonGlow = exp(-altitude * 9.0);
    color = mix(color, uHaze, horizonGlow * 0.24);

    float sunAlignment = max(dot(direction, normalize(uSunDirection)), 0.0);
    float sunGlow = pow(sunAlignment, 28.0);
    float sunDisc = pow(sunAlignment, 1050.0);
    color += uSun * (sunGlow * 0.17 + sunDisc * 0.72);

    // Three inexpensive noise octaves form broad, translucent cloud veils.
    // They stay subtle so the canopy remains the visual focus.
    float azimuth = atan(direction.z, direction.x) / 6.2831853 + 0.5;
    vec2 cloudUv = vec2(azimuth * 7.0, altitude * 8.5);
    float cloudBand = smoothstep(0.035, 0.13, altitude) * (1.0 - smoothstep(0.54, 0.76, altitude));
    float clouds = smoothstep(0.56, 0.73, cloudNoise(cloudUv)) * cloudBand * 0.22 * uCloudAmount;
    color = mix(color, uCloud, clouds);

    gl_FragColor = vec4(color, 1.0);
  }
`;

export class ProceduralSky {
  readonly mesh: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  constructor(season: Season) {
    const palette = SKY_PALETTES[season];
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uZenith: { value: new THREE.Color(palette.zenith) },
        uHorizon: { value: new THREE.Color(palette.horizon) },
        uHaze: { value: new THREE.Color(palette.haze) },
        uCloud: { value: new THREE.Color(palette.cloud) },
        uSun: { value: new THREE.Color(palette.sun) },
        uSunDirection: { value: new THREE.Vector3(-28, 48, 22).normalize() },
        uCloudAmount: { value: 1 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
    this.mesh.scale.setScalar(1500);
    this.mesh.renderOrder = -1000;
    this.mesh.frustumCulled = false;
  }

  setSeason(season: Season) {
    const palette = SKY_PALETTES[season];
    this.mesh.material.uniforms.uZenith.value.set(palette.zenith);
    this.mesh.material.uniforms.uHorizon.value.set(palette.horizon);
    this.mesh.material.uniforms.uHaze.value.set(palette.haze);
    this.mesh.material.uniforms.uCloud.value.set(palette.cloud);
    this.mesh.material.uniforms.uSun.value.set(palette.sun);
  }

  setClear(clear: boolean) {
    this.mesh.material.uniforms.uCloudAmount.value = clear ? 0.04 : 1;
  }

  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}
