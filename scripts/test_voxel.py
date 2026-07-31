import trimesh
import numpy as np
from pathlib import Path
import fast_simplification

src = Path(
    "/Volumes/li_m2_1/workspace/zd_game1/tripo-output/traditional-dawn-redwood-h31/"
    "bfedacd4-8fd2-4213-99bf-43f1af39a70d/tripo_model_bfedacd4-8fd2-4213-99bf-43f1af39a70d.glb"
)
scene = trimesh.load(src, force="scene")
mesh = trimesh.util.concatenate(tuple(scene.geometry.values()))
centers = mesh.triangles_center
keep = centers[:, 1] < 0.4
wood = mesh.submesh([np.nonzero(keep)[0]], append=True)
print("wood", len(wood.faces))
# voxel remesh
vox = wood.voxelized(pitch=0.015).marching_cubes
print("voxel", len(vox.faces))
v, f = fast_simplification.simplify(vox.vertices, vox.faces, target_count=2500)
print("voxel->2500", len(f))
