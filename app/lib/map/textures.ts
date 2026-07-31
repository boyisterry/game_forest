import * as THREE from "three";
import { createRandom, range } from "./random";

function makeCanvas(width: number, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  return { canvas, ctx };
}

/** Seeded PBR bark: raised plates, deep fissures, fine checks and restrained lichen. */
export function createBarkTextures(anisotropy = 4, seed = 1): SurfaceTextures {
  const size = 512;
  const random = createRandom(seed ^ 0x6b8d);
  const { canvas: colorCanvas, ctx: color } = makeCanvas(size);
  const { canvas: heightCanvas, ctx: height } = makeCanvas(size);

  const base = color.createLinearGradient(0, 0, size, 0);
  base.addColorStop(0, "#40372d");
  base.addColorStop(0.22, "#675844");
  base.addColorStop(0.52, "#796a52");
  base.addColorStop(0.78, "#584a39");
  base.addColorStop(1, "#392f27");
  color.fillStyle = base;
  color.fillRect(0, 0, size, size);
  height.fillStyle = "rgb(126,126,126)";
  height.fillRect(0, 0, size, size);

  // Broad, softly raised plates establish the large-scale bark structure.
  for (let i = 0; i < 62; i += 1) {
    const x = random() * size;
    const width = 7 + random() * 20;
    const lean = range(random, -10, 10);
    color.strokeStyle = random() < 0.46 ? "rgba(205,185,148,.12)" : "rgba(36,28,22,.11)";
    color.lineWidth = width;
    color.beginPath();
    color.moveTo(x, -24);
    color.bezierCurveTo(x + lean, size * 0.3, x - lean * 0.7, size * 0.72, x + lean * 0.35, size + 24);
    color.stroke();
    height.strokeStyle = random() < 0.55 ? "rgba(204,204,204,.24)" : "rgba(78,78,78,.16)";
    height.lineWidth = width;
    height.beginPath();
    height.moveTo(x, -24);
    height.bezierCurveTo(x + lean, size * 0.3, x - lean * 0.7, size * 0.72, x + lean * 0.35, size + 24);
    height.stroke();
  }

  // Long split channels carry a dark core, a lifted rim and matching height.
  for (let i = 0; i < 185; i += 1) {
    const x = random() * size;
    const y = -24 + random() * (size + 24);
    const length = 24 + random() * 105;
    const swayA = range(random, -12, 12);
    const swayB = range(random, -9, 9);
    const width = 1.1 + random() * 3.2;
    color.strokeStyle = `rgba(21,16,13,${0.36 + random() * 0.38})`;
    color.lineWidth = width;
    color.beginPath();
    color.moveTo(x, y);
    color.bezierCurveTo(x + swayA, y + length * 0.3, x + swayB, y + length * 0.72, x + swayB * 0.35, y + length);
    color.stroke();
    color.strokeStyle = `rgba(222,204,165,${0.1 + random() * 0.12})`;
    color.lineWidth = Math.max(0.65, width * 0.42);
    color.translate(1.8, 0);
    color.stroke();
    color.translate(-1.8, 0);

    height.strokeStyle = `rgba(34,34,34,${0.56 + random() * 0.3})`;
    height.lineWidth = width * 1.45;
    height.beginPath();
    height.moveTo(x, y);
    height.bezierCurveTo(x + swayA, y + length * 0.3, x + swayB, y + length * 0.72, x + swayB * 0.35, y + length);
    height.stroke();
  }

  // Short cross-checks break the vertical repetition into real bark scales.
  for (let i = 0; i < 260; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 3 + random() * 14;
    const angle = range(random, -0.42, 0.42);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    color.strokeStyle = `rgba(27,20,15,${0.14 + random() * 0.25})`;
    color.lineWidth = 0.55 + random() * 1.1;
    color.beginPath();
    color.moveTo(x - dx * 0.5, y - dy * 0.5);
    color.lineTo(x + dx * 0.5, y + dy * 0.5);
    color.stroke();
    height.strokeStyle = "rgba(54,54,54,.32)";
    height.lineWidth = color.lineWidth;
    height.beginPath();
    height.moveTo(x - dx * 0.5, y - dy * 0.5);
    height.lineTo(x + dx * 0.5, y + dy * 0.5);
    height.stroke();
  }

  // Small desaturated lichen islands add age without turning trunks green.
  for (let i = 0; i < 42; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 4 + random() * 15;
    const lichen = color.createRadialGradient(x, y, 0, x, y, radius);
    lichen.addColorStop(0, `rgba(113,124,78,${0.08 + random() * 0.12})`);
    lichen.addColorStop(0.7, "rgba(87,102,66,.05)");
    lichen.addColorStop(1, "rgba(87,102,66,0)");
    color.fillStyle = lichen;
    color.beginPath();
    color.ellipse(x, y, radius, radius * range(random, 0.45, 0.85), random() * Math.PI, 0, Math.PI * 2);
    color.fill();
  }

  for (let i = 0; i < 1700; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.3 + random() * 1.2;
    color.fillStyle = random() < 0.58 ? "rgba(18,14,11,.2)" : "rgba(227,210,176,.13)";
    color.fillRect(x, y, radius, radius * range(random, 0.7, 2.2));
  }

  const normalCanvas = buildNormalCanvas(heightCanvas, size, 0.014);
  const roughnessCanvas = buildRoughnessCanvas(heightCanvas, size, 168, 0.3);
  return {
    map: makeSurfaceTexture(colorCanvas, 2.2, 4.6, anisotropy, true),
    normalMap: makeSurfaceTexture(normalCanvas, 2.2, 4.6, anisotropy),
    roughnessMap: makeSurfaceTexture(roughnessCanvas, 2.2, 4.6, anisotropy),
  };
}

function toRgb(c: number) {
  return { r: (c >> 16) & 255, g: (c >> 8) & 255, b: c & 255 };
}

function shadeCss(c: number, f: number, a = 1) {
  const { r, g, b } = toRgb(c);
  const rr = Math.min(255, Math.round(r * f));
  const gg = Math.min(255, Math.round(g * f));
  const bb = Math.min(255, Math.round(b * f));
  return a >= 1 ? `rgb(${rr},${gg},${bb})` : `rgba(${rr},${gg},${bb},${a})`;
}

type GrassStroke = { x: number; y: number; len: number; w: number; tone: number; lit: number };
type EarthSpeck = { x: number; y: number; r: number; d: number };
type GrassHummock = { x: number; y: number; r: number; lift: number; tone: number };

export type SurfaceTextures = {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
};

/**
 * Seeded rock surface shared by the instanced stones. Broad mottling keeps the
 * low-poly faces from reading as a single flat color, while pits, mineral
 * grains and short cracks feed a matching tangent-space normal map.
 */
export function createStoneTextures(anisotropy = 4, seed = 1): SurfaceTextures {
  const size = 256;
  const random = createRandom(seed ^ 0x51a7);
  const { canvas: colorCanvas, ctx: color } = makeCanvas(size);
  const { canvas: heightCanvas, ctx: height } = makeCanvas(size);

  color.fillStyle = "#899184";
  color.fillRect(0, 0, size, size);
  height.fillStyle = "rgb(128,128,128)";
  height.fillRect(0, 0, size, size);

  // Soft mineral clouds establish large-scale variation without looking tiled.
  for (let i = 0; i < 54; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 10 + random() * 34;
    const light = random() > 0.48;
    const colorCloud = color.createRadialGradient(x, y, 0, x, y, radius);
    colorCloud.addColorStop(0, light ? "rgba(190,199,182,.16)" : "rgba(48,55,47,.18)");
    colorCloud.addColorStop(1, light ? "rgba(190,199,182,0)" : "rgba(48,55,47,0)");
    color.fillStyle = colorCloud;
    color.beginPath();
    color.ellipse(x, y, radius, radius * range(random, 0.55, 1), random() * Math.PI, 0, Math.PI * 2);
    color.fill();
  }

  // Shallow pits catch grazing light and make even the small pebbles feel worn.
  for (let i = 0; i < 210; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 1.2 + random() * 4.4;
    color.fillStyle = `rgba(39,44,38,${0.08 + random() * 0.15})`;
    color.beginPath();
    color.ellipse(x, y, radius, radius * range(random, 0.55, 0.95), random() * Math.PI, 0, Math.PI * 2);
    color.fill();
    height.fillStyle = `rgba(42,42,42,${0.22 + random() * 0.34})`;
    height.beginPath();
    height.ellipse(x, y, radius, radius * range(random, 0.55, 0.95), random() * Math.PI, 0, Math.PI * 2);
    height.fill();
  }

  // Mineral grains provide the high-frequency relief visible near the rider.
  for (let i = 0; i < 1900; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.25 + random() * 1.05;
    const raised = random() > 0.44;
    color.fillStyle = raised ? "rgba(218,224,207,.2)" : "rgba(42,48,41,.2)";
    color.fillRect(x, y, radius, radius);
    height.fillStyle = raised ? "rgba(224,224,224,.48)" : "rgba(45,45,45,.38)";
    height.fillRect(x, y, radius, radius);
  }

  // Restrained hairline fractures add recognizable stone structure.
  for (let i = 0; i < 44; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const length = 5 + random() * 20;
    const angle = random() * Math.PI * 2;
    const bend = range(random, -4, 4);
    const dx = Math.cos(angle) * length;
    const dy = Math.sin(angle) * length;
    color.strokeStyle = `rgba(28,32,27,${0.18 + random() * 0.22})`;
    color.lineWidth = 0.55 + random() * 1.1;
    color.beginPath();
    color.moveTo(x, y);
    color.quadraticCurveTo(x + dx * 0.5 + bend, y + dy * 0.5 - bend, x + dx, y + dy);
    color.stroke();
    height.strokeStyle = "rgba(28,28,28,.58)";
    height.lineWidth = color.lineWidth * 1.2;
    height.beginPath();
    height.moveTo(x, y);
    height.quadraticCurveTo(x + dx * 0.5 + bend, y + dy * 0.5 - bend, x + dx, y + dy);
    height.stroke();
  }

  const normalCanvas = buildNormalCanvas(heightCanvas, size, 1.45);
  const roughnessCanvas = buildRoughnessCanvas(heightCanvas, size, 156, 0.42);
  return {
    map: makeSurfaceTexture(colorCanvas, 1.35, 1.35, anisotropy, true),
    normalMap: makeSurfaceTexture(normalCanvas, 1.35, 1.35, anisotropy),
    roughnessMap: makeSurfaceTexture(roughnessCanvas, 1.35, 1.35, anisotropy),
  };
}

/**
 * Dense lawn carpet baked into the ground tile. This is the far/mid-field read;
 * 3D tufts only add near-camera volume. Stroke list also drives the height field
 * so color and normal relief stay aligned. Seeded for map reproducibility.
 */
function generateGrassStrokes(size: number, bladeColors: number[], random: () => number) {
  const strokes: GrassStroke[] = [];
  // Pack the tile so the tiled ground already reads as undergrowth, not bare soil.
  const rosettes = 3400;
  for (let i = 0; i < rosettes; i += 1) {
    const cx = random() * size;
    const cy = random() * size;
    const bladeCount = 5 + Math.floor(random() * 7);
    const tone = bladeColors[Math.floor(random() * bladeColors.length)];
    for (let j = 0; j < bladeCount; j += 1) {
      strokes.push({
        x: cx + (random() - 0.5) * 4.2,
        y: cy + (random() - 0.5) * 3.4,
        len: 2.4 + random() * 5.8,
        w: 0.55 + random() * 0.75,
        tone,
        lit: 0.48 + random() * 0.52,
      });
    }
  }
  const hummocks: GrassHummock[] = [];
  for (let i = 0; i < 180; i += 1) {
    hummocks.push({
      x: random() * size,
      y: random() * size,
      r: 5 + random() * 16,
      lift: 0.12 + random() * 0.3,
      tone: bladeColors[Math.floor(random() * bladeColors.length)],
    });
  }
  const earth: EarthSpeck[] = [];
  for (let i = 0; i < 84; i += 1) {
    earth.push({
      x: random() * size,
      y: random() * size,
      r: 0.4 + random() * 1.1,
      d: 0.08 + random() * 0.14,
    });
  }
  return { strokes, hummocks, earth };
}

function averageColor(colors: number[]) {
  if (!colors.length) return 0x6b9235;
  let r = 0;
  let g = 0;
  let b = 0;
  for (const c of colors) {
    r += (c >> 16) & 255;
    g += (c >> 8) & 255;
    b += c & 255;
  }
  const n = colors.length;
  return ((Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)) >>> 0;
}

function drawGrassColor(
  ctx: CanvasRenderingContext2D,
  size: number,
  groundColor: number,
  bladeColors: number[],
  data: ReturnType<typeof generateGrassStrokes>,
  random: () => number,
) {
  // Forest floor base is already grassy green — soil only peeks through sparsely.
  // Integer-frequency waves are exactly periodic at the atlas edges, but read
  // as broad, interlocking forest-floor variation instead of stamped circles.
  const lawnBase = averageColor(bladeColors.length ? bladeColors : [groundColor]);
  const { r: baseR, g: baseG, b: baseB } = toRgb(lawnBase);
  const macro = ctx.createImageData(size, size);
  const phaseA = random() * Math.PI * 2;
  const phaseB = random() * Math.PI * 2;
  const phaseC = random() * Math.PI * 2;
  const tau = Math.PI * 2;
  for (let y = 0; y < size; y += 1) {
    const v = y / size;
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const broad =
        Math.sin(tau * (u * 2 + v * 3) + phaseA) * 0.48
        + Math.sin(tau * (u * 5 - v * 2) + phaseB) * 0.31
        + Math.cos(tau * (u * 7 + v * 6) + phaseC) * 0.21;
      const fine =
        Math.sin(tau * (u * 17 + v * 11) - phaseB) * 0.5
        + Math.cos(tau * (u * 23 - v * 19) + phaseA) * 0.5;
      const shade = THREE.MathUtils.clamp(0.71 + broad * 0.065 + fine * 0.018, 0.61, 0.83);
      const offset = (y * size + x) * 4;
      macro.data[offset] = Math.round(baseR * shade);
      macro.data[offset + 1] = Math.round(baseG * (shade + broad * 0.012));
      macro.data[offset + 2] = Math.round(baseB * shade);
      macro.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(macro, 0, 0);
  for (const mound of data.hummocks) {
    const grad = ctx.createRadialGradient(mound.x, mound.y, 0, mound.x, mound.y, mound.r);
    grad.addColorStop(0, shadeCss(mound.tone, 0.78 + mound.lift, 0.32));
    grad.addColorStop(0.58, shadeCss(mound.tone, 0.72 + mound.lift * 0.55, 0.19));
    grad.addColorStop(1, shadeCss(mound.tone, 0.6, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(mound.x, mound.y, mound.r, mound.r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of data.earth) {
    ctx.fillStyle = `rgba(62,47,33,${e.d})`;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of data.strokes) {
    ctx.strokeStyle = shadeCss(s.tone, 0.58 + s.lit * 0.65);
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x + (random() - 0.5) * 0.85, s.y - s.len);
    ctx.stroke();
  }
}

function drawGrassHeight(
  ctx: CanvasRenderingContext2D,
  size: number,
  data: ReturnType<typeof generateGrassStrokes>,
) {
  ctx.fillStyle = "rgb(104,104,104)";
  ctx.fillRect(0, 0, size, size);
  for (const mound of data.hummocks) {
    const grad = ctx.createRadialGradient(mound.x, mound.y, 0, mound.x, mound.y, mound.r);
    grad.addColorStop(0, `rgba(225,225,225,${0.45 + mound.lift})`);
    grad.addColorStop(0.55, "rgba(178,178,178,0.34)");
    grad.addColorStop(1, "rgba(104,104,104,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(mound.x, mound.y, mound.r, mound.r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const e of data.earth) {
    const grad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 1.7);
    grad.addColorStop(0, "rgba(38,38,38,0.5)");
    grad.addColorStop(1, "rgba(38,38,38,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r * 1.7, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const s of data.strokes) {
    const grad = ctx.createLinearGradient(s.x, s.y - s.len, s.x, s.y);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(0.6, "rgba(205,205,205,0.5)");
    grad.addColorStop(1, "rgba(104,104,104,0)");
    ctx.strokeStyle = grad;
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x, s.y - s.len);
    ctx.stroke();
  }
}

/** Sobel over the height canvas, edge-wrapped so the tiled normal map is seamless. */
function buildNormalCanvas(src: HTMLCanvasElement, size: number, strength: number) {
  const sctx = src.getContext("2d")!;
  const srcData = sctx.getImageData(0, 0, size, size).data;
  const out = new Uint8ClampedArray(size * size * 4);
  const at = (x: number, y: number) => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return srcData[(yy * size + xx) * 4];
  };
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const tl = at(x - 1, y - 1);
      const t = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const l = at(x - 1, y);
      const r = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const b = at(x, y + 1);
      const br = at(x + 1, y + 1);
      const dx = (tr + 2 * r + br) - (tl + 2 * l + bl);
      const dy = (bl + 2 * b + br) - (tl + 2 * t + tr);
      let nx = -dx * strength;
      let ny = -dy * strength;
      const nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx = nx * inv;
      ny = ny * inv;
      const o = (y * size + x) * 4;
      out[o] = (nx * 0.5 + 0.5) * 255;
      out[o + 1] = (ny * 0.5 + 0.5) * 255;
      out[o + 2] = (nz * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(new ImageData(out, size, size), 0, 0);
  return canvas;
}

function buildRoughnessCanvas(src: HTMLCanvasElement, size: number, bias: number, scale: number) {
  const source = src.getContext("2d")!.getImageData(0, 0, size, size).data;
  const output = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const value = THREE.MathUtils.clamp(bias + source[i * 4] * scale, 0, 255);
    const offset = i * 4;
    output[offset] = value;
    output[offset + 1] = value;
    output[offset + 2] = value;
    output[offset + 3] = 255;
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d")!.putImageData(new ImageData(output, size, size), 0, 0);
  return canvas;
}

/**
 * Blends opposite borders into the same texels before RepeatWrapping is used.
 * The grass artwork contains broad hummocks and clouds that may cross the tile
 * edge; without this pass their color/height discontinuity becomes a visible
 * square grid under grazing light.
 */
function makeCanvasTileable(canvas: HTMLCanvasElement, band = 28) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const blendPair = (a: number, b: number, weight: number) => {
    for (let channel = 0; channel < 4; channel += 1) {
      const av = data[a + channel];
      const bv = data[b + channel];
      data[a + channel] = Math.round(THREE.MathUtils.lerp(av, bv, weight));
      data[b + channel] = Math.round(THREE.MathUtils.lerp(bv, av, weight));
    }
  };

  const horizontalBand = Math.min(band, Math.floor(width * 0.25));
  for (let y = 0; y < height; y += 1) {
    for (let i = 0; i < horizontalBand; i += 1) {
      const t = i / Math.max(horizontalBand - 1, 1);
      const weight = 0.5 * (1 - smoothstep01(t));
      const left = (y * width + i) * 4;
      const right = (y * width + (width - 1 - i)) * 4;
      blendPair(left, right, weight);
    }
  }

  const verticalBand = Math.min(band, Math.floor(height * 0.25));
  for (let x = 0; x < width; x += 1) {
    for (let i = 0; i < verticalBand; i += 1) {
      const t = i / Math.max(verticalBand - 1, 1);
      const weight = 0.5 * (1 - smoothstep01(t));
      const top = (i * width + x) * 4;
      const bottom = ((height - 1 - i) * width + x) * 4;
      blendPair(top, bottom, weight);
    }
  }
  ctx.putImageData(image, 0, 0);
}

/** Road U is a fixed cross-section, so only blend its start/end along V. */
function makeCanvasVerticallyTileable(canvas: HTMLCanvasElement, band = 28) {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const data = image.data;
  const verticalBand = Math.min(band, Math.floor(height * 0.25));
  for (let x = 0; x < width; x += 1) {
    for (let i = 0; i < verticalBand; i += 1) {
      const t = i / Math.max(verticalBand - 1, 1);
      const weight = 0.5 * (1 - smoothstep01(t));
      const top = (i * width + x) * 4;
      const bottom = ((height - 1 - i) * width + x) * 4;
      for (let channel = 0; channel < 4; channel += 1) {
        const tv = data[top + channel];
        const bv = data[bottom + channel];
        data[top + channel] = Math.round(THREE.MathUtils.lerp(tv, bv, weight));
        data[bottom + channel] = Math.round(THREE.MathUtils.lerp(bv, tv, weight));
      }
    }
  }
  ctx.putImageData(image, 0, 0);
}

function smoothstep01(t: number) {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function makeSurfaceTexture(
  canvas: HTMLCanvasElement,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
  color = false,
) {
  const texture = new THREE.CanvasTexture(canvas);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  return texture;
}

/**
 * Replaces regular UV repetition with a continuous world-space stochastic
 * sampler. Four independently offset virtual tiles are blended at every cell,
 * so no single square tile or chunk boundary can be recognized. The identical
 * lookup is applied to color, tangent normals, and roughness.
 */
export function enableGroundAntiTiling(
  material: THREE.MeshStandardMaterial,
  worldTileSize = 21,
) {
  const tileSize = Math.max(8, worldTileSize).toFixed(2);
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vGroundWorldPosition;",
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvGroundWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;",
      );

    const stochasticSampler = `
varying vec3 vGroundWorldPosition;

vec2 groundHash22( vec2 p ) {
  vec2 q = vec2(
    dot( p, vec2( 127.1, 311.7 ) ),
    dot( p, vec2( 269.5, 183.3 ) )
  );
  return fract( sin( q ) * 43758.5453 );
}

vec4 sampleGroundStochastic( sampler2D surfaceMap ) {
  vec2 worldUv = vGroundWorldPosition.xz / ${tileSize};
  vec2 cell = floor( worldUv );
  vec2 localUv = fract( worldUv );
  vec2 blendUv = localUv * localUv * ( 3.0 - 2.0 * localUv );
  vec4 c00 = texture2D( surfaceMap, localUv + groundHash22( cell ) );
  vec4 c10 = texture2D( surfaceMap, localUv + groundHash22( cell + vec2( 1.0, 0.0 ) ) );
  vec4 c01 = texture2D( surfaceMap, localUv + groundHash22( cell + vec2( 0.0, 1.0 ) ) );
  vec4 c11 = texture2D( surfaceMap, localUv + groundHash22( cell + vec2( 1.0, 1.0 ) ) );
  return mix( mix( c00, c10, blendUv.x ), mix( c01, c11, blendUv.x ), blendUv.y );
}
`;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${stochasticSampler}`,
      )
      .replace(
        "#include <map_fragment>",
        `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = sampleGroundStochastic( map );
  diffuseColor *= sampledDiffuseColor;
#endif
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = sampleGroundStochastic( normalMap ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = sampleGroundStochastic( roughnessMap );
  roughnessFactor *= texelRoughness.g;
#endif
`,
      );
  };
  material.customProgramCacheKey = () => `ground-stochastic-v2-${tileSize}`;
  material.needsUpdate = true;
  return material;
}

/**
 * Keeps the authored road cross-section intact while removing the four-meter
 * longitudinal stamp. Adjacent virtual segments use different seeded V
 * offsets and cross-fade with matching end values, so ruts remain continuous.
 */
export function enableRoadAntiTiling(material: THREE.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    const roadSampler = `
float roadHash11( float p ) {
  return fract( sin( p * 127.1 + 19.19 ) * 43758.5453 );
}

vec4 sampleRoadStochastic( sampler2D surfaceMap ) {
  float segment = floor( vMapUv.y );
  float localV = fract( vMapUv.y );
  float blendV = localV * localV * ( 3.0 - 2.0 * localV );
  float offsetA = roadHash11( segment );
  float offsetB = roadHash11( segment + 1.0 );
  vec4 sampleA = texture2D( surfaceMap, vec2( vMapUv.x, localV + offsetA ) );
  vec4 sampleB = texture2D( surfaceMap, vec2( vMapUv.x, localV + offsetB ) );
  return mix( sampleA, sampleB, blendV );
}
`;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <uv_pars_fragment>",
        `#include <uv_pars_fragment>\n${roadSampler}`,
      )
      .replace(
        "#include <map_fragment>",
        `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = sampleRoadStochastic( map );
  diffuseColor *= sampledDiffuseColor;
#endif
`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        `
#ifdef USE_NORMALMAP_TANGENTSPACE
  vec3 mapN = sampleRoadStochastic( normalMap ).xyz * 2.0 - 1.0;
  mapN.xy *= normalScale;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`,
      )
      .replace(
        "#include <roughnessmap_fragment>",
        `
float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
  vec4 texelRoughness = sampleRoadStochastic( roughnessMap );
  roughnessFactor *= texelRoughness.g;
#endif
`,
      );
  };
  material.customProgramCacheKey = () => "road-stochastic-v2";
  material.needsUpdate = true;
  return material;
}

/**
 * Returns the color map (sRGB grass carpet) and a matching tangent-space
 * normal map derived from the same blade strokes. bladeColors are seasonal
 * greens (typically the leaf palette); groundColor is the base soil tint.
 */
export function createGroundTextures(
  groundColor: number,
  bladeColors: number[],
  anisotropy = 4,
  seed = 1,
): SurfaceTextures {
  const size = 512;
  // Shader-based world sampling owns the large-scale cadence. Four repeats are
  // retained only as a graceful fallback before shader compilation.
  const repeat = 4;
  const random = createRandom(seed ^ 0x6a55);
  const data = generateGrassStrokes(size, bladeColors, random);

  const { canvas: colorCanvas, ctx: colorCtx } = makeCanvas(size);
  drawGrassColor(colorCtx, size, groundColor, bladeColors, data, random);
  makeCanvasTileable(colorCanvas, 24);
  const map = makeSurfaceTexture(colorCanvas, repeat, repeat, anisotropy, true);

  const { canvas: heightCanvas, ctx: heightCtx } = makeCanvas(size);
  drawGrassHeight(heightCtx, size, data);
  makeCanvasTileable(heightCanvas, 24);
  const normalCanvas = buildNormalCanvas(heightCanvas, size, 1.15);
  const roughnessCanvas = buildRoughnessCanvas(heightCanvas, size, 150, 0.38);
  const normalMap = makeSurfaceTexture(normalCanvas, repeat, repeat, anisotropy);
  const roughnessMap = makeSurfaceTexture(roughnessCanvas, repeat, repeat, anisotropy);

  return { map, normalMap, roughnessMap };
}

/** Width-aware dirt: damp wheel ruts, raised center ridge and embedded stones. */
export function createRoadTextures(seed = 1, anisotropy = 4): SurfaceTextures {
  const size = 512;
  const random = createRandom(seed ^ 0x4d1d);
  const { canvas: colorCanvas, ctx: color } = makeCanvas(size);
  const { canvas: heightCanvas, ctx: height } = makeCanvas(size);
  color.fillStyle = "#9b7853";
  color.fillRect(0, 0, size, size);
  height.fillStyle = "rgb(128,128,128)";
  height.fillRect(0, 0, size, size);
  const edgeShade = color.createLinearGradient(0, 0, size, 0);
  edgeShade.addColorStop(0, "rgba(62,66,38,.38)");
  edgeShade.addColorStop(0.09, "rgba(76,57,34,.12)");
  edgeShade.addColorStop(0.2, "rgba(76,57,34,0)");
  edgeShade.addColorStop(0.8, "rgba(76,57,34,0)");
  edgeShade.addColorStop(0.91, "rgba(76,57,34,.12)");
  edgeShade.addColorStop(1, "rgba(62,66,38,.38)");
  color.fillStyle = edgeShade;
  color.fillRect(0, 0, size, size);

  // Broad transverse clods keep the path from reading as a perfectly flat strip.
  for (let i = 0; i < 150; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const rx = 8 + random() * 34;
    const ry = 3 + random() * 14;
    const raised = random() > 0.38;
    color.fillStyle = raised ? "rgba(211,171,116,.12)" : "rgba(75,49,29,.16)";
    color.beginPath();
    color.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
    color.fill();
    height.fillStyle = raised ? "rgba(190,190,190,.3)" : "rgba(62,62,62,.25)";
    height.beginPath();
    height.ellipse(x, y, rx, ry, random() * Math.PI, 0, Math.PI * 2);
    height.fill();
  }

  // Long irregular wheel channels and a compacted, lifted middle ridge.
  for (const center of [0.27, 0.73]) {
    color.strokeStyle = "rgba(77,51,32,.46)";
    color.lineWidth = 28;
    height.strokeStyle = "rgba(50,50,50,.56)";
    height.lineWidth = 30;
    color.beginPath();
    height.beginPath();
    for (let y = 0; y <= size; y += 8) {
      // Integer-frequency waves meet at identical positions and tangents on
      // both tile edges, keeping the longitudinal rut seamless.
      const phase = center * Math.PI * 5;
      const x = size * center
        + Math.sin((y / size) * Math.PI * 4 + phase) * 5
        + Math.sin((y / size) * Math.PI * 10 - phase) * 2;
      if (y === 0) {
        color.moveTo(x, y);
        height.moveTo(x, y);
      } else {
        color.lineTo(x, y);
        height.lineTo(x, y);
      }
    }
    color.stroke();
    height.stroke();
    color.strokeStyle = "rgba(55,39,28,.2)";
    color.lineWidth = 7;
    color.stroke();
  }
  const ridge = color.createLinearGradient(0, 0, size, 0);
  ridge.addColorStop(0.34, "rgba(190,146,93,0)");
  ridge.addColorStop(0.5, "rgba(211,169,111,.34)");
  ridge.addColorStop(0.66, "rgba(190,146,93,0)");
  color.fillStyle = ridge;
  color.fillRect(0, 0, size, size);
  const ridgeHeight = height.createLinearGradient(0, 0, size, 0);
  ridgeHeight.addColorStop(0.35, "rgba(128,128,128,0)");
  ridgeHeight.addColorStop(0.5, "rgba(218,218,218,.52)");
  ridgeHeight.addColorStop(0.65, "rgba(128,128,128,0)");
  height.fillStyle = ridgeHeight;
  height.fillRect(0, 0, size, size);

  // Pebbles are shared by color and height, so highlights sit on real relief.
  for (let i = 0; i < 520; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const radius = 0.8 + random() * 2.8;
    const dark = random() < 0.58;
    color.fillStyle = dark ? "rgba(59,44,32,.45)" : "rgba(224,193,145,.42)";
    color.beginPath();
    color.ellipse(x, y, radius * 1.4, radius, random() * Math.PI, 0, Math.PI * 2);
    color.fill();
    height.fillStyle = dark ? "rgba(74,74,74,.45)" : "rgba(235,235,235,.62)";
    height.beginPath();
    height.ellipse(x, y, radius * 1.4, radius, random() * Math.PI, 0, Math.PI * 2);
    height.fill();
  }

  // Match the authored top/bottom texels before stochastic V sampling. Road U
  // stays untouched so its edge shading, twin ruts, and center ridge line up.
  makeCanvasVerticallyTileable(colorCanvas, 30);
  makeCanvasVerticallyTileable(heightCanvas, 30);
  const normalCanvas = buildNormalCanvas(heightCanvas, size, 1.7);
  const roughnessCanvas = buildRoughnessCanvas(heightCanvas, size, 138, 0.48);
  // makeRibbon spans roughly 3.2km with 48 V units. Sixteen fine repeats retain
  // round clods; the material shader randomizes each repetition so it no longer
  // reads as the same four-meter stamp.
  return {
    map: makeSurfaceTexture(colorCanvas, 1, 16, anisotropy, true),
    normalMap: makeSurfaceTexture(normalCanvas, 1, 16, anisotropy),
    roughnessMap: makeSurfaceTexture(roughnessCanvas, 1, 16, anisotropy),
  };
}
