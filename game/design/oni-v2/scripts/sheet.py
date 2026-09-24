import sys,glob,os
from PIL import Image, ImageDraw
D = os.path.join(os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')), 'renders', 'sheet') + '/'
tag,act=sys.argv[1],sys.argv[2]
fs=sorted(glob.glob(D+f'{tag}_{act}_*.png'))
ims=[Image.open(f) for f in fs]
out=Image.new('RGB',(sum(i.width for i in ims),ims[0].height))
x=0
for f,i in zip(fs,ims):
    out.paste(i,(x,0)); ImageDraw.Draw(out).text((x+5,5),os.path.basename(f)[-7:-4],fill=(255,255,255)); x+=i.width
out.save(D+f'../sheet_{tag}_{act}.png')
