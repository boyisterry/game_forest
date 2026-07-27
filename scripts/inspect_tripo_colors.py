#!/usr/bin/env python3
import numpy as np
import trimesh
from pathlib import Path

p = Path(
    "/Volumes/li_m2_1/workspace/zd_game1/tripo-output/traditional-dawn-redwood-h31/"
    "bfedacd4-8fd2-4213-99bf-43f1af39a70d/tripo_model_bfedacd4-8fd2-4213-99bf-43f1af39a70d.glb"
)
scene = trimesh.load(p, force="scene")
geom = list(scene.geometry.values())[0]
print("visual", type(geom.visual))
print("material", getattr(geom.visual, "material", None))
uv = getattr(geom.visual, "uv", None)
print("uv", None if uv is None else np.asarray(uv).shape)
print("extents", geom.extents)
print("centroid", geom.centroid)
try:
    colors = geom.visual.to_color().vertex_colors
    print("to_color", colors.shape, colors.mean(axis=0))
    fc = colors[geom.faces].mean(axis=1)
    green = fc[:, 1].astype(float)
    red = fc[:, 0].astype(float)
    print("face color mean RGB", fc.mean(axis=0))
    print("green>red fraction", float((green > red * 1.05).mean()))
    print("green>100 fraction", float((green > 100).mean()))
    # height of green faces vs brown
    face_y = geom.triangles_center[:, 1]
    leaf_mask = green > red * 1.02
    print("leaf face y mean", float(face_y[leaf_mask].mean()) if leaf_mask.any() else None)
    print("wood face y mean", float(face_y[~leaf_mask].mean()) if (~leaf_mask).any() else None)
except Exception as e:
    print("color err", repr(e))
