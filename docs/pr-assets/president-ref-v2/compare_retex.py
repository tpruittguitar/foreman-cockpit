import sys, numpy as np, pscore
from PIL import Image, ImageDraw, ImageFont
D='/workspace/office_feedback/president_ref_v2/'; d=sys.argv[1]; out=sys.argv[2]
r=pscore.score_paths([(f'{d}/v{i}.png',[i]) for i in range(1,7)])
sc=[x[0][0] for x in r]
W,H=340,455; M=Image.new('RGB',(W*6,H*2+70),(30,31,34)); dr=ImageDraw.Draw(M)
try: f=ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',22)
except Exception: f=ImageFont.load_default()
for i in range(6):
    M.paste(Image.open(D+f'ref{i+1}.png').convert('RGB').resize((W,H)),(i*W,0))
    M.paste(Image.open(f'{d}/v{i+1}.png').convert('RGB').resize((W,H)),(i*W,H))
    dr.text((i*W+8,8),f'ref {i+1}',fill=(255,255,255),font=f); dr.text((i*W+8,H+8),f'view {i+1}: {sc[i]*100:.1f}%',fill=(255,230,120),font=f)
dr.text((10,2*H+20),f'Overall {np.mean(sc)*100:.1f}% (target 95%, every view 92%) | score = 0.5 silhouette IoU + 0.3 region IoU + 0.2 SSIM | top: reference, bottom: render',fill=(255,255,255),font=f)
M.save(out); print('overall',round(float(np.mean(sc)),4),[round(s,3) for s in sc])
