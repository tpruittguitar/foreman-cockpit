import sys, numpy as np
from multiprocessing import Pool
from PIL import Image
import fastscore as F
def seg_one(path):
    import score as S
    im=Image.open(path); m=S.segment(im); an,mn=S.norm(im,m,700); ln=S.parts(an,mn)
    return an,mn,ln
def score_pre(i,pre):
    import cv2
    from skimage.metrics import structural_similarity as ssim
    ar,mr,lr,gr=F.refdata(i); an,mn,ln=pre
    sil=(mr&mn).sum()/max(1,(mr|mn).sum()); ious=[]
    for k in (1,2,3,4):
        u=((lr==k)|(ln==k)).sum(); ious.append(((lr==k)&(ln==k)).sum()/u if u else 1.0)
    gn=cv2.cvtColor(an,cv2.COLOR_RGB2GRAY)*mn; ss=ssim(gr,gn,data_range=255)
    return 0.5*sil+0.3*np.mean(ious)+0.2*ss, sil, ious, ss
def _w(a):
    path,refs=a; pre=seg_one(path); return [score_pre(i,pre) for i in refs]
def score_paths(paths_refs, n=7):
    with Pool(n) as p: return p.map(_w, paths_refs)
