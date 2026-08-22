import * as THREE from "three";

/** Authored scooter tire radius after the rider GLB is normalized to 2.4m. */
export const RIDER_WHEEL_RADIUS_METERS = 0.22;

// Source-geometry coordinates, before the GLB node's 0.5 scale and the
// ForestScene model normalization/rotation are applied.
const FRONT_WHEEL_CENTER = Object.freeze({ x: 0.6249, y: -0.7684, z: 0 });
const REAR_WHEEL_CENTER = Object.freeze({ x: -0.5115, y: -0.7828, z: 0 });
const WHEEL_REGION_RADIUS = 0.315;
const WHEEL_COMPONENT_MEAN_RADIUS_MAX = 0.275;
const WHEEL_COMPONENT_CENTER_Z_MAX = 0.155;
const WHEEL_REGION_HALF_WIDTH = 0.235;
const TAU = Math.PI * 2;

// The production rider is a single, disconnected-component mesh. These roots
// identify only the authored rubber-tire fragments in that archival GLB. Nearby
// islands (fork, reflectors, fenders, drivetrain and mud flap) deliberately stay
// in the static body mesh. The geometry-size guard makes a changed asset fall
// back to the spatial classifier instead of applying stale vertex identifiers.
const PRODUCTION_POSITION_COUNT = 150884;
const PRODUCTION_INDEX_COUNT = 775398;
const PRODUCTION_WHEEL_ROOTS: Readonly<Record<WheelId, ReadonlySet<number>>> = {
  front: new Set([110281, 111543, 112116]),
  rear: new Set([117961, 117863, 99078, 97860, 117937, 92109, 117243]),
};

type WheelId = "front" | "rear";
type WheelCenter = Readonly<{ x: number; y: number; z: number }>;

type ComponentStats = {
  count: number;
  sumRadius: number;
  maxRadius: number;
  minZ: number;
  maxZ: number;
};

export type RiderWheelMotionState = Readonly<{
  spinRadians: number;
  angularSpeedRadiansPerSecond: number;
  steerRadians: number;
  frontTriangles: number;
  rearTriangles: number;
}>;

type ExtractedWheel = Readonly<{
  rotor: THREE.Group;
  triangles: number;
}>;

/** Keep long sessions numerically stable without introducing a visible snap. */
export function wrapWheelAngle(angle: number) {
  const wrapped = angle % TAU;
  return wrapped < -Math.PI ? wrapped + TAU : wrapped > Math.PI ? wrapped - TAU : wrapped;
}

/**
 * The authored mesh rolls around source-local Z. Keep the negative sign here:
 * it is the corrected direction for the visible near side of the scooter.
 */
export function advanceWheelAngle(angle: number, speed: number, dt: number) {
  if (!Number.isFinite(angle) || !Number.isFinite(speed) || !Number.isFinite(dt) || dt <= 0) {
    return wrapWheelAngle(angle || 0);
  }
  return wrapWheelAngle(angle - (speed * dt) / RIDER_WHEEL_RADIUS_METERS);
}

function findRiderSourceMesh(model: THREE.Object3D) {
  let source: THREE.Mesh | null = null;
  let largestIndexCount = -1;
  model.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) return;
    const indexCount = object.geometry.index?.count ?? object.geometry.getAttribute("position")?.count ?? 0;
    if (indexCount <= largestIndexCount) return;
    source = object;
    largestIndexCount = indexCount;
  });
  return source as THREE.Mesh | null;
}

function classifyComponent(stats: ComponentStats, center: WheelCenter) {
  if (stats.count === 0) return false;
  const meanRadius = stats.sumRadius / stats.count;
  const centerZ = (stats.minZ + stats.maxZ) * 0.5;
  return stats.maxRadius <= WHEEL_REGION_RADIUS
    && meanRadius <= WHEEL_COMPONENT_MEAN_RADIUS_MAX
    && Math.abs(centerZ - center.z) <= WHEEL_COMPONENT_CENTER_Z_MAX
    && stats.minZ >= center.z - WHEEL_REGION_HALF_WIDTH
    && stats.maxZ <= center.z + WHEEL_REGION_HALF_WIDTH;
}

function createCompleteTireGeometry() {
  const majorRadius = 0.181;
  const tubeRadius = 0.049;
  const geometry = new THREE.TorusGeometry(majorRadius, tubeRadius, 16, 64);
  const position = geometry.getAttribute("position");

  // The source tire is made from view-dependent fragments and develops holes
  // when rotated. Replace those fragments with one closed tire surface. Its
  // shallow, same-colour tread is part of the rubber itself—no overlay blocks,
  // reflectors or decorative meshes are added.
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    let x = position.getX(vertex);
    let y = position.getY(vertex);
    let z = position.getZ(vertex) * 1.24;
    const radius = Math.hypot(x, y);
    const theta = Math.atan2(y, x);
    const treadZone = THREE.MathUtils.smoothstep(
      radius,
      majorRadius + tubeRadius * 0.38,
      majorRadius + tubeRadius,
    );
    const treadWave = Math.max(0, Math.sin(theta * 18 + z * 28));
    const bump = treadZone * treadWave ** 8 * 0.004;
    if (radius > 0) {
      const scale = (radius + bump) / radius;
      x *= scale;
      y *= scale;
    }
    position.setXYZ(vertex, x, y, z);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function createRubberTreadTexture() {
  const width = 128;
  const height = 32;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const tubeAngle = (y / height) * TAU;
    const onOuterTread = Math.cos(tubeAngle) > 0.16;
    for (let x = 0; x < width; x += 1) {
      const chevron = (x + Math.abs(y - height * 0.5) * 1.7) % 16;
      const sidewallHash = x % 12;
      const groove = onOuterTread ? chevron < 3.2 : sidewallHash < 1.4;
      const shade = groove ? 17 : 38;
      const offset = (y * width + x) * 4;
      pixels[offset] = shade;
      pixels[offset + 1] = shade + 2;
      pixels[offset + 2] = shade;
      pixels[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = "rabbit-scooter-molded-rubber-tread";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function splitAuthoredWheels(sourceMesh: THREE.Mesh) {
  const geometry = sourceMesh.geometry;
  const position = geometry.getAttribute("position");
  const index = geometry.index;
  if (!position || !index || index.count % 3 !== 0) {
    throw new Error("rabbit rider source mesh must have indexed triangle geometry");
  }

  const parent = new Int32Array(position.count);
  for (let vertex = 0; vertex < parent.length; vertex += 1) parent[vertex] = vertex;
  const find = (vertex: number) => {
    let root = vertex;
    while (parent[root] !== root) root = parent[root];
    while (parent[vertex] !== vertex) {
      const next = parent[vertex];
      parent[vertex] = root;
      vertex = next;
    }
    return root;
  };
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[rightRoot] = leftRoot;
  };

  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    union(a, b);
    union(a, c);
  }

  const centers: Record<WheelId, WheelCenter> = {
    front: FRONT_WHEEL_CENTER,
    rear: REAR_WHEEL_CENTER,
  };
  const componentStats: Record<WheelId, Map<number, ComponentStats>> = {
    front: new Map(),
    rear: new Map(),
  };
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    const root = find(vertex);
    const x = position.getX(vertex);
    const y = position.getY(vertex);
    const z = position.getZ(vertex);
    for (const wheelId of ["front", "rear"] as const) {
      const center = centers[wheelId];
      const radius = Math.hypot(x - center.x, y - center.y);
      let stats = componentStats[wheelId].get(root);
      if (!stats) {
        stats = { count: 0, sumRadius: 0, maxRadius: 0, minZ: Infinity, maxZ: -Infinity };
        componentStats[wheelId].set(root, stats);
      }
      stats.count += 1;
      stats.sumRadius += radius;
      stats.maxRadius = Math.max(stats.maxRadius, radius);
      stats.minZ = Math.min(stats.minZ, z);
      stats.maxZ = Math.max(stats.maxZ, z);
    }
  }

  const componentWheel = new Map<number, WheelId>();
  const isProductionGeometry = position.count === PRODUCTION_POSITION_COUNT
    && index.count === PRODUCTION_INDEX_COUNT;
  for (const wheelId of ["front", "rear"] as const) {
    for (const [root, stats] of componentStats[wheelId]) {
      const isWheelComponent = isProductionGeometry
        ? PRODUCTION_WHEEL_ROOTS[wheelId].has(root)
        : classifyComponent(stats, centers[wheelId]);
      if (isWheelComponent) componentWheel.set(root, wheelId);
    }
  }

  const baseIndices: number[] = [];
  const frontIndices: number[] = [];
  const rearIndices: number[] = [];
  for (let offset = 0; offset < index.count; offset += 3) {
    const a = index.getX(offset);
    const triangle = [a, index.getX(offset + 1), index.getX(offset + 2)];
    const wheelId = componentWheel.get(find(a));
    if (wheelId === "front") frontIndices.push(...triangle);
    else if (wheelId === "rear") rearIndices.push(...triangle);
    else baseIndices.push(...triangle);
  }
  if (frontIndices.length === 0 || rearIndices.length === 0) {
    throw new Error("rabbit rider authored wheels could not be separated");
  }

  // Remove the incomplete authored rubber fragments from the stationary body;
  // the original rims, hubs, fork, fenders and drivetrain remain untouched.
  geometry.setIndex(baseIndices);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const treadTexture = createRubberTreadTexture();
  const tireMaterial = new THREE.MeshStandardMaterial({
    name: "rabbit-scooter-clean-rubber",
    color: 0xffffff,
    map: treadTexture,
    bumpMap: treadTexture,
    bumpScale: 0.006,
    roughness: 0.9,
    metalness: 0.02,
  });
  const createRotor = (wheelId: WheelId, sourceIndices: number[], center: WheelCenter): ExtractedWheel => {
    const rotor = new THREE.Group();
    rotor.name = `rabbit-scooter-${wheelId}-wheel-rotor`;
    rotor.position.set(center.x, center.y, center.z);
    const wheel = new THREE.Mesh(createCompleteTireGeometry(), tireMaterial);
    wheel.name = `rabbit-scooter-${wheelId}-tire`;
    wheel.castShadow = sourceMesh.castShadow;
    wheel.receiveShadow = sourceMesh.receiveShadow;
    wheel.frustumCulled = false;
    rotor.add(wheel);
    return { rotor, triangles: sourceIndices.length / 3 };
  };

  return {
    front: createRotor("front", frontIndices, FRONT_WHEEL_CENTER),
    rear: createRotor("rear", rearIndices, REAR_WHEEL_CENTER),
  };
}

export class RiderWheelMotion {
  readonly root = new THREE.Group();
  private readonly frontSteer = new THREE.Group();
  private readonly frontRotor: THREE.Group;
  private readonly rearRotor: THREE.Group;
  private readonly frontTriangles: number;
  private readonly rearTriangles: number;
  private spinRadians = 0;
  private angularSpeedRadiansPerSecond = 0;
  private steerRadians = 0;

  constructor(model: THREE.Object3D) {
    this.root.name = "rabbit-scooter-wheel-motion";
    this.root.userData = {
      runtimeWheelAnimation: true,
      sourceTireFragmentsRemoved: true,
      completeTireSurface: true,
    };
    this.frontSteer.name = "rabbit-scooter-front-wheel-steer";

    const sourceMesh = findRiderSourceMesh(model);
    if (!sourceMesh) throw new Error("rabbit rider source mesh is missing");
    const wheels = splitAuthoredWheels(sourceMesh);
    this.frontRotor = wheels.front.rotor;
    this.rearRotor = wheels.rear.rotor;
    this.frontTriangles = wheels.front.triangles;
    this.rearTriangles = wheels.rear.triangles;

    // Steering is a parent pivot; rolling remains source-local Z inside it.
    this.frontSteer.position.copy(this.frontRotor.position);
    this.frontRotor.position.set(0, 0, 0);
    this.frontSteer.add(this.frontRotor);
    this.root.add(this.frontSteer, this.rearRotor);
    sourceMesh.add(this.root);
  }

  reset() {
    this.spinRadians = 0;
    this.angularSpeedRadiansPerSecond = 0;
    this.steerRadians = 0;
    this.frontRotor.rotation.z = 0;
    this.rearRotor.rotation.z = 0;
    this.frontSteer.rotation.y = 0;
  }

  update(dt: number, signedSpeed: number, steerRadians: number) {
    this.spinRadians = advanceWheelAngle(this.spinRadians, signedSpeed, dt);
    this.angularSpeedRadiansPerSecond = -signedSpeed / RIDER_WHEEL_RADIUS_METERS;
    this.steerRadians = THREE.MathUtils.clamp(steerRadians, -0.48, 0.48);
    this.frontRotor.rotation.z = this.spinRadians;
    this.rearRotor.rotation.z = this.spinRadians;
    this.frontSteer.rotation.y = this.steerRadians;
  }

  getState(): RiderWheelMotionState {
    return {
      spinRadians: this.spinRadians,
      angularSpeedRadiansPerSecond: this.angularSpeedRadiansPerSecond,
      steerRadians: this.steerRadians,
      frontTriangles: this.frontTriangles,
      rearTriangles: this.rearTriangles,
    };
  }
}
