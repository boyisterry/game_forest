#!/usr/bin/env python3
"""Rebuild the western villa's atlas and embed a compact PBR texture set."""

from __future__ import annotations

import argparse
import json
import shutil
import struct
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter


def read_glb(path: Path) -> tuple[dict, bytes]:
    # Keep compatibility with the rpg_game environment where the GLB loader may
    # close a descriptor internally before pathlib's context manager exits.
    stream = open(path, "rb")
    payload = stream.read()
    try:
        stream.close()
    except OSError:
        pass
    magic, version, total = struct.unpack_from("<4sII", payload, 0)
    if magic != b"glTF" or version != 2 or total != len(payload):
        raise ValueError(f"Unsupported GLB header: {path}")
    offset = 12
    document = None
    binary = None
    while offset < len(payload):
        length, kind = struct.unpack_from("<I4s", payload, offset)
        offset += 8
        chunk = payload[offset : offset + length]
        offset += length
        if kind == b"JSON":
            document = json.loads(chunk.decode("utf-8").rstrip(" \x00"))
        elif kind == b"BIN\x00":
            binary = chunk
    if document is None or binary is None:
        raise ValueError("GLB must contain JSON and BIN chunks")
    return document, binary


def embedded_image(document: dict, binary: bytes, index: int = 0) -> Image.Image:
    image = document["images"][index]
    view = document["bufferViews"][image["bufferView"]]
    start = view.get("byteOffset", 0)
    raw = binary[start : start + view["byteLength"]]
    return Image.open(BytesIO(raw)).convert("RGB")


def multiscale_noise(shape: tuple[int, int], seed: int) -> np.ndarray:
    height, width = shape
    rng = np.random.default_rng(seed)
    result = np.zeros((height, width), dtype=np.float32)
    for grid, weight in ((32, 0.55), (96, 0.3), (256, 0.15)):
        small = Image.fromarray((rng.random((grid, grid)) * 255).astype(np.uint8))
        layer = np.asarray(small.resize((width, height), Image.Resampling.BICUBIC), dtype=np.float32) / 255
        result += (layer - 0.5) * weight
    return result


def rebuild_maps(source: Image.Image) -> tuple[Image.Image, Image.Image, Image.Image]:
    base = np.asarray(source, dtype=np.float32) / 255
    red, green, blue = base[..., 0], base[..., 1], base[..., 2]
    maximum = base.max(axis=2)
    minimum = base.min(axis=2)
    saturation = (maximum - minimum) / np.maximum(maximum, 1e-4)
    luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
    noise = multiscale_noise(luminance.shape, 24719)

    roof = (red > 0.28) & (red > green * 1.35) & (red > blue * 1.45)
    plaster = (luminance > 0.56) & (saturation < 0.2)
    stone = (luminance >= 0.29) & (luminance <= 0.58) & (saturation < 0.19)
    wood = (red > green * 1.12) & (green > blue * 1.08) & (luminance < 0.43) & ~roof

    enhanced = base.copy()
    # Terracotta: richer mineral red, readable mortar, restrained tonal variation.
    roof_target = np.stack((red * 1.08 + 0.045, green * 0.9, blue * 0.82), axis=2)
    enhanced[roof] = roof_target[roof] + noise[roof, None] * np.array([0.11, 0.055, 0.035])
    # Lime plaster: warm rather than chalk-white, with subtle age and aggregate.
    plaster_tint = np.stack((red * 1.015 + 0.018, green * 0.995 + 0.012, blue * 0.955), axis=2)
    enhanced[plaster] = plaster_tint[plaster] + noise[plaster, None] * 0.035
    # Previously flat grey islands become varied limestone/slate instead of dead polygons.
    stone_tint = np.stack((red * 0.98 + 0.018, green * 1.005 + 0.012, blue * 1.025 + 0.008), axis=2)
    enhanced[stone] = stone_tint[stone] + noise[stone, None] * 0.065
    # Timber receives warmer grain contrast without painting across UV boundaries.
    wood_tint = np.stack((red * 1.06 + 0.015, green * 0.94, blue * 0.86), axis=2)
    enhanced[wood] = wood_tint[wood] + noise[wood, None] * np.array([0.07, 0.045, 0.025])
    enhanced = np.clip(enhanced, 0, 1)
    albedo = Image.fromarray((enhanced * 255 + 0.5).astype(np.uint8), "RGB")
    albedo = ImageEnhance.Contrast(albedo).enhance(1.06)
    albedo = ImageEnhance.Color(albedo).enhance(1.05)

    # Derive a seam-safe micro-height field: suppress large atlas-boundary gradients.
    enhanced_luma = np.asarray(albedo.convert("L"), dtype=np.float32) / 255
    blurred = np.asarray(albedo.convert("L").filter(ImageFilter.GaussianBlur(5)), dtype=np.float32) / 255
    detail = (enhanced_luma - blurred) * 0.7 + noise * 0.22
    dx = np.roll(detail, -1, axis=1) - np.roll(detail, 1, axis=1)
    dy = np.roll(detail, -1, axis=0) - np.roll(detail, 1, axis=0)
    seam_x = np.abs(np.roll(enhanced_luma, -1, axis=1) - np.roll(enhanced_luma, 1, axis=1)) > 0.22
    seam_y = np.abs(np.roll(enhanced_luma, -1, axis=0) - np.roll(enhanced_luma, 1, axis=0)) > 0.22
    dx[seam_x] = 0
    dy[seam_y] = 0
    strength = 3.2
    nx, ny = -dx * strength, dy * strength
    nz = np.ones_like(nx)
    norm = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_array = np.stack((nx / norm, ny / norm, nz / norm), axis=2) * 0.5 + 0.5
    normal = Image.fromarray((np.clip(normal_array, 0, 1) * 255 + 0.5).astype(np.uint8), "RGB")

    roughness = np.full(luminance.shape, 0.86, dtype=np.float32)
    roughness[roof] = 0.76
    roughness[plaster] = 0.9
    roughness[stone] = 0.94
    roughness[wood] = 0.8
    roughness = np.clip(roughness + noise * 0.09, 0.62, 0.98)
    occlusion = np.clip(0.92 + detail * 0.5, 0.72, 1)
    orm_array = np.stack((occlusion, roughness, np.zeros_like(roughness)), axis=2)
    orm = Image.fromarray((orm_array * 255 + 0.5).astype(np.uint8), "RGB")
    return albedo, normal, orm


def png_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, "PNG", optimize=True)
    return output.getvalue()


def jpeg_bytes(image: Image.Image) -> bytes:
    output = BytesIO()
    image.save(output, "JPEG", quality=94, subsampling=0, optimize=True)
    return output.getvalue()


def compact_binary(document: dict, original: bytes, replacements: dict[int, bytes]) -> bytearray:
    compacted = bytearray()
    for index, view in enumerate(document["bufferViews"]):
        while len(compacted) % 4:
            compacted.append(0)
        source_start = view.get("byteOffset", 0)
        data = replacements.get(index, original[source_start : source_start + view["byteLength"]])
        view["byteOffset"] = len(compacted)
        view["byteLength"] = len(data)
        compacted.extend(data)
    return compacted


def append_view(document: dict, binary: bytearray, data: bytes) -> int:
    while len(binary) % 4:
        binary.append(0)
    offset = len(binary)
    binary.extend(data)
    view = {"buffer": 0, "byteOffset": offset, "byteLength": len(data)}
    document.setdefault("bufferViews", []).append(view)
    return len(document["bufferViews"]) - 1


def write_glb(path: Path, document: dict, binary: bytes) -> None:
    document["buffers"][0]["byteLength"] = len(binary)
    json_data = json.dumps(document, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    json_data += b" " * ((4 - len(json_data) % 4) % 4)
    bin_data = binary + b"\x00" * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(json_data) + 8 + len(bin_data)
    payload = (
        struct.pack("<4sII", b"glTF", 2, total)
        + struct.pack("<I4s", len(json_data), b"JSON")
        + json_data
        + struct.pack("<I4s", len(bin_data), b"BIN\x00")
        + bin_data
    )
    path.write_bytes(payload)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("--backup", type=Path)
    parser.add_argument("--albedo", type=Path)
    parser.add_argument("--normal", type=Path)
    parser.add_argument("--orm", type=Path)
    args = parser.parse_args()
    backup = args.backup or args.model.with_name(args.model.stem + "_original.glb")
    if not backup.exists():
        shutil.copy2(args.model, backup)
    document, original_binary = read_glb(backup)
    source = embedded_image(document, original_binary)
    albedo, normal, orm = rebuild_maps(source)
    albedo_view = document["images"][0]["bufferView"]
    binary = compact_binary(document, original_binary, {albedo_view: jpeg_bytes(albedo)})
    normal_view = append_view(document, binary, png_bytes(normal))
    orm_view = append_view(document, binary, png_bytes(orm))
    document["images"][0] = {"name": "villa_albedo_enhanced", "bufferView": albedo_view, "mimeType": "image/jpeg"}
    document["images"].extend([
        {"name": "villa_normal", "bufferView": normal_view, "mimeType": "image/png"},
        {"name": "villa_orm", "bufferView": orm_view, "mimeType": "image/png"},
    ])
    document["textures"].extend([{"source": 1}, {"source": 2}])
    material = document["materials"][0]
    pbr = material["pbrMetallicRoughness"]
    pbr.update({"baseColorTexture": {"index": 0}, "metallicRoughnessTexture": {"index": 2}, "metallicFactor": 1, "roughnessFactor": 1})
    material.update({"name": "villa_pbr_enhanced", "normalTexture": {"index": 1, "scale": 0.78}, "occlusionTexture": {"index": 2, "strength": 0.7}})
    document.setdefault("asset", {}).setdefault("extras", {})["textureRepair"] = "deterministic-villa-pbr-v1"
    write_glb(args.model, document, bytes(binary))
    if args.albedo:
        albedo.save(args.albedo, "JPEG", quality=94, subsampling=0, optimize=True)
    if args.normal:
        normal.save(args.normal, "PNG", optimize=True)
    if args.orm:
        orm.save(args.orm, "PNG", optimize=True)
    print(json.dumps({"model": str(args.model), "backup": str(backup), "size": source.size, "textures": 3}, ensure_ascii=False))


if __name__ == "__main__":
    main()
