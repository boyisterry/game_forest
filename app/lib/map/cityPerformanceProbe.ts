import type * as THREE from "three";

export type CityBatchBackend = "batched-mesh" | "instanced-mesh";

export type CityRenderCapabilities = Readonly<{
  webglVersion: 1 | 2;
  renderer: string;
  multiDraw: boolean;
  batchBackend: CityBatchBackend;
}>;

export type CityFrameTimeSummary = Readonly<{
  samples: number;
  p50Ms: number;
  p95Ms: number;
  over25MsRatio: number;
}>;

export function chooseCityBatchBackend(multiDraw: boolean): CityBatchBackend {
  return multiDraw ? "batched-mesh" : "instanced-mesh";
}

export function inspectCityRenderCapabilities(renderer: THREE.WebGLRenderer): CityRenderCapabilities {
  const gl = renderer.getContext();
  const debugRendererInfo = gl.getExtension("WEBGL_debug_renderer_info") as {
    UNMASKED_RENDERER_WEBGL: number;
  } | null;
  const rendererName = String(gl.getParameter(
    debugRendererInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER,
  ));
  const multiDraw = renderer.extensions.has("WEBGL_multi_draw");
  return Object.freeze({
    webglVersion: typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? 2 : 1,
    renderer: rendererName,
    multiDraw,
    batchBackend: chooseCityBatchBackend(multiDraw),
  });
}

function percentile(sorted: readonly number[], ratio: number) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function summarizeCityFrameTimes(samples: readonly number[]): CityFrameTimeSummary {
  const finite = samples.filter((sample) => Number.isFinite(sample) && sample >= 0).sort((a, b) => a - b);
  if (finite.length === 0) {
    return Object.freeze({ samples: 0, p50Ms: 0, p95Ms: 0, over25MsRatio: 0 });
  }
  const over25Ms = finite.reduce((count, sample) => count + Number(sample > 25), 0);
  return Object.freeze({
    samples: finite.length,
    p50Ms: percentile(finite, 0.5),
    p95Ms: percentile(finite, 0.95),
    over25MsRatio: over25Ms / finite.length,
  });
}
