#!/usr/bin/env python3
"""
Build a low-poly forest asset pack from Tripo high-poly trees.

- Split wood vs foliage by sampled texture color
- Decimate wood heavily
- Replace foliage with 2-triangle leaf cards
- Emit sized variants: large×3, medium×3, small×2, branches, stumps, shrubs
"""

from __future__ import annotations

import json
import math
import random
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path("/Volumes/li_m2_1/workspace/zd_game1")
OUT_DIR = ROOT / "public" / "models" / "forest"
MANIFEST = OUT_DIR / "manifest.json"

SOURCES = {
    "redwood": ROOT
    / "tripo-output/traditional-dawn-redwood-h31/bfedacd4-8fd2-4213-99bf-43f1af39a70d"
    / "tripo_model_bfedacd4-8fd2-4213-99bf-43f1af39a70d.glb",
    "ancient": ROOT
    / "tripo-output/ancient-tree-high-precision/a3039595-3f0c-4865-8e79-caee9b85f25a"
    / "tripo_model_a3039595-3f0c-4865-8e79-caee9b85f25a.glb",
}


@dataclass
class SplitMeshes:
    wood: trimesh.Trimesh
    leaf_centers: np.ndarray
    leaf_normals: np.ndarray
    leaf_colors: np.ndarray
    height: float


def load_mesh(path: Path) -> trimesh.Trimesh:
    scene = trimesh.load(path, force="scene")
    if isinstance(scene, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(scene.geometry.values()))
    else:
        mesh = scene
    mesh = mesh.copy()
    mesh.remove_unreferenced_vertices()
    return mesh


def orient_y_up(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    """Rotate so the tallest axis becomes +Y and the base sits near y=0."""
    extents = mesh.extents
    up = int(np.argmax(extents))
    if up != 1:
        # permute axes so `up` lands on Y
        order = [0, 1, 2]
        order[up], order[1] = order[1], order[up]
        mesh.vertices = mesh.vertices[:, order]
        if hasattr(mesh.visual, "uv") and mesh.visual.uv is not None:
            pass  # uvs unchanged
    # Center XZ, put min Y at 0
    bounds = mesh.bounds
    mesh.apply_translation([-0.5 * (bounds[0, 0] + bounds[1, 0]), -bounds[0, 1], -0.5 * (bounds[0, 2] + bounds[1, 2])])
    return mesh


def face_colors(mesh: trimesh.Trimesh) -> np.ndarray:
    colored = mesh.visual.to_color().vertex_colors
    return colored[mesh.faces].mean(axis=1)


def split_wood_leaves(mesh: trimesh.Trimesh) -> SplitMeshes:
    fc = face_colors(mesh)
    rgb = fc[:, :3].astype(np.float64)
    red, green, blue = rgb[:, 0], rgb[:, 1], rgb[:, 2]
    # Foliage tends greener / less brown than bark.
    leaf_mask = (green > red * 1.02) & (green > blue * 0.95) & (green > 55)
    # Prefer canopy: ignore very low "green" dirt/moss near ground as leaves if sparse
    centers = mesh.triangles_center
    height = float(mesh.bounds[1, 1] - mesh.bounds[0, 1])
    low = centers[:, 1] < height * 0.12
    leaf_mask = leaf_mask & ~low

    wood_mask = ~leaf_mask
    if wood_mask.sum() < 500:
        # Fallback: lower half = wood
        wood_mask = centers[:, 1] < height * 0.45
        leaf_mask = ~wood_mask

    wood = mesh.submesh([np.nonzero(wood_mask)[0]], append=True)
    if not isinstance(wood, trimesh.Trimesh):
        wood = trimesh.util.concatenate(wood)

    leaf_idx = np.nonzero(leaf_mask)[0]
    leaf_centers = centers[leaf_idx]
    leaf_normals = mesh.face_normals[leaf_idx]
    leaf_colors = fc[leaf_idx]
    return SplitMeshes(wood=wood, leaf_centers=leaf_centers, leaf_normals=leaf_normals, leaf_colors=leaf_colors, height=height)


def decimate(mesh: trimesh.Trimesh, face_count: int) -> trimesh.Trimesh:
    """QEM-simplify toward face_count via fast_simplification."""
    import fast_simplification

    target = max(48, int(face_count))
    out = mesh.copy()
    try:
        out.merge_vertices(merge_tex=True, merge_norm=True)
    except TypeError:
        out.merge_vertices()
    out.remove_unreferenced_vertices()
    out.update_faces(out.unique_faces())
    out.remove_unreferenced_vertices()
    if len(out.faces) <= target:
        return out

    vertices = out.vertices.astype("float64")
    faces = out.faces.astype("int64")
    for _ in range(4):
        if len(faces) <= target * 1.1:
            break
        # Prefer reduction ratio when target_count plateaus on messy Tripo topology.
        reduction = min(0.97, 1.0 - (target / max(len(faces), 1)))
        reduction = max(0.35, reduction)
        try:
            vertices, faces = fast_simplification.simplify(
                vertices,
                faces,
                target_count=target,
            )
        except Exception:
            vertices, faces = fast_simplification.simplify(
                vertices,
                faces,
                target_reduction=reduction,
            )
        if len(faces) <= target * 1.25:
            break
        # If still high, force another reduction pass
        if len(faces) > target * 1.5:
            vertices, faces = fast_simplification.simplify(
                vertices,
                faces,
                target_reduction=min(0.85, 1.0 - target / len(faces)),
            )

    simplified = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    simplified.remove_unreferenced_vertices()
    return simplified if len(simplified.faces) else out


def make_leaf_cards(
    centers: np.ndarray,
    normals: np.ndarray,
    colors: np.ndarray,
    count: int,
    size: float,
    seed: int,
) -> trimesh.Trimesh:
    """Each leaf is a camera-ish quad = 2 triangles (2 faces)."""
    rng = np.random.default_rng(seed)
    if len(centers) == 0:
        # Tiny placeholder card
        centers = np.array([[0.0, 0.6, 0.0]])
        normals = np.array([[0.0, 0.0, 1.0]])
        colors = np.array([[70, 120, 45, 255]], dtype=np.uint8)

    replace = count > len(centers)
    pick = rng.choice(len(centers), size=count, replace=replace)
    up = np.array([0.0, 1.0, 0.0])
    vertices_list: list[np.ndarray] = []
    faces: list[list[int]] = []
    vcols: list[np.ndarray] = []
    base = 0

    for idx in pick:
        c = centers[idx]
        n = normals[idx].astype(np.float64)
        n = n / (np.linalg.norm(n) + 1e-8)
        # Blend with up so cards stay readable from above/side
        n = n * 0.65 + up * 0.35
        n = n / (np.linalg.norm(n) + 1e-8)
        side = np.cross(n, up)
        if np.linalg.norm(side) < 1e-5:
            side = np.array([1.0, 0.0, 0.0])
        side = side / np.linalg.norm(side)
        bitangent = np.cross(n, side)
        bitangent = bitangent / (np.linalg.norm(bitangent) + 1e-8)
        s = size * float(rng.uniform(0.7, 1.35))
        ang = float(rng.uniform(0, math.pi * 2))
        ca, sa = math.cos(ang), math.sin(ang)
        sx = side * ca + bitangent * sa
        sy = -side * sa + bitangent * ca
        hx, hy = sx * s * 0.55, sy * s * 0.75
        corners = np.stack([c - hx - hy, c + hx - hy, c + hx + hy, c - hx + hy], axis=0)
        vertices_list.append(corners)
        faces.append([base, base + 1, base + 2])
        faces.append([base, base + 2, base + 3])
        col = colors[idx].astype(np.uint8).copy()
        col[1] = np.clip(int(col[1]) + 18, 0, 255)
        vcols.append(np.repeat(col[None, :], 4, axis=0))
        base += 4

    vertices = np.concatenate(vertices_list, axis=0)
    faces_arr = np.asarray(faces, dtype=np.int64)
    vcolor = np.concatenate(vcols, axis=0)
    card = trimesh.Trimesh(vertices=vertices, faces=faces_arr, process=False)
    card.visual.vertex_colors = vcolor
    return card


def bake_wood_color(mesh: trimesh.Trimesh, default=(92, 72, 48, 255)) -> trimesh.Trimesh:
    mesh = mesh.copy()
    try:
        colors = mesh.visual.to_color().vertex_colors
        mesh.visual.vertex_colors = colors
    except Exception:
        mesh.visual.vertex_colors = np.tile(np.asarray(default, dtype=np.uint8), (len(mesh.vertices), 1))
    return mesh


def combine_scene(wood: trimesh.Trimesh, leaves: trimesh.Trimesh) -> trimesh.Scene:
    wood = bake_wood_color(wood)
    scene = trimesh.Scene()
    scene.add_geometry(wood, geom_name="wood")
    scene.add_geometry(leaves, geom_name="leaves")
    return scene


def export_glb(scene: trimesh.Scene, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.export(path)
    # Collect stats
    total_f = sum(len(g.faces) for g in scene.geometry.values())
    total_v = sum(len(g.vertices) for g in scene.geometry.values())
    wood_f = len(scene.geometry["wood"].faces) if "wood" in scene.geometry else 0
    leaf_f = len(scene.geometry["leaves"].faces) if "leaves" in scene.geometry else 0
    return {
        "file": path.name,
        "bytes": path.stat().st_size,
        "vertices": int(total_v),
        "faces": int(total_f),
        "wood_faces": int(wood_f),
        "leaf_faces": int(leaf_f),
        "leaf_cards": int(leaf_f // 2),
        "height": float(scene.bounds[1, 1] - scene.bounds[0, 1]),
    }


def scale_to_height(mesh: trimesh.Trimesh, height: float) -> trimesh.Trimesh:
    mesh = mesh.copy()
    h = float(mesh.bounds[1, 1] - mesh.bounds[0, 1])
    if h < 1e-6:
        return mesh
    mesh.apply_scale(height / h)
    # Re-seat on ground
    mesh.apply_translation([0, -mesh.bounds[0, 1], 0])
    return mesh


def transform_points(points: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    ones = np.ones((len(points), 1))
    homo = np.hstack([points, ones])
    out = homo @ matrix.T
    return out[:, :3]


def build_tree_variant(
    split: SplitMeshes,
    *,
    name: str,
    target_height: float,
    wood_faces: int,
    leaf_cards: int,
    leaf_size: float,
    seed: int,
    yaw: float = 0.0,
    stretch_xz: float = 1.0,
    stretch_y: float = 1.0,
    canopy_keep: float = 1.0,
) -> tuple[trimesh.Scene, dict]:
    rng = random.Random(seed)
    wood = split.wood.copy()
    # Non-uniform stretch in local space before height normalize
    wood.vertices[:, 0] *= stretch_xz
    wood.vertices[:, 2] *= stretch_xz
    wood.vertices[:, 1] *= stretch_y
    wood = scale_to_height(wood, target_height)
    wood = decimate(wood, wood_faces)

    centers = split.leaf_centers.copy()
    normals = split.leaf_normals.copy()
    colors = split.leaf_colors.copy()
    centers[:, 0] *= stretch_xz
    centers[:, 2] *= stretch_xz
    centers[:, 1] *= stretch_y
    # Match wood height scale
    src_h = max(split.height * stretch_y, 1e-6)
    scale = target_height / src_h
    centers *= scale
    centers[:, 1] -= centers[:, 1].min() if len(centers) else 0
    # Lift leaves to match seated wood
    if len(centers):
        # Keep relative canopy: drop some lower leaf samples when canopy_keep < 1
        y = centers[:, 1]
        y_cut = np.quantile(y, max(0.0, 1.0 - canopy_keep)) if canopy_keep < 0.999 else y.min() - 1
        keep = y >= y_cut
        centers, normals, colors = centers[keep], normals[keep], colors[keep]

    if abs(yaw) > 1e-6:
        c, s = math.cos(yaw), math.sin(yaw)
        rot = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
        wood.vertices = wood.vertices @ rot.T
        if len(centers):
            centers = centers @ rot.T
            normals = normals @ rot.T
        wood.apply_translation([0, -wood.bounds[0, 1], 0])

    leaves = make_leaf_cards(centers, normals, colors, leaf_cards, leaf_size * target_height, seed)
    # Seat leaves with wood
    if len(leaves.vertices):
        # Keep leaf Y relative; already scaled
        pass

    scene = combine_scene(wood, leaves)
    stats = export_glb(scene, OUT_DIR / f"{name}.glb")
    stats.update(
        {
            "id": name,
            "kind": "tree",
            "height": target_height,
            "seed": seed,
            "yaw": yaw,
        }
    )
    print(
        f"wrote {name}.glb  wood_f={stats['wood_faces']} leaf_cards={stats['leaf_cards']} "
        f"bytes={stats['bytes'] // 1024}kb"
    )
    return scene, stats


def build_stump(split: SplitMeshes, name: str, height: float, wood_faces: int, seed: int) -> dict:
    wood = split.wood.copy()
    wood = scale_to_height(wood, height * 3.2)  # scale full then crop
    y = wood.triangles_center[:, 1]
    keep = y <= height * 1.15
    if keep.sum() < 20:
        keep = y <= np.quantile(y, 0.2)
    wood = wood.submesh([np.nonzero(keep)[0]], append=True)
    wood = scale_to_height(wood, height)
    wood = decimate(wood, wood_faces)
    # Tiny moss card set (still 2-face cards), few only
    leaves = make_leaf_cards(
        np.array([[0.0, height * 0.7, 0.0]]),
        np.array([[0.0, 1.0, 0.0]]),
        np.array([[60, 90, 40, 255]], dtype=np.uint8),
        count=2,
        size=height * 0.15,
        seed=seed,
    )
    scene = combine_scene(wood, leaves)
    stats = export_glb(scene, OUT_DIR / f"{name}.glb")
    stats.update({"id": name, "kind": "stump", "height": height, "seed": seed})
    print(f"wrote {name}.glb  wood_f={stats['wood_faces']} bytes={stats['bytes'] // 1024}kb")
    return stats


def build_branch(split: SplitMeshes, name: str, length: float, wood_faces: int, seed: int) -> dict:
    wood = split.wood.copy()
    wood = scale_to_height(wood, 12.0)
    centers = wood.triangles_center
    radial = np.linalg.norm(centers[:, [0, 2]], axis=1)
    y = centers[:, 1]
    # Side limb band
    keep = (y > 3.5) & (y < 9.0) & (radial > np.quantile(radial, 0.55))
    if keep.sum() < 30:
        keep = radial > np.quantile(radial, 0.7)
    wood = wood.submesh([np.nonzero(keep)[0]], append=True)
    # Lay branch along +X with base near origin
    wood = decimate(wood, wood_faces)
    # Orient longest extent to X
    extents = wood.extents
    axis = int(np.argmax(extents))
    if axis != 0:
        order = [0, 1, 2]
        order[axis], order[0] = order[0], order[axis]
        wood.vertices = wood.vertices[:, order]
    # Normalize length
    span = float(wood.bounds[1, 0] - wood.bounds[0, 0])
    if span > 1e-6:
        wood.apply_scale(length / span)
    wood.apply_translation([-wood.bounds[0, 0], -wood.bounds[0, 1], -0.5 * (wood.bounds[0, 2] + wood.bounds[1, 2])])
    leaves = make_leaf_cards(
        wood.triangles_center[:: max(1, len(wood.faces) // 12)],
        wood.face_normals[:: max(1, len(wood.faces) // 12)],
        np.tile(np.array([[66, 110, 42, 255]], dtype=np.uint8), (max(1, len(wood.faces) // 12 + 1), 1)),
        count=8,
        size=length * 0.08,
        seed=seed,
    )
    scene = combine_scene(wood, leaves)
    stats = export_glb(scene, OUT_DIR / f"{name}.glb")
    stats.update({"id": name, "kind": "branch", "length": length, "seed": seed})
    print(f"wrote {name}.glb  wood_f={stats['wood_faces']} bytes={stats['bytes'] // 1024}kb")
    return stats


def build_shrub(split: SplitMeshes, name: str, height: float, wood_faces: int, leaf_cards: int, seed: int) -> dict:
    wood = split.wood.copy()
    wood = scale_to_height(wood, height * 2.4)
    y = wood.triangles_center[:, 1]
    keep = y <= height * 1.4
    wood = wood.submesh([np.nonzero(keep)[0]], append=True)
    wood = scale_to_height(wood, height * 0.55)
    wood = decimate(wood, wood_faces)

    src_h = max(split.height, 1e-6)
    scale = height / src_h
    if len(split.leaf_centers):
        centers = split.leaf_centers * scale
        centers[:, 1] *= 0.5
        keep = centers[:, 1] < height
        centers = centers[keep]
        normals = split.leaf_normals[keep]
        colors = split.leaf_colors[keep]
    else:
        centers = np.zeros((0, 3))
        normals = np.zeros((0, 3))
        colors = np.zeros((0, 4), dtype=np.uint8)

    leaves = make_leaf_cards(centers, normals, colors, leaf_cards, height * 0.18, seed)
    scene = combine_scene(wood, leaves)
    stats = export_glb(scene, OUT_DIR / f"{name}.glb")
    stats.update({"id": name, "kind": "shrub", "height": height, "seed": seed})
    print(f"wrote {name}.glb  wood_f={stats['wood_faces']} leaf_cards={stats['leaf_cards']} bytes={stats['bytes'] // 1024}kb")
    return stats


def prepare_source(name: str, path: Path) -> SplitMeshes:
    print(f"\n== loading {name} ==")
    mesh = load_mesh(path)
    print(f"  raw faces={len(mesh.faces)} verts={len(mesh.vertices)}")
    mesh = orient_y_up(mesh)
    print(f"  oriented height={mesh.extents[1]:.3f}")
    split = split_wood_leaves(mesh)
    print(
        f"  wood_faces={len(split.wood.faces)} leaf_faces_src={len(split.leaf_centers)} "
        f"height={split.height:.3f}"
    )
    # Pre-decimate wood working copy to keep later ops fast (still high enough for crops)
    working = decimate(split.wood, min(28000, max(8000, len(split.wood.faces) // 8)))
    print(f"  wood working faces={len(working.faces)}")
    split.wood = working
    return split


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sources = {key: prepare_source(key, path) for key, path in SOURCES.items()}
    assets: list[dict] = []

    # --- Large trees (3) ---
    assets.append(
        build_tree_variant(
            sources["redwood"],
            name="tree_large_redwood_a",
            target_height=22.0,
            wood_faces=3200,
            leaf_cards=110,
            leaf_size=0.085,
            seed=11,
            yaw=0.2,
        )[1]
    )
    assets.append(
        build_tree_variant(
            sources["ancient"],
            name="tree_large_ancient_a",
            target_height=20.0,
            wood_faces=3400,
            leaf_cards=120,
            leaf_size=0.09,
            seed=17,
            yaw=-0.4,
            stretch_xz=1.08,
        )[1]
    )
    assets.append(
        build_tree_variant(
            sources["redwood"],
            name="tree_large_redwood_b",
            target_height=24.0,
            wood_faces=3000,
            leaf_cards=100,
            leaf_size=0.08,
            seed=23,
            yaw=1.1,
            stretch_y=1.12,
            stretch_xz=0.92,
            canopy_keep=0.9,
        )[1]
    )

    # --- Medium trees (3) ---
    assets.append(
        build_tree_variant(
            sources["redwood"],
            name="tree_medium_redwood_a",
            target_height=13.0,
            wood_faces=1800,
            leaf_cards=70,
            leaf_size=0.09,
            seed=31,
            yaw=0.7,
        )[1]
    )
    assets.append(
        build_tree_variant(
            sources["ancient"],
            name="tree_medium_ancient_a",
            target_height=12.0,
            wood_faces=1900,
            leaf_cards=75,
            leaf_size=0.095,
            seed=37,
            yaw=-1.0,
        )[1]
    )
    assets.append(
        build_tree_variant(
            sources["redwood"],
            name="tree_medium_redwood_b",
            target_height=11.5,
            wood_faces=1600,
            leaf_cards=65,
            leaf_size=0.088,
            seed=41,
            yaw=2.0,
            stretch_xz=1.15,
            canopy_keep=0.85,
        )[1]
    )

    # --- Small trees (2) ---
    assets.append(
        build_tree_variant(
            sources["redwood"],
            name="tree_small_redwood_a",
            target_height=6.5,
            wood_faces=900,
            leaf_cards=36,
            leaf_size=0.1,
            seed=53,
            yaw=0.3,
            stretch_y=0.95,
        )[1]
    )
    assets.append(
        build_tree_variant(
            sources["ancient"],
            name="tree_small_ancient_a",
            target_height=5.8,
            wood_faces=850,
            leaf_cards=32,
            leaf_size=0.11,
            seed=59,
            yaw=-1.4,
            stretch_xz=1.1,
        )[1]
    )

    # --- Branches ---
    assets.append(build_branch(sources["redwood"], "branch_redwood_a", length=4.5, wood_faces=420, seed=71))
    assets.append(build_branch(sources["ancient"], "branch_ancient_a", length=5.2, wood_faces=480, seed=73))
    assets.append(build_branch(sources["redwood"], "branch_redwood_b", length=3.4, wood_faces=320, seed=79))

    # --- Stumps ---
    assets.append(build_stump(sources["redwood"], "stump_redwood_a", height=1.4, wood_faces=520, seed=83))
    assets.append(build_stump(sources["ancient"], "stump_ancient_a", height=1.7, wood_faces=580, seed=89))

    # --- Shrubs ---
    assets.append(
        build_shrub(sources["redwood"], "shrub_redwood_a", height=2.2, wood_faces=360, leaf_cards=48, seed=97)
    )
    assets.append(
        build_shrub(sources["ancient"], "shrub_ancient_a", height=2.6, wood_faces=400, leaf_cards=55, seed=101)
    )
    assets.append(
        build_shrub(sources["redwood"], "shrub_redwood_b", height=1.8, wood_faces=300, leaf_cards=40, seed=103)
    )

    manifest = {
        "version": 1,
        "description": "Decimated Tripo forest pack; leaves are 2-face cards.",
        "assets": assets,
        "groups": {
            "tree_large": [a["id"] for a in assets if a["id"].startswith("tree_large_")],
            "tree_medium": [a["id"] for a in assets if a["id"].startswith("tree_medium_")],
            "tree_small": [a["id"] for a in assets if a["id"].startswith("tree_small_")],
            "branch": [a["id"] for a in assets if a["id"].startswith("branch_")],
            "stump": [a["id"] for a in assets if a["id"].startswith("stump_")],
            "shrub": [a["id"] for a in assets if a["id"].startswith("shrub_")],
        },
    }
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("\nManifest:", MANIFEST)
    print("Assets:", len(assets))


if __name__ == "__main__":
    main()
