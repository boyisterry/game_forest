#!/usr/bin/env python3
"""Transfer intact Tripo UVs from the source mesh onto the decimated villa."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.spatial import cKDTree

from repair_villa_textures import (
    append_view,
    embedded_image,
    jpeg_bytes,
    multiscale_noise,
    png_bytes,
    read_glb,
    rebuild_maps,
    write_glb,
)


COMPONENT_TYPES = {5123: np.uint16, 5125: np.uint32, 5126: np.float32}
COMPONENT_COUNTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3}


def accessor(document: dict, binary: bytes, index: int) -> np.ndarray:
    item = document["accessors"][index]
    view = document["bufferViews"][item["bufferView"]]
    dtype = COMPONENT_TYPES[item["componentType"]]
    components = COMPONENT_COUNTS[item["type"]]
    offset = view.get("byteOffset", 0) + item.get("byteOffset", 0)
    return np.frombuffer(binary, dtype=dtype, count=item["count"] * components, offset=offset).reshape(-1, components).copy()


def mesh_arrays(document: dict, binary: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray | None]:
    positions_list: list[np.ndarray] = []
    indices_list: list[np.ndarray] = []
    uvs_list: list[np.ndarray] = []
    normals_list: list[np.ndarray] = []
    vertex_offset = 0
    has_normals = True
    for primitive in document["meshes"][0]["primitives"]:
        positions = accessor(document, binary, primitive["attributes"]["POSITION"]).astype(np.float32)
        indices = accessor(document, binary, primitive["indices"]).reshape(-1, 3).astype(np.int32)
        uv_index = primitive["attributes"].get("TEXCOORD_0")
        uvs = accessor(document, binary, uv_index).astype(np.float32) if uv_index is not None else np.zeros((len(positions), 2), np.float32)
        normal_index = primitive["attributes"].get("NORMAL")
        if normal_index is None:
            has_normals = False
        else:
            normals_list.append(accessor(document, binary, normal_index).astype(np.float32))
        positions_list.append(positions)
        indices_list.append(indices + vertex_offset)
        uvs_list.append(uvs)
        vertex_offset += len(positions)
    return (
        np.concatenate(positions_list),
        np.concatenate(indices_list),
        np.concatenate(uvs_list),
        np.concatenate(normals_list) if has_normals else None,
    )


def smooth_normals(positions: np.ndarray, triangles: np.ndarray) -> np.ndarray:
    tri = positions[triangles]
    face = np.cross(tri[:, 1] - tri[:, 0], tri[:, 2] - tri[:, 0])
    normals = np.zeros_like(positions)
    for corner in range(3):
        np.add.at(normals, triangles[:, corner], face)
    length = np.linalg.norm(normals, axis=1, keepdims=True)
    return normals / np.maximum(length, 1e-8)


def transfer_uv(
    high_positions: np.ndarray,
    high_triangles: np.ndarray,
    high_uvs: np.ndarray,
    high_normals: np.ndarray,
    low_positions: np.ndarray,
    low_triangles: np.ndarray,
) -> np.ndarray:
    low_min, low_max = low_positions.min(axis=0), low_positions.max(axis=0)
    high_min, high_max = high_positions.min(axis=0), high_positions.max(axis=0)
    low_center = (low_min + low_max) * 0.5
    high_center = (high_min + high_max) * 0.5
    scale = (high_max[1] - high_min[1]) / (low_max[1] - low_min[1])
    low_faces = low_positions[low_triangles]
    centroids = low_faces.mean(axis=1, keepdims=True)
    # Pull each corner slightly inside its own face to disambiguate UV seams.
    queries = (low_faces * 0.985 + centroids * 0.015 - low_center) * scale + high_center
    low_face_normals = np.cross(low_faces[:, 1] - low_faces[:, 0], low_faces[:, 2] - low_faces[:, 0])
    low_face_normals /= np.maximum(np.linalg.norm(low_face_normals, axis=1, keepdims=True), 1e-8)
    query_normals = np.repeat(low_face_normals[:, None, :], 3, axis=1).reshape(-1, 3)
    tree = cKDTree(high_positions)
    distances, neighbors = tree.query(queries.reshape(-1, 3), k=24, workers=-1)
    candidate_normals = high_normals[neighbors]
    alignment = np.einsum("nkd,nd->nk", candidate_normals, query_normals)
    # Distance selects the local vertex; normal agreement rejects nearby backfaces/eaves.
    score = distances + np.clip(1 - alignment, 0, 2) * 0.012
    choice = np.argmin(score, axis=1)
    selected = neighbors[np.arange(len(neighbors)), choice]
    return np.clip(high_uvs[selected].reshape(-1, 3, 2), 0, 1).astype(np.float32)


def surface_maps(kind: str, size: int = 512) -> tuple[Image.Image, Image.Image, Image.Image]:
    y, x = np.mgrid[0:size, 0:size]
    noise = multiscale_noise(
        (size, size),
        {"roof": 3101, "plaster": 3102, "wood": 3103, "stone": 3104, "door": 3105, "window": 3106}[kind],
    )
    height = noise * 0.18
    if kind == "roof":
        row = y // 64
        lx = (x + (row % 2) * 32) % 64
        ly = y % 64
        mortar = (lx < 3) | (ly < 4)
        base = np.zeros((size, size, 3), dtype=np.float32)
        base[:] = (0.57, 0.19, 0.105)
        base += noise[..., None] * np.array([0.16, 0.075, 0.045])
        base += ((ly / 64) - 0.5)[..., None] * np.array([-0.055, -0.025, -0.015])
        base[mortar] = (0.24, 0.16, 0.12)
        height += (~mortar) * 0.28 - mortar * 0.22
        roughness = 0.79 + noise * 0.08
    elif kind == "plaster":
        base = np.zeros((size, size, 3), dtype=np.float32)
        base[:] = (0.69, 0.65, 0.55)
        base += noise[..., None] * np.array([0.075, 0.07, 0.06])
        fleck = ((x * 37 + y * 19) % 211) < 3
        base[fleck] *= 0.86
        height += fleck * -0.08
        roughness = 0.91 + noise * 0.045
    elif kind in {"wood", "door"}:
        board = x % 72
        seam = board < 4
        grain = np.sin(y * 0.15 + np.sin(x * 0.07) * 2.2) * 0.035
        base = np.zeros((size, size, 3), dtype=np.float32)
        base[:] = (0.34, 0.22, 0.13) if kind == "wood" else (0.58, 0.31, 0.14)
        base += (noise * 0.09 + grain)[..., None] * np.array([1, 0.62, 0.35])
        base[seam] = (0.14, 0.085, 0.045) if kind == "wood" else (0.25, 0.12, 0.055)
        if kind == "door":
            rail = (y % 168 < 8) | (y % 168 > 158)
            base[rail] *= 0.72
            height += rail * 0.11
        height += grain * 2 - seam * 0.22
        roughness = (0.82 if kind == "wood" else 0.69) + noise * 0.07
    elif kind == "stone":
        row = y // 58
        lx = (x + (row % 2) * 47) % 94
        ly = y % 58
        mortar = (lx < 4) | (ly < 4)
        base = np.zeros((size, size, 3), dtype=np.float32)
        base[:] = (0.43, 0.43, 0.39)
        base += noise[..., None] * np.array([0.12, 0.115, 0.1])
        base[mortar] = (0.21, 0.205, 0.185)
        height += (~mortar) * 0.2 - mortar * 0.18
        roughness = 0.94 + noise * 0.04
    else:
        # Window panes are intentionally distinct from their pale stone surrounds.
        pane_x = x % 128
        pane_y = y % 164
        frame = (pane_x < 9) | (pane_y < 9)
        base = np.zeros((size, size, 3), dtype=np.float32)
        base[:] = (0.25, 0.34, 0.37)
        sky = np.clip(0.09 + (1 - y / size) * 0.12 + noise * 0.035, 0, 0.2)
        base += sky[..., None] * np.array([0.46, 0.68, 0.88])
        base[frame] = (0.30, 0.28, 0.23)
        height *= 0.06
        height[frame] += 0.16
        roughness = np.where(frame, 0.67, 0.22) + noise * 0.025
    base = np.clip(base, 0, 1)
    dx = np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)
    dy = np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)
    nx, ny, nz = -dx * 2.2, dy * 2.2, np.ones_like(dx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal_array = np.stack((nx / length, ny / length, nz / length), axis=2) * 0.5 + 0.5
    occlusion = np.clip(0.94 + height * 0.16, 0.76, 1)
    orm_array = np.stack((occlusion, np.clip(roughness, 0.66, 0.98), np.zeros_like(roughness)), axis=2)
    return (
        Image.fromarray((base * 255 + 0.5).astype(np.uint8), "RGB"),
        Image.fromarray((normal_array * 255 + 0.5).astype(np.uint8), "RGB"),
        Image.fromarray((orm_array * 255 + 0.5).astype(np.uint8), "RGB"),
    )


def transfer_face_colors(
    source: Image.Image,
    high_positions: np.ndarray,
    high_triangles: np.ndarray,
    high_uvs: np.ndarray,
    low_positions: np.ndarray,
    low_triangles: np.ndarray,
) -> np.ndarray:
    """Sample the intact source at matching surface faces, not welded low-UV corners."""
    high_faces = high_positions[high_triangles]
    low_faces = low_positions[low_triangles]
    high_centroids = high_faces.mean(axis=1)
    low_centroids = low_faces.mean(axis=1)
    high_normals = np.cross(high_faces[:, 1] - high_faces[:, 0], high_faces[:, 2] - high_faces[:, 0])
    low_normals = np.cross(low_faces[:, 1] - low_faces[:, 0], low_faces[:, 2] - low_faces[:, 0])
    high_normals /= np.maximum(np.linalg.norm(high_normals, axis=1, keepdims=True), 1e-8)
    low_normals /= np.maximum(np.linalg.norm(low_normals, axis=1, keepdims=True), 1e-8)

    low_min, low_max = low_positions.min(axis=0), low_positions.max(axis=0)
    high_min, high_max = high_positions.min(axis=0), high_positions.max(axis=0)
    low_center = (low_min + low_max) * 0.5
    high_center = (high_min + high_max) * 0.5
    scale = (high_max[1] - high_min[1]) / (low_max[1] - low_min[1])
    queries = (low_centroids - low_center) * scale + high_center
    tree = cKDTree(high_centroids)
    distances, neighbors = tree.query(queries, k=32, workers=-1)
    alignment = np.einsum("nkd,nd->nk", high_normals[neighbors], low_normals)
    score = distances + np.clip(1 - alignment, 0, 2) * (high_max[1] - high_min[1]) * 0.006
    chosen = neighbors[np.arange(len(neighbors)), np.argmin(score, axis=1)]
    uv = high_uvs[high_triangles[chosen]].mean(axis=1)

    pixels = np.asarray(source.convert("RGB"), dtype=np.float32) / 255
    height, width = pixels.shape[:2]
    sx = np.clip((uv[:, 0] * (width - 1)).astype(int), 0, width - 1)
    sy = np.clip(((1 - uv[:, 1]) * (height - 1)).astype(int), 0, height - 1)
    return pixels[sy, sx]


def classify_faces(source_colors: np.ndarray, positions: np.ndarray, triangles: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    red, green, blue = source_colors.T
    luminance = source_colors.mean(axis=1)
    saturation = source_colors.max(axis=1) - source_colors.min(axis=1)
    faces = positions[triangles]
    face_normals = np.cross(faces[:, 1] - faces[:, 0], faces[:, 2] - faces[:, 0])
    face_normals /= np.maximum(np.linalg.norm(face_normals, axis=1, keepdims=True), 1e-8)
    centroids = faces.mean(axis=1)
    y_min = float(positions[:, 1].min())
    y_span = float(np.ptp(positions[:, 1]))
    upper_roof_line = y_min + y_span * 0.66
    elevated_line = y_min + y_span * 0.31
    material = np.full(len(triangles), 3, dtype=np.uint8)  # stone / architectural trim fallback
    roof_color = (red > green * 1.28) & (red > blue * 1.42) & (red > 0.42)
    upward_roof = (face_normals[:, 1] > 0.24) & (centroids[:, 1] > upper_roof_line)
    material[roof_color | upward_roof] = 0
    plaster = (luminance > 0.56) & (saturation < 0.19) & ~upward_roof
    material[plaster] = 1
    warm = (red > green * 1.12) & (green > blue * 1.08)
    wood = warm & (luminance < 0.42)
    material[wood & ~upward_roof] = 2
    # The source door is the only warm, mid-value vertical architectural surface.
    door = warm & (luminance >= 0.36) & (red > 0.45) & (np.abs(face_normals[:, 1]) < 0.45)
    material[door & ~upward_roof] = 4
    # Glass in the source is cool gray. Keep pale stone frames and ground masonry out.
    cool = (blue >= red * 0.92) & (green >= red * 0.94) & (luminance < 0.53)
    elevated_vertical = (centroids[:, 1] > elevated_line) & (np.abs(face_normals[:, 1]) < 0.42)
    material[cool & elevated_vertical & ~upward_roof] = 5
    roof_underside = (face_normals[:, 1] < -0.22) & (centroids[:, 1] > upper_roof_line - y_span * 0.08)
    material[roof_underside] = 2
    return material, face_normals


def smooth_face_materials(material: np.ndarray, triangles: np.ndarray, normals: np.ndarray, iterations: int = 2) -> np.ndarray:
    edge_faces: dict[tuple[int, int], list[int]] = {}
    for face_index, triangle in enumerate(triangles):
        for a, b in ((triangle[0], triangle[1]), (triangle[1], triangle[2]), (triangle[2], triangle[0])):
            edge_faces.setdefault((min(int(a), int(b)), max(int(a), int(b))), []).append(face_index)
    neighbors: list[set[int]] = [set() for _ in triangles]
    for attached in edge_faces.values():
        if len(attached) == 2:
            a, b = attached
            if np.dot(normals[a], normals[b]) > 0.82:
                neighbors[a].add(b)
                neighbors[b].add(a)
    result = material.copy()
    for _ in range(iterations):
        updated = result.copy()
        for face_index, linked in enumerate(neighbors):
            if result[face_index] == 0 or len(linked) < 2:
                continue
            votes = np.bincount([result[face_index], result[face_index], *[result[item] for item in linked]], minlength=4)
            winner = int(np.argmax(votes))
            if winner != 0:
                updated[face_index] = winner
        result = updated
    return result


def planar_uv(positions: np.ndarray, triangles: np.ndarray, face_normals: np.ndarray, materials: np.ndarray) -> np.ndarray:
    faces = positions[triangles]
    output = np.zeros((len(triangles), 3, 2), dtype=np.float32)
    scales = np.array([0.62, 0.42, 0.72, 0.56, 0.68, 0.74], dtype=np.float32)
    dominant = np.argmax(np.abs(face_normals), axis=1)
    for face_index, face in enumerate(faces):
        axis = dominant[face_index]
        if axis == 0:
            coords = face[:, [2, 1]]
        elif axis == 1:
            coords = face[:, [0, 2]]
        else:
            coords = face[:, [0, 1]]
        output[face_index] = coords * scales[materials[face_index]]
    return output


def add_accessor(document: dict, binary: bytearray, array: np.ndarray, component_type: int, kind: str, target: int) -> int:
    data = np.ascontiguousarray(array).tobytes()
    view_index = append_view(document, binary, data)
    document["bufferViews"][view_index]["target"] = target
    accessor_item = {
        "bufferView": view_index,
        "componentType": component_type,
        "count": len(array),
        "type": kind,
    }
    if kind != "SCALAR":
        accessor_item["min"] = np.min(array, axis=0).astype(float).tolist()
        accessor_item["max"] = np.max(array, axis=0).astype(float).tolist()
    else:
        accessor_item["min"] = [int(array.min())]
        accessor_item["max"] = [int(array.max())]
    document["accessors"].append(accessor_item)
    return len(document["accessors"]) - 1


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--high", type=Path, required=True)
    parser.add_argument("--low", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--albedo", type=Path)
    parser.add_argument("--normal", type=Path)
    parser.add_argument("--orm", type=Path)
    args = parser.parse_args()

    high_doc, high_bin = read_glb(args.high)
    low_doc, low_bin = read_glb(args.low)
    high_positions, high_triangles, high_uvs, high_normals = mesh_arrays(high_doc, high_bin)
    low_positions, low_triangles, _, _ = mesh_arrays(low_doc, low_bin)
    if high_normals is None:
        raise ValueError("Source Tripo mesh must contain normals")
    high_albedo = embedded_image(high_doc, high_bin)
    source_colors = transfer_face_colors(
        high_albedo,
        high_positions,
        high_triangles,
        high_uvs,
        low_positions,
        low_triangles,
    )
    face_materials, face_normals = classify_faces(source_colors, low_positions, low_triangles)
    projected_uvs = planar_uv(low_positions, low_triangles, face_normals, face_materials)
    vertex_normals = smooth_normals(low_positions, low_triangles)

    corner_indices = low_triangles.reshape(-1)
    positions = low_positions[corner_indices].astype(np.float32)
    normals = vertex_normals[corner_indices].astype(np.float32)
    uvs = projected_uvs.reshape(-1, 2).astype(np.float32)
    semantic_names = ["roof", "plaster", "wood", "stone", "door", "window"]
    semantic_maps = [surface_maps(name) for name in semantic_names]
    document = {
        "asset": {"version": "2.0", "generator": "Codex house material rebuild", "extras": {"textureRepair": "semantic-house-pbr-v4"}},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": "villa", "mesh": 0}],
        "meshes": [{"name": "villa", "primitives": []}],
        "materials": [],
        "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 10497}],
        "textures": [],
        "images": [],
        "accessors": [],
        "bufferViews": [],
        "buffers": [{"byteLength": 0}],
    }
    binary = bytearray()
    position_accessor = add_accessor(document, binary, positions, 5126, "VEC3", 34962)
    normal_accessor = add_accessor(document, binary, normals, 5126, "VEC3", 34962)
    uv_accessor = add_accessor(document, binary, uvs, 5126, "VEC2", 34962)
    for material_index, name in enumerate(semantic_names):
        texture_base = material_index * 3
        document["materials"].append({
            "name": f"villa_{name}_pbr",
            "doubleSided": False,
            "pbrMetallicRoughness": {
                "baseColorFactor": [1, 1, 1, 1],
                "baseColorTexture": {"index": texture_base},
                "metallicFactor": 1,
                "roughnessFactor": 1,
                "metallicRoughnessTexture": {"index": texture_base + 2},
            },
            "normalTexture": {"index": texture_base + 1, "scale": 0.72},
            "occlusionTexture": {"index": texture_base + 2, "strength": 0.68},
        })
        face_ids = np.flatnonzero(face_materials == material_index)
        material_indices = (face_ids[:, None] * 3 + np.arange(3)[None, :]).astype(np.uint16).reshape(-1, 1)
        index_accessor = add_accessor(document, binary, material_indices, 5123, "SCALAR", 34963)
        document["meshes"][0]["primitives"].append({
            "attributes": {"POSITION": position_accessor, "NORMAL": normal_accessor, "TEXCOORD_0": uv_accessor},
            "indices": index_accessor,
            "material": material_index,
            "mode": 4,
        })
        for suffix, mime, data in (
            ("albedo", "image/jpeg", jpeg_bytes(semantic_maps[material_index][0])),
            ("normal", "image/png", png_bytes(semantic_maps[material_index][1])),
            ("orm", "image/png", png_bytes(semantic_maps[material_index][2])),
        ):
            view = append_view(document, binary, data)
            document["images"].append({"name": f"villa_{name}_{suffix}", "bufferView": view, "mimeType": mime})
            document["textures"].append({"sampler": 0, "source": len(document["images"]) - 1})
    write_glb(args.output, document, bytes(binary))
    preview_albedo = Image.new("RGB", (1536, 1024))
    preview_normal = Image.new("RGB", (1536, 1024))
    preview_orm = Image.new("RGB", (1536, 1024))
    for index, maps in enumerate(semantic_maps):
        box = ((index % 3) * 512, (index // 3) * 512)
        preview_albedo.paste(maps[0], box)
        preview_normal.paste(maps[1], box)
        preview_orm.paste(maps[2], box)
    if args.albedo:
        preview_albedo.save(args.albedo, "JPEG", quality=94, subsampling=0, optimize=True)
    if args.normal:
        preview_normal.save(args.normal, "PNG", optimize=True)
    if args.orm:
        preview_orm.save(args.orm, "PNG", optimize=True)
    print(json.dumps({
        "faces": int(len(low_triangles)),
        "vertices_before": int(len(low_positions)),
        "vertices_after_uv_split": int(len(positions)),
        "source_faces": int(len(high_triangles)),
        "material_faces": {name: int(np.count_nonzero(face_materials == index)) for index, name in enumerate(semantic_names)},
        "output": str(args.output),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
