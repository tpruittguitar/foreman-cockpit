"""Bake office/assets/president.glb from Tim's textured mesh export (trimesh GLB: POSITION + TEXCOORD_0, one PNG baseColor texture).

  python3 -I tools/president-glb/bake.py <tim_president.glb> office/assets/president.glb

Steps: read the mesh; find the painted eyes in the texture (the dark slots inside the face patch of the atlas) and diffuse-inpaint
them with the surrounding skin (the office draws live slot eyes there, so they can blink and close for sleep); scale to metres
(1.45 m tall, feet at y=0, x centred, +0.09 m in z so shoulders and hips sit over z=0); add smooth normals welded across UV seams;
write a plain GLB with 16-bit indices and the texture as a quality-88 JPEG. Needs numpy and Pillow only.
"""
import io, json, struct, sys
import numpy as np
from PIL import Image, ImageFilter

HEIGHT, Z_SHIFT = 1.45, 0.09
EYE_WINDOW = (330, 420, 800, 910)  # texture rows/cols holding the two painted eye slots (face patch of the atlas)

def read_glb(path):
    d = open(path, 'rb').read(); L = struct.unpack('<I', d[12:16])[0]; js = json.loads(d[20:20 + L]); b = d[20 + L + 8:]
    def acc(i):
        a = js['accessors'][i]; bv = js['bufferViews'][a['bufferView']]; n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[a['type']]
        dt = {5126: np.float32, 5125: np.uint32, 5123: np.uint16}[a['componentType']]; off = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        arr = np.frombuffer(b, dt, a['count'] * n, off); return arr.reshape(-1, n) if n > 1 else arr
    p = js['meshes'][0]['primitives'][0]; bv = js['bufferViews'][js['images'][0]['bufferView']]; o = bv.get('byteOffset', 0)
    tex = Image.open(io.BytesIO(b[o:o + bv['byteLength']])).convert('RGB')
    return acc(p['attributes']['POSITION']).astype(np.float64), acc(p['attributes']['TEXCOORD_0']), acc(p['indices']).astype(np.int64), tex

def paint_out_eyes(tex):
    img = np.array(tex).astype(np.float32); r0, r1, c0, c1 = EYE_WINDOW
    win = np.zeros(img.shape[:2], bool); win[r0:r1, c0:c1] = True
    mask = win & (img.mean(2) < 60)
    mask = np.array(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))) > 0
    known = ~mask; img[mask] = 0
    for it in range(400):
        acc = np.zeros_like(img); cnt = np.zeros(img.shape[:2], np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            acc += np.roll(np.roll(img, dy, 0), dx, 1) * np.roll(np.roll(known, dy, 0), dx, 1)[..., None]; cnt += np.roll(np.roll(known, dy, 0), dx, 1)
        upd = mask & (cnt > 0) & ~known; img[upd] = acc[upd] / cnt[upd, None]; known = known | upd
        if it > 60:
            avg = sum(np.roll(np.roll(img, dy, 0), dx, 1) for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1))) / 4; img[mask] = avg[mask]
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))

def main(src, dst):
    P, UV, I, tex = read_glb(src)
    buf = io.BytesIO(); paint_out_eyes(tex).save(buf, 'JPEG', quality=88, optimize=True); jpg = buf.getvalue()
    S = HEIGHT / (P[:, 1].max() - P[:, 1].min()); P2 = (P - [0, P[:, 1].min(), 0]) * S
    P2[:, 0] -= (P2[:, 0].max() + P2[:, 0].min()) / 2; P2[:, 2] += Z_SHIFT
    T = I.reshape(-1, 3); _, weld = np.unique(np.round(P2 / 1e-5).astype(np.int64), axis=0, return_inverse=True); weld = weld.ravel()
    fn = np.cross(P2[T[:, 1]] - P2[T[:, 0]], P2[T[:, 2]] - P2[T[:, 0]]); acc = np.zeros((weld.max() + 1, 3))
    for k in range(3): np.add.at(acc, weld[T[:, k]], fn)
    nrm = acc[weld]; nrm = (nrm / (np.linalg.norm(nrm, axis=1, keepdims=True) + 1e-12)).astype(np.float32)
    pos = P2.astype(np.float32); uv = UV.astype(np.float32); idx = I.astype(np.uint16)
    pad = lambda b, c=b'\0': b + c * ((4 - len(b) % 4) % 4)
    chunks = [pad(idx.tobytes()), pos.tobytes(), uv.tobytes(), pad(jpg), nrm.tobytes()]
    offs = np.cumsum([0] + [len(c) for c in chunks]).tolist(); binb = b''.join(chunks)
    gl = {"asset": {"version": "2.0", "generator": "foreman-cockpit president bake (from Tim's trimesh export)"}, "scene": 0, "scenes": [{"nodes": [0]}],
          "nodes": [{"name": "President", "mesh": 0}],
          "meshes": [{"name": "President", "primitives": [{"attributes": {"POSITION": 1, "NORMAL": 3, "TEXCOORD_0": 2}, "indices": 0, "material": 0}]}],
          "materials": [{"name": "PresidentSkin", "pbrMetallicRoughness": {"baseColorTexture": {"index": 0}, "metallicFactor": 0, "roughnessFactor": 0.8}}],
          "textures": [{"source": 0, "sampler": 0}], "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": 33071, "wrapT": 33071}],
          "images": [{"bufferView": 3, "mimeType": "image/jpeg"}],
          "accessors": [{"bufferView": 0, "componentType": 5123, "count": int(idx.size), "type": "SCALAR"},
                        {"bufferView": 1, "componentType": 5126, "count": len(pos), "type": "VEC3", "min": pos.min(0).tolist(), "max": pos.max(0).tolist()},
                        {"bufferView": 2, "componentType": 5126, "count": len(uv), "type": "VEC2"},
                        {"bufferView": 4, "componentType": 5126, "count": len(nrm), "type": "VEC3"}],
          "bufferViews": [{"buffer": 0, "byteOffset": offs[0], "byteLength": idx.nbytes, "target": 34963}, {"buffer": 0, "byteOffset": offs[1], "byteLength": pos.nbytes, "target": 34962},
                          {"buffer": 0, "byteOffset": offs[2], "byteLength": uv.nbytes, "target": 34962}, {"buffer": 0, "byteOffset": offs[3], "byteLength": len(jpg)},
                          {"buffer": 0, "byteOffset": offs[4], "byteLength": nrm.nbytes, "target": 34962}],
          "buffers": [{"byteLength": len(binb)}]}
    js = pad(json.dumps(gl, separators=(',', ':')).encode(), b' ')
    glb = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(binb)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(binb), 0x004E4942) + binb
    open(dst, 'wb').write(glb); print(dst, len(glb), 'bytes, scale', round(S, 4))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
