#!/usr/bin/env python3
"""Create a compact GLB geometry using quadric-error mesh simplification."""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import fast_simplification
import numpy as np
import trimesh
from PIL import Image


def load_geometry(path: Path) -> trimesh.Trimesh:
    # An in-memory stream avoids a trimesh/pathlib double-close bug in the
    # rpg_game environment.  The scene conversion also applies node transforms.
    source_stream = open(path, "rb")
    stream = io.BytesIO(source_stream.read())
    scene = trimesh.load(stream, file_type=path.suffix.lstrip("."), force="scene", process=False)
    meshes = []
    for node_name in scene.graph.nodes_geometry:
        transform, geometry_name = scene.graph[node_name]
        mesh = scene.geometry[geometry_name].copy()
        mesh.apply_transform(transform)
        meshes.append(mesh)
    if not meshes:
        raise ValueError(f"No triangle geometry found in {path}")
    return trimesh.util.concatenate(meshes)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--target-faces", type=int, default=7600)
    parser.add_argument("--aggressiveness", type=float, default=5.0)
    args = parser.parse_args()

    source = load_geometry(args.input)
    source_faces = np.asarray(source.faces, dtype=np.int32)
    source_vertices = np.asarray(source.vertices, dtype=np.float64)
    vertices, faces = fast_simplification.simplify(
        source_vertices,
        source_faces,
        target_count=args.target_faces,
        agg=args.aggressiveness,
    )

    reduced = trimesh.Trimesh(vertices=vertices, faces=faces, process=False, validate=False)
    reduced.remove_unreferenced_vertices()
    # A placeholder UV channel keeps the intermediate GLB compatible with the
    # semantic texture-transfer step.  It is replaced before final delivery.
    placeholder = Image.new("RGB", (2, 2), (190, 180, 160))
    reduced.visual = trimesh.visual.texture.TextureVisuals(
        uv=np.zeros((len(reduced.vertices), 2), dtype=np.float32),
        material=trimesh.visual.material.PBRMaterial(
            name="decimated_placeholder",
            baseColorTexture=placeholder,
            metallicFactor=0.0,
            roughnessFactor=1.0,
        ),
    )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_bytes(trimesh.exchange.gltf.export_glb(reduced, include_normals=True))
    print(json.dumps({
        "input": str(args.input),
        "output": str(args.output),
        "source_vertices": int(len(source_vertices)),
        "source_faces": int(len(source_faces)),
        "output_vertices": int(len(reduced.vertices)),
        "output_faces": int(len(reduced.faces)),
        "reduction_percent": round((1 - len(reduced.faces) / len(source_faces)) * 100, 4),
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
