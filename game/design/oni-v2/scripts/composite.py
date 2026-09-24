import os as _os
_REPO = _os.path.abspath(_os.path.join(_os.path.dirname(__file__), '..', '..', '..', '..'))  # repo root
import sys, os
from PIL import Image, ImageDraw
H = os.path.join(os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')), 'renders') + '/'
design=Image.open(_os.path.join(_REPO, 'game/design/oni-3d-turnaround-v1.png')).convert('RGB')
def row(who):
    ims=[Image.open(H+f'turn_{who}_{v}.png').convert('RGB') for v in ('front','side','back')]
    w=sum(i.width for i in ims); h=ims[0].height
    out=Image.new('RGB',(design.width+w,max(h,design.height)),(14,13,18))
    out.paste(design,(0,0)); x=design.width
    for i in ims: out.paste(i,(x,0)); x+=i.width
    d=ImageDraw.Draw(out); d.text((10,8),'DESIGN',fill=(200,200,210)); d.text((design.width+10,8),f'BUILD {who.upper()} front / side / back',fill=(200,200,210))
    out.save(H+f'turnaround_{who}.png')
for who in sys.argv[1:] or ['grunt','boss']: row(who)
