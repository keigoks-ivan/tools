"""合併相同骨架的動畫 GLB，不加入網格或貼圖。"""
import json, struct, sys
from pathlib import Path
def read(path):
 b=Path(path).read_bytes();n=struct.unpack_from('<I',b,12)[0]
 return json.loads(b[20:20+n]),b[28+n:]
out,data=read(sys.argv[1]);data=bytearray(data)
for path in sys.argv[2:-1]:
 d,buf=read(path)
 names={n.get('name'):i for i,n in enumerate(out['nodes'])}
 node_map={i:names[n['name']] for i,n in enumerate(d['nodes']) if n.get('name') in names}
 va,aa,offset=len(out['bufferViews']),len(out['accessors']),len(data)
 data.extend(buf)
 for v in d['bufferViews']:v['byteOffset']=v.get('byteOffset',0)+offset;out['bufferViews'].append(v)
 for a in d['accessors']:a['bufferView']+=va;out['accessors'].append(a)
 for a in d['animations']:
  for s in a['samplers']:s['input']+=aa;s['output']+=aa
  for c in a['channels']:c['target']['node']=node_map[c['target']['node']]
  out['animations'].append(a)
out['buffers'][0]['byteLength']=len(data)
j=json.dumps(out,separators=(',',':')).encode();j+=b' '*((-len(j))%4)
Path(sys.argv[-1]).write_bytes(struct.pack('<III',0x46546c67,2,28+len(j)+len(data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data)
print([a['name'] for a in out['animations']],len(data)+len(j)+28)
