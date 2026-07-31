import trimesh
import fast_simplification

m = trimesh.creation.icosphere(subdivisions=5)
print("start", len(m.faces))
v, f = fast_simplification.simplify(m.vertices, m.faces, target_count=500)
print("target_count", len(f))
v2, f2 = fast_simplification.simplify(m.vertices, m.faces, target_reduction=0.95)
print("target_reduction", len(f2))
