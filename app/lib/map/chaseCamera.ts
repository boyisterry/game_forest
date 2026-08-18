import * as THREE from "three";
import type { MotoPose } from "./motorcycle";

/**
 * Third-person chase camera for ride mode. Default: behind + above the bike.
 * Hold LMB/RMB and drag to temporarily orbit look (yaw/pitch); release and the
 * view springs back behind the rider like a typical action-adventure chase cam.
 */
const HEIGHT = 4.4;
const BACK = 7.5;
const LOOK_AHEAD = 6;
const LOOK_HEIGHT = 1.4;
const SPEED_PULL = 0.12;
const POS_LERP = 4.5;
const LOOK_LERP = 6;
const FOV_BASE = 42;
const FOV_BOOST = 47;
const YAW_SENS = 0.005;
const PITCH_SENS = 0.0035;
const PITCH_MIN = -0.55;
const PITCH_MAX = 0.72;
const RECENTER = 5.5; // spring rate back to chase when not dragging

export class ChaseCamera {
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private init = false;
  private fov = FOV_BASE;
  private lookYaw = 0;
  private lookPitch = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private pointerId: number | null = null;
  private el: HTMLElement | null = null;
  private readonly idealPos = new THREE.Vector3();
  private readonly idealLook = new THREE.Vector3();

  reset() {
    this.init = false;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.dragging = false;
    this.pointerId = null;
  }

  attach(el: HTMLElement) {
    if (this.el === el) return;
    this.detach();
    this.el = el;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("contextmenu", this.onContextMenu);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  detach() {
    if (this.el) {
      this.el.removeEventListener("pointerdown", this.onPointerDown);
      this.el.removeEventListener("contextmenu", this.onContextMenu);
      this.el = null;
    }
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
    this.dragging = false;
    this.pointerId = null;
  }

  private onContextMenu = (event: Event) => {
    event.preventDefault();
  };

  private onPointerDown = (event: PointerEvent) => {
    // Left or right button — temporary free-look while held.
    if (event.button !== 0 && event.button !== 2) return;
    event.preventDefault();
    this.dragging = true;
    this.pointerId = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.el?.setPointerCapture?.(event.pointerId);
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.dragging || event.pointerId !== this.pointerId) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.lookYaw -= dx * YAW_SENS;
    this.lookPitch = THREE.MathUtils.clamp(this.lookPitch + dy * PITCH_SENS, PITCH_MIN, PITCH_MAX);
  };

  private onPointerUp = (event: PointerEvent) => {
    if (this.pointerId !== null && event.pointerId !== this.pointerId) return;
    this.dragging = false;
    this.pointerId = null;
  };

  update(dt: number, camera: THREE.PerspectiveCamera, pose: MotoPose, boost: boolean) {
    if (!this.dragging) {
      const k = 1 - Math.exp(-RECENTER * dt);
      this.lookYaw += (0 - this.lookYaw) * k;
      this.lookPitch += (0 - this.lookPitch) * k;
    }

    const yaw = pose.heading + this.lookYaw;
    // `pose.pitch` includes the same bounded presentation impulse already used
    // by the rider. Fold it into the boom angle once; do not add a second shake.
    const pitch = THREE.MathUtils.clamp(
      this.lookPitch + pose.pitch,
      PITCH_MIN,
      PITCH_MAX,
    );
    const back = BACK + Math.abs(pose.speed) * SPEED_PULL;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // Orbit behind the look yaw; pitch raises/lowers the boom.
    this.idealPos.set(
      pose.x - fx * back * cp,
      pose.y + HEIGHT + sp * back * 0.85,
      pose.z - fz * back * cp,
    );

    // While free-looking, stare at the rider; otherwise look down the road.
    if (this.dragging || Math.abs(this.lookYaw) > 0.04 || Math.abs(this.lookPitch) > 0.04) {
      this.idealLook.set(pose.x, pose.y + LOOK_HEIGHT, pose.z);
    } else {
      const hx = Math.sin(pose.heading);
      const hz = Math.cos(pose.heading);
      this.idealLook.set(
        pose.x + hx * LOOK_AHEAD,
        pose.y + LOOK_HEIGHT,
        pose.z + hz * LOOK_AHEAD,
      );
    }

    if (!this.init) {
      this.pos.copy(this.idealPos);
      this.look.copy(this.idealLook);
      this.init = true;
    } else {
      const p = 1 - Math.exp(-POS_LERP * dt);
      const l = 1 - Math.exp(-LOOK_LERP * dt);
      this.pos.lerp(this.idealPos, p);
      this.look.lerp(this.idealLook, l);
    }

    camera.position.copy(this.pos);
    camera.lookAt(this.look);

    const targetFov = boost && Math.abs(pose.speed) > 4 ? FOV_BOOST : FOV_BASE;
    if (targetFov !== this.fov) {
      this.fov = targetFov;
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  }
}
