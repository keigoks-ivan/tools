"""Bake GSI DEM10B numeric elevation tiles into the game's small local height field.
Source/spec: https://maps.gsi.go.jp/development/demtile.html
Usage: python3 game/mech/dev/bake-kobe-terrain.py
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import io, json, math, struct, urllib.request
from PIL import Image

ZOOM, COUNT = 12, 257
ANCHOR_LAT, ANCHOR_LON = 34.6825, 135.1888
X0, X1, Z0, Z1 = -12000, 12000, -14000, 1000
ANCHOR_X, ANCHOR_Z = -180, 540
ROOT = Path(__file__).resolve().parents[1]
CACHE = Path('/private/tmp/kobe-dem-source'); CACHE.mkdir(exist_ok=True)

def pixel(x, z):
    lat = ANCHOR_LAT - (z - ANCHOR_Z) / 111320
    lon = ANCHOR_LON + (x - ANCHOR_X) / (111320 * math.cos(math.radians(ANCHOR_LAT)))
    return ((lon + 180) / 360 * 256 * 2**ZOOM,
            (1 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2 * 256 * 2**ZOOM)

corners = [pixel(x,z) for x in [X0,X1] for z in [Z0,Z1]]
keys = [(x,y) for x in range(int(min(p[0] for p in corners)//256), int(max(p[0] for p in corners)//256)+1)
              for y in range(int(min(p[1] for p in corners)//256), int(max(p[1] for p in corners)//256)+1)]
def tile(k):
    x,y=k; url=f'https://cyberjapandata.gsi.go.jp/xyz/dem_png/{ZOOM}/{x}/{y}.png'
    path=CACHE/f'{x}-{y}.png'
    if not path.exists():
        with urllib.request.urlopen(url, timeout=30) as response: path.write_bytes(response.read())
    im=Image.open(io.BytesIO(path.read_bytes())).convert('RGB')
    values=[]
    for r,g,b in im.getdata():
        v=(r<<16)+(g<<8)+b
        values.append(0 if v==2**23 else max(0,(v if v<2**23 else v-2**24)*.01))
    return k,values,url
with ThreadPoolExecutor(max_workers=4) as pool: loaded=list(pool.map(tile, keys))
tiles={k:v for k,v,url in loaded}
def at(px,py):
    ix,iy=int(px),int(py); return tiles[(ix//256,iy//256)][iy%256*256+ix%256]
def sample(x,z):
    px,py=pixel(x,z);fx,fy=px%1,py%1
    return (at(px,py)*(1-fx)+at(px+1,py)*fx)*(1-fy)+(at(px,py+1)*(1-fx)+at(px+1,py+1)*fx)*fy
values=[round(sample(X0+(X1-X0)*x/(COUNT-1),Z0+(Z1-Z0)*z/(COUNT-1)))
        for z in range(COUNT) for x in range(COUNT)]
(ROOT/'assets/kobe-relief-v1.bin').write_bytes(struct.pack('<'+'H'*len(values),*values))
meta={'source':'國土地理院 DEM10B 標高タイル，雙線性取樣並量化至 1 公尺',
      'attribution':'https://maps.gsi.go.jp/development/ichiran.html',
      'specification':'https://maps.gsi.go.jp/development/demtile.html',
      'anchor':{'lat':ANCHOR_LAT,'lon':ANCHOR_LON,'x':ANCHOR_X,'z':ANCHOR_Z},
      'bounds':[X0,X1,Z0,Z1],'size':[COUNT,COUNT],'encoding':'little-endian uint16 meters',
      'adaptation':'Only the playable city footprint is flattened at runtime. Sea and mission layouts are fictional.',
      'tiles':[url for k,v,url in loaded]}
(ROOT/'assets/kobe-relief-v1.source.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({'tiles':len(loaded),'bytes':len(values)*2,'maximumMeters':max(values)},ensure_ascii=False))
