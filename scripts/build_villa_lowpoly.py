#!/usr/bin/env python3
"""Decimate the Tripo western villa into a game-ready low-poly GLB."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import trimesh
import fast_simplification

ROOT = Path("/Volumes/li_m2_1/workspace/zd_game1")
SRC = (
    ROOT
    / "tripo-output/small-western-villa-h31/4bd1abda-615d-4fd7-b887-e4ae227af581"
    / "tripo_model_4bd1abda-615d-4fd7-b887-e4ae227af581.glb"
)
OUT_DIR = ROOT / "public" / "models" / "buildings"
OUT_GLB = OUT_DIR / "villa_western_low.glb"
MANIFEST = OUT_DIR / "manifest.json"

# Face budgets for a readable house silhouette without Tripo density.
TARGET_FACES = 4500
WORKING_FACES = 40000


def load_mesh(path: Path) -> trimesh.Trimesh:
    scene = trimesh.load(path, force="scene")
    if isinstance(scene, trimesh.Scene):
        mesh = trimesh.util.concatenate(tuple(scene.geometry.values()))
    else:
        mesh = scene
    return mesh.copy()


def orient_y_up_and_ground(mesh: trimesh.Trimesh) -> trimesh.Trimesh:
    extents = mesh.extents
    up = int(np.argmax(extents))
    if up != 1:
        order = [0, 1, 2]
        order[up], order[1] = order[1], order[up]
        mesh.vertices = mesh.vertices[:, order]
    bounds = mesh.bounds
    mesh.apply_translation(
        [
            -0.5 * (bounds[0, 0] + bounds[1, 0]),
            -bounds[0, 1],
            -0.5 * (bounds[0, 2] + bounds[1, 2]),
        ]
    )
    return mesh


def scale_to_height(mesh: trimesh.Trimesh, height: float) -> trimesh.Trimesh:
    h = float(mesh.bounds[1, 1] - mesh.bounds[0, 1])
    if h < 1e-6:
        return mesh
    mesh.apply_scale(height / h)
    mesh.apply_translation([0, -mesh.bounds[0, 1], 0])
    return mesh


def decimate(mesh: trimesh.Trimesh, face_count: int) -> trimesh.Trimesh:
    target = max(64, int(face_count))
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
    # Two-stage: coarse then to target (Tripo meshes often plateau on one pass).
    if len(faces) > WORKING_FACES:
        vertices, faces = fast_simplification.simplify(
            vertices, faces, target_count=WORKING_FACES
        )
    vertices, faces = fast_simplification.simplify(vertices, faces, target_count=target)
    if len(faces) > target * 1.35:
        vertices, faces = fast_simplification.simplify(
            vertices,
            faces,
            target_reduction=min(0.9, 1.0 - target / max(len(faces), 1)),
        )

    simplified = trimesh.Trimesh(vertices=vertices, faces=faces, process=False)
    simplified.remove_unreferenced_vertices()

    # Bake approximate vertex colors from the source texture so the low mesh
    # still reads without relying on destroyed UVs after QEM.
    try:
        src_colors = mesh.visual.to_color().vertex_colors
        # Nearest source vertex color by proximity (sampled subset for speed).
        src_pts = mesh.vertices
        step = max(1, len(src_pts) // 80000)
        sample_pts = src_pts[::step]
        sample_cols = src_colors[::step]
        from scipy.spatial import cKDTree  # optional

        tree = cKDTree(sample_pts)
        _, idx = tree.query(simplified.vertices, k=1)
        simplified.visual.vertex_colors = sample_cols[idx]
    except Exception:
        try:
            # Fallback: face-average transfer via closest triangle centers
            fc = mesh.visual.to_color().vertex_colors[mesh.faces].mean(axis=1)
            centers = mesh.triangles_center
            # brute chunked nearest for small target meshes
            colors = np.zeros((len(simplified.vertices), 4), dtype=np.uint8)
            chunk = 2000
            for start in range(0, len(simplified.vertices), chunk):
                pts = simplified.vertices[start : start + chunk]
                d = ((centers[None, :, :] - pts[:, None, :]) ** 2).sum(axis=2)
                nearest = d.argmin(axis=1)
                colors[start : start + chunk] = fc[nearest]
            simplified.visual.vertex_colors = colors
        except Exception:
            simplified.visual.vertex_colors = np.tile(
                np.array([168, 152, 128, 255], dtype=np.uint8),
                (len(simplified.vertices), 1),
            )
    return simplified


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("loading", SRC.name)
    mesh = load_mesh(SRC)
    print(f"  raw faces={len(mesh.faces)} verts={len(mesh.vertices)}")
    mesh = orient_y_up_and_ground(mesh)
    # Game-scale villa height (~7.5m eaves/ridge readable from courier cam).
    mesh = scale_to_height(mesh, 7.5)
    print(f"  oriented height={mesh.extents[1]:.3f} extents={mesh.extents}")

    low = decimate(mesh, TARGET_FACES)
    print(f"  low faces={len(low.faces)} verts={len(low.vertices)}")

    scene = trimesh.Scene()
    scene.add_geometry(low, geom_name="villa")
    scene.export(OUT_GLB)

    stats = {
        "id": "villa_western_low",
        "file": OUT_GLB.name,
        "source": str(SRC.relative_to(ROOT)),
        "bytes": OUT_GLB.stat().st_size,
        "vertices": int(len(low.vertices)),
        "faces": int(len(low.faces)),
        "height": float(low.extents[1]),
        "extents": [float(x) for x in low.extents],
    }
    MANIFEST.write_text(json.dumps({"version": 1, "assets": [stats]}, indent=2), encoding="utf-8")
    print(f"wrote {OUT_GLB} ({stats['bytes'] // 1024} kb, {stats['faces']} faces)")
    print("manifest", MANIFEST)


if __name__ == "__main__":
    main()
