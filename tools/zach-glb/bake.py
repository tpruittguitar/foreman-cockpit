"""Bake office/assets/zach.glb from Tim's Zach model (Tripo glTF export: indexed POSITION + NORMAL + TEXCOORD_0, color / ORM / normal maps).

  python3 -I tools/zach-glb/bake.py <survey-corps-chibi-compat.glb> office/assets/zach.glb [target_triangles]

Zach is a person who visits the office, not a bot, and is kept at most 3/4 of the President's 1.45 m height (Tim, Nov 19).
Steps: read the mesh; weld it by position with per-corner (wedge) UVs; decimate it with MeshLab's texture-aware quadric edge
collapse from about 470k to TARGET triangles, so UV seams stay intact; turn it 90 degrees so it faces +z like the other characters; split it back into glTF vertices, one per (position, UV) pair; scale to metres (HEIGHT tall, feet at y=0, centred in x and z);
add smooth normals welded across UV seams; keep only the color map, resized to TEX px, as a quality-88 JPEG (the office lights
the model like the President: one map, no ORM or normal map); write a plain GLB with 32-bit indices.
Needs numpy, Pillow and pymeshlab (on Linux, pymeshlab also needs the libopengl0 system package).
"""
import io, json, os, struct, sys, tempfile
import numpy as np
from PIL import Image
import pymeshlab as ml

HEIGHT, TEX, TARGET = 1.0, 1024, 40000

def read_glb(path):
    d = open(path, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; js = json.loads(d[20:20 + L]); b = d[20 + L + 8:]
    def acc(i):
        a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        stride = bv.get('byteStride', 0); size = np.dtype(dt).itemsize * n
        if stride and stride != size:
            raw = np.frombuffer(b, np.uint8, (a['count'] - 1) * stride + size, off)
            arr = np.lib.stride_tricks.as_strided(raw, (a['count'], size), (stride, 1)).copy().view(dt)
        else:
            arr = np.frombuffer(b, dt, a['count'] * n, off)
        return arr.reshape(-1, n) if n > 1 else arr
    p = js['meshes'][0]['primitives'][0]; mat = js['materials'][p['material']]
    src = js['textures'][mat['pbrMetallicRoughness']['baseColorTexture']['index']]['source']
    bv = js['bufferViews'][js['images'][src]['bufferView']]; o = bv.get('byteOffset', 0)
    tex = Image.open(io.BytesIO(b[o:o + bv['byteLength']])).convert('RGB')
    return acc(p['attributes']['POSITION']).astype(np.float64), acc(p['attributes']['TEXCOORD_0']).astype(np.float32), acc(p['indices']).astype(np.int64), tex

def main(src, dst, target=TARGET):
    P, UV, I, tex = read_glb(src)
    F = I.reshape(-1, 3)
    _, first, weld = np.unique(np.round(P / 1e-7).astype(np.int64), axis=0, return_index=True, return_inverse=True); weld = weld.ravel()
    tmp = tempfile.mkdtemp(); tex.save(os.path.join(tmp, 'tex.png'))  # MeshLab takes textured wedge UVs from an OBJ + MTL, not from arrays
    with open(os.path.join(tmp, 'm.mtl'), 'w') as f: f.write('newmtl m\nmap_Kd tex.png\n')
    with open(os.path.join(tmp, 'm.obj'), 'w') as f:
        f.write('mtllib m.mtl\nusemtl m\n'); np.savetxt(f, P[first], fmt='v %.7f %.7f %.7f')
        np.savetxt(f, UV, fmt='vt %.7f %.7f'); W1 = weld[F] + 1; T1 = F + 1
        np.savetxt(f, np.stack([W1[:, 0], T1[:, 0], W1[:, 1], T1[:, 1], W1[:, 2], T1[:, 2]], 1), fmt='f %d/%d %d/%d %d/%d')
    ms = ml.MeshSet(); ms.load_new_mesh(os.path.join(tmp, 'm.obj'))
    ms.meshing_decimation_quadric_edge_collapse_with_texture(targetfacenum=target, qualitythr=0.5, extratcoordw=1, preserveboundary=True, optimalplacement=True)
    d = ms.current_mesh(); V = d.vertex_matrix(); FD = d.face_matrix().astype(np.int64); W = d.wedge_tex_coord_matrix().astype(np.float32)
    key = np.concatenate([FD.reshape(-1, 1).astype(np.float64), np.round(W.astype(np.float64) * 2 ** 20)], 1)
    _, ufirst, uinv = np.unique(key, axis=0, return_index=True, return_inverse=True); uinv = uinv.ravel()
    P2 = V[FD.ravel()[ufirst]]; uv = W[ufirst]; F2 = uinv.reshape(-1, 3)
    P2 = np.stack([-P2[:, 2], P2[:, 1], P2[:, 0]], 1)  # Tripo faces +x; the office faces characters along +z
    P2 = P2.astype(np.float64)
    S = HEIGHT / (P2[:, 1].max() - P2[:, 1].min()); P2 = (P2 - [0, P2[:, 1].min(), 0]) * S
    P2[:, 0] -= (P2[:, 0].max() + P2[:, 0].min()) / 2; P2[:, 2] -= (P2[:, 2].max() + P2[:, 2].min()) / 2
    T = F2.astype(np.int64); _, weld = np.unique(np.round(P2 / 1e-5).astype(np.int64), axis=0, return_inverse=True); weld = weld.ravel()
    fn = np.cross(P2[T[:, 1]] - P2[T[:, 0]], P2[T[:, 2]] - P2[T[:, 0]]); acc = np.zeros((weld.max() + 1, 3))
    for k in range(3): np.add.at(acc, weld[T[:, k]], fn)
    nrm = acc[weld]; nrm = (nrm / (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12)).astype(np.float32)
    buf = io.BytesIO(); tex.resize((TEX, TEX), Image.LANCZOS).save(buf, 'JPEG', quality=88, optimize=True); jpg = buf.getvalue()
    pos = P2.astype(np.float32); idx = T.ravel().astype(np.uint32)
    pad = lambda b, c=b'\0': b + c * ((4 - len(b) % 4) % 4)
    chunks = [pad(idx.tobytes()), pos.tobytes(), uv.tobytes(), pad(jpg), nrm.tobytes()]
    offs = np.cumsum([0] + [len(c) for c in chunks]).tolist(); binb = b''.join(chunks)
    gl = {"asset": {"version": "2.0", "generator": "foreman-cockpit zach bake (from Tim's Tripo export)"}, "scene": 0, "scenes": [{"nodes": [0]}],
          "nodes": [{"name": "Zach", "mesh": 0}],
          "meshes": [{"name": "Zach", "primitives": [{"attributes": {"POSITION": 1, "NORMAL": 3, "TEXCOORD_0": 2}, "indices": 0, "material": 0}]}],
          "materials": [{"name": "ZachSkin", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.8}}],
          "textures": [{"source": 0, "sampler": 0}], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
          "images": [{"bufferView": 3, "mimeType": "image/jpeg"}],
          "accessors": [{"bufferView": 0, "componentType": 5125, "count": int(idx.size), "type": "SCALAR"},
                        {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
                        {"bufferView": 2, "componentType": 5126, "count": len(uv), "type": "VEC2"},
                        {"bufferView": 4, "componentType": 5126, "count": len(nrm), "type": "VEC3"}],
          "bufferViews": [{"buffer": 0, "byteOffset": offs[0], "byteLength": idx.nbytes, "target": 34963}, {"buffer": 0, "byteOffset": offs[1], "byteLength": pos.nbytes, "target": 34962},
                          {"buffer": 0, "byteOffset": offs[2], "byteLength": uv.nbytes, "target": 34962}, {"buffer": 0, "byteOffset": offs[3], "byteLength": len(jpg)},
                          {"buffer": 0, "byteOffset": offs[4], "byteLength": nrm.nbytes, "target": 34962}],
          "buffers": [{"byteLength": len(binb)}]}
    js = pad(json.dumps(gl, separators=(',', ':')).encode(), b' ')
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb
    open(dst, 'wb').write(glb); print(dst, len(glb), 'bytes,', len(T), 'triangles,', len(pos), 'vertices, scale', round(S, 4), 'size', (pos.max(0) - pos.min(0)).round(3).tolist())

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv) > 3 else TARGET)
