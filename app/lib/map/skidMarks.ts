import * as THREE from "three";
import type { MotoPose } from "./motorcycle";

/**
 * Motorcycle skid marks — stamps under the front and rear tire contact patches
 * (two-wheeler), not a car-style left/right pair. Ring-buffered InstancedMesh.
 */

const MAX_MARKS = 720;
const MARK_Y = 0.028;
/** Contact points along the bike nose (heading 0 = +Z). */
const FRONT_OFFSET = 0.72;
const REAR_OFFSET = 0.58;
const MIN_SPACING = 0.26;
const MIN_SPEED = 0.7;

export class SkidMarks {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly dummy = new THREE.Object3D();
  private readonly color = new THREE.Color();
  private cursor = 0;
  private lastX = Number.NaN;
  private lastZ = Number.NaN;
  private active = false;

  constructor() {
    // Narrow tire patch (width × length along travel).
    const geo = new THREE.PlaneGeometry(0.11, 0.42);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      polygonOffsetUnits: -4,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX_MARKS);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
    for (let i = 0; i < MAX_MARKS; i += 1) {
      this.mesh.setColorAt(i, this.color.setRGB(0, 0, 0));
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.group.add(this.mesh);
  }

  clear() {
    this.cursor = 0;
    this.mesh.count = 0;
    this.lastX = Number.NaN;
    this.lastZ = Number.NaN;
    this.active = false;
    for (let i = 0; i < MAX_MARKS; i += 1) {
      this.dummy.scale.set(0, 0, 0);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * @param braking S or Space held
   * @param drifting handbrake slide active
   */
  update(pose: MotoPose, braking: boolean, drifting: boolean) {
    // Forward braking / drift only — reverse creep must not paint skids.
    const laying = (braking || drifting) && pose.speed > MIN_SPEED;
    if (!laying) {
      this.active = false;
      this.lastX = Number.NaN;
      this.lastZ = Number.NaN;
      return;
    }

    if (this.active) {
      const gap = Math.hypot(pose.x - this.lastX, pose.z - this.lastZ);
      if (gap < (drifting ? MIN_SPACING * 0.72 : MIN_SPACING)) return;
    }

    // Nose axis for wheel placement; travel axis for scuff direction.
    const hx = Math.sin(pose.heading);
    const hz = Math.cos(pose.heading);
    const rx = hz;
    const rz = -hx;
    // Leaned tire: contact patch slides slightly toward the lean side.
    const leanShift = pose.lean * 0.16;

    const frontX = pose.x + hx * FRONT_OFFSET + rx * leanShift;
    const frontZ = pose.z + hz * FRONT_OFFSET + rz * leanShift;
    const rearX = pose.x - hx * REAR_OFFSET + rx * leanShift;
    const rearZ = pose.z - hz * REAR_OFFSET + rz * leanShift;

    // Scuff aligns with how the rubber is sliding across the ground.
    const scuffYaw = pose.velHeading;

    if (drifting) {
      // Handbrake: rear paints hard; front lighter (still tracking).
      this.stamp(rearX, rearZ, scuffYaw, 1.15, 1.35, 0.045);
      this.stamp(frontX, frontZ, scuffYaw, 0.85, 1.05, 0.1);
    } else {
      // Straight brake: both contact patches, rear a touch heavier.
      this.stamp(rearX, rearZ, scuffYaw, 0.9, 1.05, 0.1);
      this.stamp(frontX, frontZ, scuffYaw, 0.8, 0.95, 0.13);
    }

    this.lastX = pose.x;
    this.lastZ = pose.z;
    this.active = true;
  }

  private stamp(x: number, z: number, yaw: number, width: number, length: number, shade: number) {
    const i = this.cursor % MAX_MARKS;
    this.cursor += 1;
    this.mesh.count = Math.min(MAX_MARKS, Math.max(this.mesh.count, this.cursor));

    this.dummy.position.set(x, MARK_Y, z);
    this.dummy.rotation.set(0, yaw, 0);
    this.dummy.scale.set(width, 1, length);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.setColorAt(i, this.color.setRGB(shade, shade * 0.9, shade * 0.78));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
