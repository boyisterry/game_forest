import type * as THREE from "three";
import { chooseDynamicPixelRatio } from "./renderPerformanceBudget.ts";

type ChangeControls = {
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
};

export type ShowcaseContinuousActivity = Readonly<{
  autoRotate?: boolean;
  focusBlend?: number;
  morphChanged?: boolean;
  internalAnimation?: boolean;
  controlsChanged?: boolean;
}>;

export function hasContinuousShowcaseActivity(activity: ShowcaseContinuousActivity) {
  return activity.autoRotate === true
    || (activity.focusBlend ?? 0) > 0.001
    || activity.morphChanged === true
    || activity.internalAnimation === true
    || activity.controlsChanged === true;
}

export function createShowcaseRenderBudget(options: Readonly<{
  renderer: THREE.WebGLRenderer;
  host: HTMLElement;
  controls: ChangeControls;
  maximumPixelRatio?: number;
}>) {
  const { renderer, host, controls, maximumPixelRatio = 1.7 } = options;
  let visible = document.visibilityState !== "hidden";
  let lastActivityMs = performance.now();
  let lastRenderedMs = Number.NaN;
  let lastShadowMs = Number.NEGATIVE_INFINITY;
  let lastTuneMs = performance.now();
  let shadowDirty = true;
  let pixelRatio = Math.min(window.devicePixelRatio, maximumPixelRatio);
  const frameSamples: number[] = [];
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const invalidate = (shadow = true) => {
    lastActivityMs = performance.now();
    if (shadow) shadowDirty = true;
  };
  const onVisibility = () => {
    visible = document.visibilityState !== "hidden";
    lastRenderedMs = Number.NaN;
    if (visible) invalidate(true);
  };
  const onInteraction = () => invalidate(false);
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("pointerdown", onInteraction);
  window.addEventListener("keydown", onInteraction);
  window.addEventListener("wheel", onInteraction, { passive: true });
  controls.addEventListener("change", onInteraction);

  return Object.freeze({
    invalidate,
    render(scene: THREE.Scene, camera: THREE.Camera, continuous = false) {
      if (!visible) {
        lastRenderedMs = Number.NaN;
        return false;
      }
      const now = performance.now();
      if (continuous) lastActivityMs = now;
      if (!continuous && now - lastActivityMs >= 320) {
        lastRenderedMs = Number.NaN;
        return false;
      }
      if (Number.isFinite(lastRenderedMs)) {
        frameSamples.push(now - lastRenderedMs);
        if (frameSamples.length > 120) frameSamples.shift();
      }
      lastRenderedMs = now;
      if (now - lastTuneMs >= 1_500 && frameSamples.length >= 45) {
        lastTuneMs = now;
        const sorted = [...frameSamples].sort((a, b) => a - b);
        const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
        const over25 = frameSamples.reduce((sum, sample) => sum + Number(sample > 25), 0) / frameSamples.length;
        const next = chooseDynamicPixelRatio({
          current: pixelRatio,
          maximum: Math.min(window.devicePixelRatio, maximumPixelRatio),
          samples: frameSamples.length,
          frameTimeP95Ms: p95,
          framesOver25MsRatio: over25,
        });
        if (Math.abs(next - pixelRatio) >= 0.01) {
          pixelRatio = next;
          renderer.setPixelRatio(pixelRatio);
          renderer.setSize(host.clientWidth, host.clientHeight, false);
          shadowDirty = true;
        }
      }
      const refreshDynamicShadow = continuous && now - lastShadowMs >= 100;
      renderer.shadowMap.needsUpdate = shadowDirty || refreshDynamicShadow;
      if (renderer.shadowMap.needsUpdate) {
        lastShadowMs = now;
        shadowDirty = false;
      }
      renderer.render(scene, camera);
      return true;
    },
    dispose() {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pointerdown", onInteraction);
      window.removeEventListener("keydown", onInteraction);
      window.removeEventListener("wheel", onInteraction);
      controls.removeEventListener("change", onInteraction);
    },
  });
}
