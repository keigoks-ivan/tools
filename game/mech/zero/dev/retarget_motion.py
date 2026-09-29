"""CC0 Rigify 動作轉 Mixamo；以世界靜止姿勢抵銷骨軸差異，輸出動畫專用 GLB。"""
import json,struct,pathlib,sys
import numpy as np
from scipy.spatial.transform import Rotation as R,Slerp

def read(path):
 b=pathlib.Path(path).read_bytes()
 if b[:4]==b'glTF':
  n=struct.unpack_from('<I',b,12)[0];d=json.loads(b[20:20+n]);buf=b[28+n:]
 else:
  d=json.loads(b);buf=(pathlib.Path(path).parent/d['buffers'][0]['uri']).read_bytes()
 return d,buf

def acc(d,b,i):
 a=d['accessors'][i];v=d['bufferViews'][a['bufferView']];n={'SCALAR':1,'VEC3':3,'VEC4':4,'MAT4':16}[a['type']]
 return np.frombuffer(b,dtype='<f4',count=a['count']*n,offset=v.get('byteOffset',0)+a.get('byteOffset',0)).reshape(-1,n)
class Rig:
 def __init__(self,d,b):
  self.d=d;self.b=b;self.nodes=d['nodes'];self.parent={c:i for i,n in enumerate(self.nodes) for c in n.get('children',[])}
  self.names={n.get('name',''):i for i,n in enumerate(self.nodes)}
 def sample(self,clip,t):
  p=[np.array(n.get('translation',[0,0,0]),float) for n in self.nodes];q=[R.from_quat(n.get('rotation',[0,0,0,1])) for n in self.nodes];s=[np.array(n.get('scale',[1,1,1]),float) for n in self.nodes]
  for c in clip['channels']:
   sp=clip['samplers'][c['sampler']];ts=acc(self.d,self.b,sp['input']).ravel();vs=acc(self.d,self.b,sp['output']);i=c['target']['node'];kind=c['target']['path'];tm=np.clip(t,ts[0],ts[-1])
   if kind=='rotation':q[i]=Slerp(ts,R.from_quat(vs))(tm)
   elif kind in ['translation','scale']:
    v=np.array([np.interp(tm,ts,vs[:,k]) for k in range(3)]);(p if kind=='translation' else s)[i]=v
  gw={};gp={};gs={}
  def calc(i):
   if i in gw:return
   parent=self.parent.get(i)
   if parent is None:gw[i]=q[i];gp[i]=p[i];gs[i]=s[i]
   else:
    calc(parent);gw[i]=gw[parent]*q[i];gp[i]=gp[parent]+gw[parent].apply(p[i]*gs[parent]);gs[i]=gs[parent]*s[i]
  for i in range(len(self.nodes)):calc(i)
  return p,q,s,gw,gp,gs
src=Rig(*read(sys.argv[1]));dst=Rig(*read(sys.argv[2]))
clips={a['name']:a for a in src.d['animations']};tp=next(a for a in dst.d['animations'] if a['name']=='TPose')
kay = 'hips' in src.names
rest = next(a for n,a in clips.items() if 'T-Pose' in n) if kay else clips['A_TPose']
sp,sq,ss,sw,spos,sscale=src.sample(rest,0);dp,dq,ds,dw,dpos,dscale=dst.sample(tp,0)
mapping={'Hips':'hips','Spine':'spine.001','Spine1':'spine.002','Spine2':'spine.003','Neck':'neck','Head':'head'}
for side,short in [('Left','L'),('Right','R')]:
 for target,source in [('Shoulder','shoulder'),('Arm','upper_arm'),('ForeArm','forearm'),('Hand','hand'),('UpLeg','thigh'),('Leg','shin'),('Foot','foot'),('ToeBase','toe')]:mapping[side+target]=source+'.'+short
 for f,sf in [('Index','f_index'),('Middle','f_middle'),('Ring','f_ring'),('Pinky','f_pinky'),('Thumb','thumb')]:
  for k in range(1,4):mapping[side+'Hand'+f+str(k)]=sf+'.0'+str(k)+'.'+short
if kay:
 mapping={'Hips':'hips','Spine':'spine','Spine1':'spine','Spine2':'chest','Head':'head'}
 for side,short in [('Left','l'),('Right','r')]:
  for target,source in [('Arm','upperarm'),('ForeArm','lowerarm'),('Hand','wrist'),('UpLeg','upperleg'),('Leg','lowerleg'),('Foot','foot'),('ToeBase','toes')]:mapping[side+target]=source+'.'+short
pairs={dst.names['mixamorig:'+t]:src.names[('' if kay else 'DEF-')+s] for t,s in mapping.items()}
# 左右肩與上下方向定義同一個世界基底，消除角色朝向差。
def basis(pos,names,l,r,hips,head):
 x=pos[names[l]]-pos[names[r]];x/=np.linalg.norm(x);y=pos[names[head]]-pos[names[hips]];y-=x*np.dot(x,y);y/=np.linalg.norm(y);return R.from_matrix(np.column_stack([x,y,np.cross(x,y)]))
align=basis(dpos,dst.names,'mixamorig:LeftArm','mixamorig:RightArm','mixamorig:Hips','mixamorig:Head')*basis(spos,src.names,*(['upperarm.l','upperarm.r','hips','head'] if kay else ['DEF-upper_arm.L','DEF-upper_arm.R','DEF-hips','DEF-head'])).inv()
hi=dst.names['mixamorig:Hips'];hs=pairs[hi]
scale=np.linalg.norm(dpos[hi]-dpos[dst.names['mixamorig:LeftFoot']])/np.linalg.norm(spos[hs]-spos[src.names['foot.l' if kay else 'DEF-foot.L']])
selected={'CrouchIdle':'Crouch_Idle_Loop','CrouchWalk':'Crouch_Fwd_Loop','HitChest':'Hit_Chest','HitHead':'Hit_Head','Death':'Death01','Reload':'Pistol_Reload'}
if kay:
 selected = {'WalkBack':'Walking_Backwards','StrafeLeft':'Running_Strafe_Left','StrafeRight':'Running_Strafe_Right'} if any('Walking_Backwards' in n for n in clips) else {'DeathA':'Death_A','DeathB':'Death_B'}
 selected = {k:next(n for n in clips if n.split('|')[-1]==v) for k,v in selected.items()}
# 輸出不含網格、材質與貼圖；骨架只供 loader 命名軌道。
out={'asset':{'version':'2.0','generator':'IRON DUSK CC0 rest-space retarget'},'scene':0,'scenes':[{'nodes':dst.d['scenes'][0]['nodes']}],'nodes':[{k:v for k,v in n.items() if k in ['name','children','translation','rotation','scale']} for n in dst.nodes],'buffers':[{'byteLength':0}],'bufferViews':[],'accessors':[],'animations':[]};data=bytearray()
def put(a,kind):
 a=np.asarray(a,dtype='<f4');offset=len(data);data.extend(a.tobytes());vi=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':offset,'byteLength':a.nbytes});idx=len(out['accessors']);entry={'bufferView':vi,'componentType':5126,'count':len(a),'type':kind}
 if kind=='SCALAR':entry.update(min=[float(a.min())],max=[float(a.max())])
 out['accessors'].append(entry);return idx
for name,original in selected.items():
 c=clips[original];duration=max(float(acc(src.d,src.b,s['input'])[-1,0]) for s in c['samplers']);times=np.linspace(0,duration,round(duration*30)+1);tracks={i:[] for i in pairs};positions=[]
 for t in times:
  _,_,_,world,pp,_=src.sample(c,t);desired={i:align*world[j]*sw[j].inv()*align.inv()*dw[i] for i,j in pairs.items()};actual={}
  def local(i):
   parent=dst.parent.get(i)
   if parent is not None and parent not in actual:local(parent)
   pq=actual[parent] if parent is not None else R.identity();q=pq.inv()*desired[i] if i in desired else dq[i];actual[i]=pq*q
   if i in tracks:tracks[i].append(q.as_quat())
  for i in range(len(dst.nodes)):
   if i not in actual:local(i)
  delta=pp[hs]-spos[hs];delta[0]=0;delta[2]=0
  wp=dpos[hi]+align.apply(delta)*scale;parent=dst.parent[hi];positions.append(dw[parent].inv().apply(wp-dpos[parent])/dscale[parent])
 anim={'name':name,'channels':[],'samplers':[]};ti=put(times,'SCALAR')
 for i,values in tracks.items():
  # 固定四元數半球，避免跨幀走長弧。
  values=np.array(values)
  for k in range(1,len(values)):
   if np.dot(values[k-1],values[k])<0:values[k]*=-1
  oi=put(values,'VEC4');si=len(anim['samplers']);anim['samplers'].append({'input':ti,'output':oi,'interpolation':'LINEAR'});anim['channels'].append({'sampler':si,'target':{'node':i,'path':'rotation'}})
 oi=put(positions,'VEC3');si=len(anim['samplers']);anim['samplers'].append({'input':ti,'output':oi,'interpolation':'LINEAR'});anim['channels'].append({'sampler':si,'target':{'node':hi,'path':'translation'}});out['animations'].append(anim);print(name,round(duration,3),len(times))
out['buffers'][0]['byteLength']=len(data);j=json.dumps(out,separators=(',',':')).encode();j+=b' '*((-len(j))%4);data+=b'\0'*((-len(data))%4);result=struct.pack('<III',0x46546c67,2,28+len(j)+len(data))+struct.pack('<II',len(j),0x4e4f534a)+j+struct.pack('<II',len(data),0x004e4942)+data;pathlib.Path(sys.argv[3]).write_bytes(result);print('bytes',len(result),'scale',scale)
