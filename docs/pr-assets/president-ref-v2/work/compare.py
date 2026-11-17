import sys
from PIL import Image, ImageDraw
import os; d=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','refs')+'/'; w=sys.argv[1]; out=sys.argv[2]
H=480
def fit(p):
    im=Image.open(p).convert('RGB'); return im.resize((int(im.width*H/im.height),H))
top=[fit(d+f'ref{i}.png') for i in range(1,7)]; bot=[fit(f'{w}/v{i}.png') for i in range(1,7)]
W=max(sum(i.width for i in top),sum(i.width for i in bot))
c=Image.new('RGB',(W,H*2+4),(20,20,20)); x=0
for i in top: c.paste(i,(x,0)); x+=i.width
x=0
for i in bot: c.paste(i,(x,H+4)); x+=i.width
c.save(out)
