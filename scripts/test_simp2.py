import numpy as np
import trimesh
import fast_simplification
from pathlib import Path

src = Path(
    "/Volumes/li_m2_1/workspace/zd_game1/tripo-output/traditional-dawn-redwood-h31/"
    "bfedacd4-8fd2-4213-99bf-43f1af39a70d/tripo_model_bfedacd4-8fd2-4213-99bf-43f1af39a70d.glb"
)
scene = trimesh.load(src, force="scene")
mesh = trimesh.util.concatenate(tuple(scene.geometry.values()))
# quick wood-ish: lower faces by y
centers = mesh.triangles_center
keep = centers[:, 1] < 0.35
wood = mesh.submesh([np.nonzero(keep)[0]], append=True)
print("wood", len(wood.faces))
v, f = fast_simplification.simplify(wood.vertices, wood.faces, target_count=2000)
print("to 2000 ->", len(f))
v2, f2 = fast_simplification.simplify(wood.vertices, wood.faces, target_reduction=0.97)
print("reduction 0.97 ->", len(f2))
# from 28k
v3, f3 = fast_simplification.simplify(wood.vertices, wood.faces, target_count=28000)
print("to 28k ->", len(f3))
v4, f4 = fast_simplification.simplify(v3, f3, target_count=3000)
print("28k then 3k ->", len(f4))
