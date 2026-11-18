import numpy as np, cv2
from PIL import Image
import score as S
from skimage.metrics import structural_similarity as ssim
_R={}
def refdata(i):
    if i not in _R:
        ref=Image.open(S.D+f'ref{i}.png'); m=S.segment(ref); ar,mr=S.norm(ref,m,700); lr=S.parts(ar,mr)
        g=cv2.cvtColor(ar,cv2.COLOR_RGB2GRAY)*mr; _R[i]=(ar,mr,lr,g)
    return _R[i]
def score(i, ren, full=False):
    ar,mr,lr,gr=refdata(i)
    mn=S.segment(ren); an,mn=S.norm(ren,mn,700)
    sil=(mr&mn).sum()/max(1,(mr|mn).sum()); ln=S.parts(an,mn)
    ious=[]
    for k in (1,2,3,4):
        u=((lr==k)|(ln==k)).sum(); ious.append(((lr==k)&(ln==k)).sum()/u if u else 1.0)
    gn=cv2.cvtColor(an,cv2.COLOR_RGB2GRAY)*mn; ss=ssim(gr,gn,data_range=255)
    s=0.5*sil+0.3*np.mean(ious)+0.2*ss
    return (s,sil,ious,ss) if full else s
