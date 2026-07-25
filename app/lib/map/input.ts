import type { MotoInput } from "./motorcycle";

/**
 * Keyboard input for ride mode. Listens on window (so focus loss to a UI chip
 * doesn't kill the throttle), ignores form fields, prevents Space/arrow page
 * scroll and button activation, clears all keys on blur (no stuck throttle when
 * alt-tabbing), and fires an Esc callback to exit ride mode. Hard brake is a
 * held level (Space down) plus a press-edge pulse for the nod.
 */

export type DriveInput = MotoInput;

const isFormField = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
};

export class InputController {
  private keys = new Set<string>();
  private hardPulse = false;
  private prevSpace = false;
  private virtual: Partial<DriveInput> = {};
  private readonly onExit: () => void;
  private attached = false;

  constructor(onExit: () => void) {
    this.onExit = onExit;
  }

  attach() {
    if (this.attached) return;
    this.attached = true;
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
  }

  detach() {
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.keys.clear();
    this.prevSpace = false;
  }

  /** Inject state for browser QA / tests (merged over physical keys). */
  setVirtual(partial: Partial<DriveInput>) {
    this.virtual = { ...this.virtual, ...partial };
  }

  clearVirtual() {
    this.virtual = {};
  }

  reset() {
    this.keys.clear();
    this.hardPulse = false;
    this.prevSpace = false;
    this.virtual = {};
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      this.onExit();
      return;
    }
    if (isFormField(event.target)) return;
    const code = event.code;
    if (code === "Space" || code.startsWith("Arrow")) event.preventDefault();
    if (code === "Space" && !this.prevSpace) this.hardPulse = true;
    if (code === "Space") this.prevSpace = true;
    this.keys.add(code);
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (event.code === "Space") this.prevSpace = false;
    this.keys.delete(event.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.prevSpace = false;
  };

  poll(): DriveInput {
    const k = this.keys;
    const throttle = k.has("KeyW") || k.has("ArrowUp") ? 1 : 0;
    const brake = k.has("KeyS") || k.has("ArrowDown") ? 1 : 0;
    let steer = 0;
    if (k.has("KeyA") || k.has("ArrowLeft")) steer -= 1;
    if (k.has("KeyD") || k.has("ArrowRight")) steer += 1;
    const boost = k.has("ShiftLeft") || k.has("ShiftRight");
    const hardBrake = k.has("Space");
    const hardBrakeEdge = this.hardPulse;
    this.hardPulse = false;
    return { throttle, brake, steer, boost, hardBrake, hardBrakeEdge, ...this.virtual } as DriveInput;
  }
}
