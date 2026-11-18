from pathlib import Path
from copy import deepcopy
from collections import Counter
import json
import struct
import os

root=Path(os.environ.get('M07_ART_OUTPUT', str(Path(__file__).resolve().parent/'output')))
campaign=os.environ.get('M07_CAMPAIGN')=='1'
stem='m07-cangyan-campaign' if campaign else 'm07-cangyan'
old_path=root/(stem+'.raw.glb')
output_path=root/(stem+'-v11.glb')
raw=old_path.read_bytes()
jlen,jtype=struct.unpack_from('<II',raw,12)
assert jtype==0x4e4f534a
gltf=json.loads(raw[20:20+jlen])
start=20+jlen
blen,btype=struct.unpack_from('<II',raw,start)
assert btype==0x004e4942
data=memoryview(raw)[start+8:start+8+blen]
packed=bytearray()
all_accessors=gltf['accessors']
all_views=gltf['bufferViews']
accessors=[]
views=[]
cache={}
typ={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}
struct_types={5120:'b',5121:'B',5122:'h',5123:'H',5125:'I',5126:'f'}
scale=32.0

def values(access):
    view=all_views[access['bufferView']]
    pos=view.get('byteOffset',0)+access.get('byteOffset',0)
    row=struct.Struct('<'+struct_types[access['componentType']]*typ[access['type']])
    stride=view.get('byteStride',row.size)
    return [row.unpack_from(data,pos+i*stride) for i in range(access['count'])]

def add(semantic,idx,team_idx=None):
    existing=cache.get((semantic,idx,team_idx))
    if existing is not None:return existing
    a=deepcopy(all_accessors[idx])
    rows=values(a)
    stride=None
    normalized=True
    component=5126
    if semantic=='POSITION':
        lo=min(min(row) for row in rows)
        hi=max(max(row) for row in rows)
        assert lo>=-scale and hi<=scale,(lo,hi)
        rows=[tuple(round(v/scale*32767) for v in row) for row in rows]
        component=5122
        fmt='<hhhxx'
        stride=8
    elif semantic=='NORMAL':
        rows=[tuple(round(max(-1,min(1,v))*32767) for v in row) for row in rows]
        component=5122
        fmt='<hhhxx'
        stride=8
    elif semantic=='TEXCOORD_0':
        teams=values(all_accessors[team_idx])
        rows=[(round((r*.5+int(team[0])*.5)*65535),round(m*65535)) for (r,m),team in zip(rows,teams)]
        component=5123
        fmt='<HH'
        stride=4
    elif semantic=='TEXCOORD_2':
        rows=[tuple(round(max(0,min(1,v))*65535) for v in row) for row in rows]
        component=5123;fmt='<HH';stride=4
    elif semantic=='COLOR_0':
        assert a['type']=='VEC4' and a['componentType']==5123 and a['normalized']
        rows=[tuple(round(v/257) for v in row) for row in rows]
        component=5121
        fmt='<BBBB'
        stride=4
    elif semantic=='indices':
        component=a['componentType']
        fmt='<'+struct_types[component]
        normalized=False
    else:
        raise ValueError(semantic)
    record=struct.Struct(fmt)
    payload=bytearray(len(rows)*record.size)
    for i,row in enumerate(rows):
        record.pack_into(payload,i*record.size,*row)
    packed.extend(b'\0'*((-len(packed))%4))
    view={'buffer':0,'byteLength':len(payload),'byteOffset':len(packed)}
    if stride:
        view['byteStride']=stride
        view['target']=34962
    else:
        view['target']=34963
    packed.extend(payload)
    a['bufferView']=len(views)
    a['componentType']=component
    if normalized:
        a['normalized']=True
    else:
        a.pop('normalized',None)
    a.pop('byteOffset',None)
    if 'min' in a:
        a['min']=[min(c) for c in zip(*rows)]
        a['max']=[max(c) for c in zip(*rows)]
    cache[(semantic,idx,team_idx)]=len(accessors)
    views.append(view)
    accessors.append(a)
    return len(accessors)-1

for mesh in gltf['meshes']:
    for p in mesh['primitives']:
        old=p['attributes']
        p['attributes']={('TEXCOORD_1' if name=='TEXCOORD_2' else name):add(name,i,old['TEXCOORD_1'] if name=='TEXCOORD_0' else None)
                         for name,i in old.items() if name!='TEXCOORD_1'}
        p['indices']=add('indices',p['indices'])
for node in gltf['nodes']:
    if 'mesh' not in node:continue
    assert 'scale' not in node and 'matrix' not in node and not node.get('children'),node
    node['scale']=[scale]*3
# Embedded textures are independent bufferViews, not accessor-backed geometry.
for image in gltf.get('images',[]):
    old_view=all_views[image['bufferView']]
    packed.extend(b'\0'*((-len(packed))%4))
    payload=data[old_view.get('byteOffset',0):old_view.get('byteOffset',0)+old_view['byteLength']]
    image['bufferView']=len(views)
    views.append({'buffer':0,'byteOffset':len(packed),'byteLength':len(payload)})
    packed.extend(payload)
def remap_texcoords(value):
    if isinstance(value,dict):
        if value.get('texCoord')==2:value['texCoord']=1
        for child in value.values():remap_texcoords(child)
    elif isinstance(value,list):
        for child in value:remap_texcoords(child)
remap_texcoords(gltf.get('materials',[]))
gltf['accessors']=accessors
gltf['bufferViews']=views
gltf['extensionsUsed']=list(dict.fromkeys(gltf.get('extensionsUsed',[])+['KHR_mesh_quantization']))
gltf['extensionsRequired']=list(dict.fromkeys(gltf.get('extensionsRequired',[])+['KHR_mesh_quantization']))
packed.extend(b'\0'*((-len(packed))%4))
gltf['buffers']=[{'byteLength':len(packed)}]
js=json.dumps(gltf,ensure_ascii=False,separators=(',',':')).encode()
js+=b' '*((-len(js))%4)
head=struct.pack('<4sII',b'glTF',2,28+len(js)+len(packed))
output_path.write_bytes(head+struct.pack('<II',len(js),jtype)+js+struct.pack('<II',len(packed),btype)+packed)
print('Raw Blender:',len(raw),'bytes; Packed:',output_path.stat().st_size,'bytes; visible triangles:',sum(gltf['accessors'][p['indices']]['count']//3 for m in gltf['meshes'] for p in m['primitives']))
