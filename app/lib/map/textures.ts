import * as THREE from "three";

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

export function createGroundTexture() {
  const size = 256;
  const { canvas, ctx } = makeCanvas(size);
  ctx.fillStyle = "#a8b394";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 1800; i += 1) {
    const tone = 105 + (i % 6) * 8;
    ctx.fillStyle = `rgba(${tone - 25},${tone},${tone - 34},${0.06 + (i % 5) * 0.02})`;
    ctx.fillRect((i * 47) % size, (i * 83) % size, 1 + (i % 3), 1 + ((i * 3) % 4));
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(28, 28);
  return texture;
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
