import sys, os
from PIL import Image, ImageDraw
R = os.path.join(os.environ.get('ONI_V2_WORK', os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'work')), 'renders', 'clips') + '/'
names=sys.argv[1].split(',')
durs=dict(a.split('=') for a in sys.argv[2:]) if len(sys.argv)>2 else {}
for n in names:
    ims=[Image.open(R+f'{n}_{i}.png') for i in range(5)]
    side=[Image.open(R+f'{n}_{i}_side.png') for i in range(5)]
    o=Image.new('RGB',(380*5,1040+28),(12,12,16)); d=ImageDraw.Draw(o)
    for i,im in enumerate(side): o.paste(im,(i*380,548))
    d.text((8,8),f'{n}   {durs.get(n,"")}   samples at 0, 25, 50, 75, 100 %',fill=(230,230,240))
    for i,im in enumerate(ims): o.paste(im,(i*380,28))
    o.save(R+f'../clip_{n}.png')
