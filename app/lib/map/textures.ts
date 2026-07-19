import * as THREE from "three";
import { createRandom } from "./random";

function makeCanvas(width: number, height = width) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D is unavailable");
  return { canvas, ctx };
}

/** gpt_demo-style fissured bark: gradient base + bezier cracks. */
export function createBarkTexture(anisotropy = 4) {
  const width = 256;
  const height = 512;
  const { canvas, ctx } = makeCanvas(width, height);
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0, "#443a2d");
  gradient.addColorStop(0.45, "#71634d");
  gradient.addColorStop(1, "#3c3328");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 180; i += 1) {
    const x = Math.random() * width;
    const y = -30 + Math.random() * (height + 30);
    const length = 18 + Math.random() * 64;
    const dark = Math.random() > 0.55;
    ctx.strokeStyle = dark
      ? `rgba(25,20,15,${0.18 + Math.random() * 0.3})`
      : `rgba(210,195,158,${0.08 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.6 + Math.random() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(
      x + (Math.random() * 14 - 7),
      y + length * 0.33,
      x + (Math.random() * 14 - 7),
      y + length * 0.66,
      x + (Math.random() * 4 - 2),
      y + length,
    );
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2.7, 3.8);
  texture.anisotropy = anisotropy;
  return texture;
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

/**
 * Dense lawn carpet baked into the ground tile. This is the far/mid-field read;
 * 3D tufts only add near-camera volume. Stroke list also drives the height field
 * so color and normal relief stay aligned. Seeded for map reproducibility.
 */
function generateGrassStrokes(size: number, bladeColors: number[], random: () => number) {
  const strokes: GrassStroke[] = [];
  // Pack the tile so the tiled ground already reads as undergrowth, not bare soil.
  const rosettes = 5200;
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
  const earth: EarthSpeck[] = [];
  for (let i = 0; i < 48; i += 1) {
    earth.push({
      x: random() * size,
      y: random() * size,
      r: 0.4 + random() * 1.1,
      d: 0.08 + random() * 0.14,
    });
  }
  return { strokes, earth };
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
  const lawnBase = averageColor(bladeColors.length ? bladeColors : [groundColor]);
  ctx.fillStyle = shadeCss(lawnBase, 0.72);
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 48; i += 1) {
    const x = random() * size;
    const y = random() * size;
    const r = 14 + random() * 40;
    const tone = bladeColors[Math.floor(random() * Math.max(bladeColors.length, 1))] ?? lawnBase;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = random() < 0.55;
    grad.addColorStop(0, shadeCss(tone, dark ? 0.55 : 1.08, 0.16 + random() * 0.18));
    grad.addColorStop(1, shadeCss(tone, dark ? 0.55 : 1.08, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
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
): { map: THREE.CanvasTexture; normalMap: THREE.CanvasTexture } {
  const size = 256;
  const repeat = 22;
  const random = createRandom(seed ^ 0x6a55);
  const data = generateGrassStrokes(size, bladeColors, random);

  const { canvas: colorCanvas, ctx: colorCtx } = makeCanvas(size);
  drawGrassColor(colorCtx, size, groundColor, bladeColors, data, random);
  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(repeat, repeat);
  map.anisotropy = anisotropy;

  const { canvas: heightCanvas, ctx: heightCtx } = makeCanvas(size);
  drawGrassHeight(heightCtx, size, data);
  const normalCanvas = buildNormalCanvas(heightCanvas, size, 1.85);
  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(repeat, repeat);
  normalMap.anisotropy = anisotropy;

  return { map, normalMap };
}

export function createRoadTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = "#c7b48e";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 480; i += 1) {
    ctx.fillStyle = i % 3 ? "rgba(86,67,43,.10)" : "rgba(255,244,206,.13)";
    const x = (i * 31) % size;
    const y = (i * 73) % size;
    ctx.beginPath();
    ctx.arc(x, y, 0.6 + (i % 4) * 0.38, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 18);
  return texture;
}
