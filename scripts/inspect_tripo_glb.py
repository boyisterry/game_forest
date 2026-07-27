#!/usr/bin/env python3
"""Inspect Tripo GLB mesh statistics."""
from pathlib import Path
import trimesh

PATHS = [
    Path(
        "/Volumes/li_m2_1/workspace/zd_game1/tripo-output/traditional-dawn-redwood-h31/"
        "bfedacd4-8fd2-4213-99bf-43f1af39a70d/tripo_model_bfedacd4-8fd2-4213-99bf-43f1af39a70d.glb"
    ),
    Path(
        "/Volumes/li_m2_1/workspace/zd_game1/tripo-output/ancient-tree-high-precision/"
        "a3039595-3f0c-4865-8e79-caee9b85f25a/tripo_model_a3039595-3f0c-4865-8e79-caee9b85f25a.glb"
    ),
]


def main() -> None:
    for path in PATHS:
        print("===", path.name, "size_mb", round(path.stat().st_size / 1e6, 1))
        scene = trimesh.load(path, force="scene")
        print("type", type(scene))
        if not isinstance(scene, trimesh.Scene):
            geom = scene
            print("single mesh v", len(geom.vertices), "f", len(geom.faces))
            continue
        print("nodes", len(scene.graph.nodes), "geometry", len(scene.geometry))
        total_f = total_v = 0
        for name, geom in scene.geometry.items():
            faces = len(geom.faces) if hasattr(geom, "faces") else 0
            verts = len(geom.vertices) if hasattr(geom, "vertices") else 0
            total_f += faces
            total_v += verts
            print(f"  mesh={name!r} v={verts} f={faces} bounds={getattr(geom, 'bounds', None)}")
        print("TOTAL v", total_v, "f", total_f)
        print("scene bounds", scene.bounds)
        print()


if __name__ == "__main__":
    main()
