#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

function align4(value) {
  return (value + 3) & ~3;
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseGlb(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error("Expected a binary glTF 2.0 file");
  }
  let json;
  let bin;
  for (let offset = 12; offset < buffer.length;) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(data.toString("utf8").trimEnd());
    if (type === BIN_CHUNK) bin = Buffer.from(data);
    offset += 8 + length;
  }
  if (!json || !bin) throw new Error("GLB must contain JSON and BIN chunks");
  return { json, bin };
}

function isBark(r, g, b) {
  return r > g * 1.18 && r > b * 1.25 && r - g > 18;
}

function refinePixels(source, width, height) {
  const color = Buffer.alloc(source.length);
  const heightField = new Float32Array(width * height);
  const barkMask = new Uint8Array(width * height);

  for (let i = 0, pixel = 0; i < source.length; i += 3, pixel += 1) {
    const r = source[i];
    const g = source[i + 1];
    const b = source[i + 2];
    const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
    const bark = isBark(r, g, b);
    barkMask[pixel] = bark ? 1 : 0;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const grain = (((x * 17 + y * 31 + (x ^ y) * 7) % 19) - 9) * (bark ? 0.32 : 0.12);

    if (bark) {
      // Natural dawn-redwood red-brown: keep luminance detail, remove magenta paint.
      color[i] = clampByte(55 + luma * 0.64 + (r - g) * 0.1 + grain);
      color[i + 1] = clampByte(27 + luma * 0.34 + grain * 0.45);
      color[i + 2] = clampByte(18 + luma * 0.25 + grain * 0.3);
    } else {
      // Cooler layered needle greens with lifted shadows and restrained saturation.
      color[i] = clampByte(30 + luma * 0.39 + r * 0.08 + grain);
      color[i + 1] = clampByte(42 + luma * 0.52 + g * 0.08 + grain);
      color[i + 2] = clampByte(21 + luma * 0.29 + b * 0.08 + grain * 0.7);
    }
    heightField[pixel] =
      color[i] * 0.2126 + color[i + 1] * 0.7152 + color[i + 2] * 0.0722;
  }

  const normal = Buffer.alloc(width * height * 3);
  const orm = Buffer.alloc(width * height * 3);
  const sample = (x, y) => heightField[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const strength = barkMask[pixel] ? 0.052 : 0.028;
      const dx = (sample(x - 1, y) - sample(x + 1, y)) * strength;
      const dy = (sample(x, y - 1) - sample(x, y + 1)) * strength;
      const inverseLength = 1 / Math.hypot(dx, dy, 1);
      normal[pixel * 3] = clampByte((dx * inverseLength * 0.5 + 0.5) * 255);
      normal[pixel * 3 + 1] = clampByte((dy * inverseLength * 0.5 + 0.5) * 255);
      normal[pixel * 3 + 2] = clampByte((inverseLength * 0.5 + 0.5) * 255);

      const roughness = barkMask[pixel]
        ? 220 + Math.min(22, Math.abs(sample(x - 1, y) - sample(x + 1, y)) * 0.45)
        : 172 + Math.min(20, Math.abs(sample(x, y - 1) - sample(x, y + 1)) * 0.35);
      orm[pixel * 3] = 255; // available for AO consumers
      orm[pixel * 3 + 1] = clampByte(roughness);
      orm[pixel * 3 + 2] = 0; // non-metallic wood and foliage
    }
  }
  return { color, normal, orm };
}

function appendBufferView(json, parts, data) {
  const currentLength = parts.reduce((sum, part) => sum + part.length, 0);
  const alignedLength = align4(currentLength);
  if (alignedLength > currentLength) parts.push(Buffer.alloc(alignedLength - currentLength));
  const byteOffset = alignedLength;
  parts.push(data);
  const index = json.bufferViews.length;
  json.bufferViews.push({ buffer: 0, byteOffset, byteLength: data.length });
  return index;
}

function buildGlb(json, bin) {
  const jsonBytes = Buffer.from(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.length);
  const binLength = align4(bin.length);
  const output = Buffer.alloc(12 + 8 + jsonLength + 8 + binLength, 0);
  output.write("glTF", 0, "ascii");
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonLength, 12);
  output.writeUInt32LE(JSON_CHUNK, 16);
  jsonBytes.copy(output, 20);
  output.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binHeader = 20 + jsonLength;
  output.writeUInt32LE(binLength, binHeader);
  output.writeUInt32LE(BIN_CHUNK, binHeader + 4);
  bin.copy(output, binHeader + 8);
  return output;
}

async function main() {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg || !outputArg) {
    throw new Error("Usage: node scripts/refine-glb-textures.mjs input.glb output.glb");
  }
  const input = path.resolve(inputArg);
  const output = path.resolve(outputArg);
  const { json, bin } = parseGlb(await fs.readFile(input));
  const image = json.images?.[0];
  if (!image?.bufferView || image.mimeType !== "image/jpeg") {
    throw new Error("Expected the Tripo base-color JPEG in image 0");
  }
  const sourceView = json.bufferViews[image.bufferView];
  const sourceImage = bin.subarray(sourceView.byteOffset ?? 0, (sourceView.byteOffset ?? 0) + sourceView.byteLength);
  const { data: raw, info } = await sharp(sourceImage).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  if (info.channels !== 3) throw new Error(`Expected RGB base color, got ${info.channels} channels`);
  const refined = refinePixels(raw, info.width, info.height);
  const baseColor = await sharp(refined.color, { raw: { width: info.width, height: info.height, channels: 3 } })
    .sharpen({ sigma: 1.05 })
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer();
  const normal = await sharp(refined.normal, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const orm = await sharp(refined.orm, { raw: { width: info.width, height: info.height, channels: 3 } })
    .png({ compressionLevel: 9, palette: true, quality: 100 })
    .toBuffer();

  const parts = [bin];
  const baseView = appendBufferView(json, parts, baseColor);
  const normalView = appendBufferView(json, parts, normal);
  const ormView = appendBufferView(json, parts, orm);
  json.images[0] = { name: "DawnRedwood_BaseColor_Refined", mimeType: "image/jpeg", bufferView: baseView };
  json.images.push(
    { name: "DawnRedwood_Normal", mimeType: "image/png", bufferView: normalView },
    { name: "DawnRedwood_OcclusionRoughnessMetallic", mimeType: "image/png", bufferView: ormView },
  );
  json.textures ??= [];
  const normalTexture = json.textures.push({ source: json.images.length - 2 }) - 1;
  const ormTexture = json.textures.push({ source: json.images.length - 1 }) - 1;
  for (const material of json.materials ?? []) {
    material.normalTexture = { index: normalTexture, scale: 0.72 };
    material.pbrMetallicRoughness ??= {};
    material.pbrMetallicRoughness.metallicFactor = 0;
    material.pbrMetallicRoughness.roughnessFactor = 1;
    material.pbrMetallicRoughness.metallicRoughnessTexture = { index: ormTexture };
    material.extras = { ...(material.extras ?? {}), textureRevision: "refined-dawn-redwood-pbr-v1" };
  }
  const combinedBin = Buffer.concat(parts);
  json.buffers[0].byteLength = combinedBin.length;
  json.asset.extras = { ...(json.asset.extras ?? {}), textureRevision: "refined-dawn-redwood-pbr-v1" };

  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, buildGlb(json, combinedBin));
  const mapsDir = path.join(path.dirname(output), `${path.parse(output).name}_textures`);
  await fs.mkdir(mapsDir, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(mapsDir, "basecolor.jpg"), baseColor),
    fs.writeFile(path.join(mapsDir, "normal.png"), normal),
    fs.writeFile(path.join(mapsDir, "occlusion-roughness-metallic.png"), orm),
  ]);
  console.log(JSON.stringify({ output, mapsDir, width: info.width, height: info.height, bytes: (await fs.stat(output)).size }, null, 2));
}

await main();
