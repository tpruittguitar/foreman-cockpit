import sys, numpy as np, cv2
from PIL import Image
from skimage.metrics import structural_similarity as ssim
D = '/workspace/office_feedback/president_ref_v2/'
S = 400  # normalised figure height
def segment(im):
    a = np.asarray(im.convert('RGB')).astype(np.float32); h, w = a.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]; u = xx / w * 2 - 1; v = yy / h * 2 - 1
    A = np.stack([np.ones_like(u), u, v, u * u, u * v, v * v, u ** 3, v ** 3, u * u * v, u * v * v], -1).reshape(-1, 10)
    fg = np.zeros((h, w), bool); bm = 10
    for it in range(5):
        bgmask = ~fg
        if it == 0:
            bgmask = np.zeros((h, w), bool); bgmask[:bm] = bgmask[-bm:] = True; bgmask[:, :bm] = bgmask[:, -bm:] = True
        idx = np.where(bgmask.reshape(-1))[0][::7]
        bg = np.stack([A @ np.linalg.lstsq(A[idx], a.reshape(-1, 3)[idx, c], rcond=None)[0] for c in range(3)], -1).reshape(h, w, 3)
        d = np.linalg.norm(a - bg, axis=2)
        fg = cv2.morphologyEx((d > 14).astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
        fg = cv2.dilate(fg.astype(np.uint8), np.ones((9, 9), np.uint8)).astype(bool)
    m = (d > 14).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    if n > 1:
        keep = np.zeros_like(m); big = st[1:, 4].max()
        for i in range(1, n):
            if st[i, 4] >= 0.02 * big: keep[lab == i] = 1
        m = keep
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    m = np.zeros_like(m); cv2.drawContours(m, cnts, -1, 1, -1)
    return m.astype(bool)
def norm(im, m, W):
    ys, xs = np.where(m); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    a = np.asarray(im.convert('RGB'))[y0:y1, x0:x1]; mm = m[y0:y1, x0:x1].astype(np.uint8)
    s = S / a.shape[0]; w = max(1, int(round(a.shape[1] * s)))
    a = cv2.resize(a, (w, S), interpolation=cv2.INTER_AREA); mm = cv2.resize(mm, (w, S), interpolation=cv2.INTER_NEAREST)
    # centre on the silhouette's horizontal centre of mass bbox centre
    oa = np.zeros((S, W, 3), np.uint8); om = np.zeros((S, W), np.uint8); x = (W - w) // 2
    if w <= W: oa[:, x:x + w] = a; om[:, x:x + w] = mm
    else: oa = a[:, -x:-x + W]; om = mm[:, -x:-x + W]
    return oa, om.astype(bool)
def parts(a, m):
    """labels: 0 bg, 1 hair, 2 skin, 3 shirt, 4 trousers/shoes. Rule based on colour + position (works for dark-on-dark)."""
    hsv = cv2.cvtColor(a, cv2.COLOR_RGB2HSV).astype(np.float32)
    r, g, b = [a[..., i].astype(np.float32) for i in range(3)]
    skin = m & (r > 105) & (r > b + 18) & (r >= g)
    dark = m & ~skin
    ys, xs = np.where(m); lab = np.zeros(m.shape, np.uint8)
    lab[skin] = 2
    sk = np.where(skin)
    # head = topmost skin extent; hair = dark pixels above the lowest-chin line, sitting over / beside the head
    if len(sk[0]):
        top = ys.min(); ym = np.median(sk[0]); head_ys = sk[0][sk[0] < np.percentile(sk[0], 45)]
        chin = np.percentile(sk[0], 35) + 0.0
        # chin approximated from skin of the head blob (largest skin blob in upper half)
        n, cl, st, _ = cv2.connectedComponentsWithStats(skin.astype(np.uint8))
        hb = 1 + np.argmax([(cl == i)[:S // 2].sum() for i in range(1, n)]) if n > 1 else 0
        cy = np.where(cl == hb)[0]; chin = cy.max() if len(cy) else S * 0.3
    else: chin = S * 0.3
    yy = np.arange(S)[:, None] * np.ones((1, m.shape[1]))
    xx = np.ones((S, 1)) * np.arange(m.shape[1])[None, :]
    if len(sk[0]):
        hx = np.where(cl == hb)[1]; cxm = (hx.min() + hx.max()) / 2; hw = (hx.max() - hx.min()) / 2
        inhead = np.abs(xx - cxm) < hw * 1.45
    else: inhead = np.ones_like(xx, bool)
    hair = dark & (yy < chin - 0.03 * S) & inhead
    # dark below the chin line: shirt above hip line, trousers below
    low = dark & ~hair
    ly = np.where(low)[0]
    lab[hair] = 1
    if len(ly):
        # hip = lower end of the shirt: find strongest drop in row width of the low-dark region below the torso
        hip = ys.min() + 0.60 * (ys.max() - ys.min())
        lab[low & (yy < hip)] = 3; lab[low & (yy >= hip)] = 4
    # skin below the head line (arms, hands) stays skin; fine
    return lab
def score_view(ref, ren):
    mr, mn = segment(ref), segment(ren)
    W = 700
    ar, mr = norm(ref, mr, W); an, mn = norm(ren, mn, W)
    inter = (mr & mn).sum(); uni = (mr | mn).sum(); sil = inter / max(1, uni)
    lr, ln = parts(ar, mr), parts(an, mn)
    ious = []
    for k in (1, 2, 3, 4):
        u = ((lr == k) | (ln == k)).sum()
        ious.append(((lr == k) & (ln == k)).sum() / u if u else 1.0)
    reg = float(np.mean(ious))
    gr = cv2.cvtColor(ar, cv2.COLOR_RGB2GRAY); gn = cv2.cvtColor(an, cv2.COLOR_RGB2GRAY)
    gr = gr * mr; gn = gn * mn
    ss = ssim(gr, gn, data_range=255)
    return 0.5 * sil + 0.3 * reg + 0.2 * ss, sil, ious, reg, ss, (ar, mr, lr, an, mn, ln)
def diff_overlay(parts_, path):
    ar, mr, lr, an, mn, ln = parts_
    o = np.zeros(ar.shape, np.uint8); o[mr & mn] = (90, 90, 90); o[mr & ~mn] = (255, 60, 60); o[~mr & mn] = (60, 120, 255)
    pal = np.array([[0, 0, 0], [200, 60, 60], [240, 200, 80], [80, 200, 120], [80, 120, 240]], np.uint8)
    Image.fromarray(np.concatenate([o, pal[lr], pal[ln]], 1)).save(path)
def run(rend_dir, tag=None, overlay=None):
    rows = []
    for i in range(1, 7):
        ref = Image.open(D + f'ref{i}.png'); ren = Image.open(f'{rend_dir}/v{i}.png') if rend_dir != 'self' else ref
        s, sil, ious, reg, ss, pk = score_view(ref, ren); rows.append((s, sil, ious, reg, ss))
        if overlay: diff_overlay(pk, f'{overlay}/diff{i}.png')
    print('view  score   sil   region  ssim | hair  skin shirt trou')
    for i, (s, sil, ious, reg, ss) in enumerate(rows, 1):
        print(f'{i}    {s:.3f}  {sil:.3f}  {reg:.3f}  {ss:.3f} | ' + ' '.join(f'{v:.2f}' for v in ious))
    ov = float(np.mean([r[0] for r in rows])); print(f'OVERALL {ov:.4f}  min-view {min(r[0] for r in rows):.3f}')
    return rows, ov
if __name__ == '__main__':
    import os
    ov = sys.argv[2] if len(sys.argv) > 2 else None
    if ov: os.makedirs(ov, exist_ok=True)
    run(sys.argv[1], overlay=ov)
