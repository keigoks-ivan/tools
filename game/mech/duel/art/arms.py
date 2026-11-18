from math import pi
from mathutils import Vector
from geometry import section
J='M07_Upper'

def build(b):
 for side in (-1,1):
  b.role='Arm_R' if side==1 else 'Arm_L'
  p=lambda x,y,z:(side*x,y,z)
  b.loft(J,'上臂完整承力軀殼',[[p(*v) for v in r] for r in [section(11.56,4.38,.03,.54,.61,.17),section(12.48,4.12,-.11,.72,.85,.23),section(13.37,3.70,-.25,.66,.78,.22)]],'dark',.048)
  b.loft(J,'上臂立體包覆裝甲',[[p(*v) for v in r] for r in [section(11.66,4.29,.17,.53,.69,.19),section(12.42,4.12,.05,.71,.92,.24),section(13.11,3.78,-.09,.61,.84,.21)]],'armor',.042)
  b.panel(J,'上臂前方檢修護片',[p(3.32,12.99,.78),p(4.13,13.02,.78),p(4.58,12.34,1.02),p(4.58,11.91,.93),p(3.92,11.79,.97),p(3.57,12.31,1.05)],(0,0,-.09),'armor2',.025)
  b.piston(J,'上臂後側穩定缸',p(3.94,13.05,-.94),p(4.37,11.50,-.63),.22)
  b.tube(J,'上臂內側編織管路',[p(3.05,12.88,-.51),p(3.21,12.11,-.67),p(3.77,11.29,-.39)],.09)
  for x,y,z in ((3.70,12.78,.94),(4.28,12.25,1.08)):b.bolt(J,p(x,y,z),r=.047)
  for lo,hi,r,key in ((3.59,5.18,.60,'dark'),(5.13,5.34,.49,'steel'),(5.34,5.41,.34,'armor2')):
   b.cyl(J,'肘部大徑承力樞軸',p(lo,11.26,.05),p(hi,11.26,.05),r,key,18)
  b.ring(J,'肘部外蓋嵌環',p(5.43,11.26,.05),(side,0,0),.28,.19,'dark',.06,16)
  forearm(b,side)
 b.role=None
 rifle(b)

def forearm(b,s):
 # Right forearm, gripping hand and gun share the elbow pivot, including in preview.
 j='M07_Rifle' if s==1 else J
 b.role='Forearm_R' if s==1 else 'Forearm_L'
 def f(u,t,q):
  return (s*(4.46+u*1.15),11.26+q*1.1,.05+t*.85) if s==1 else (s*(4.46+u*1.15),11.26-t*.85,.05+q*1.1)
 def panel(name,pts,key='blue',depth=.17):
  d=(0,-depth,0) if s==1 else (0,0,-depth)
  return b.panel(j,name,[f(*p) for p in pts],d,key,.025)
 b.cyl(j,'前臂中央承軸',f(0,.18,0),f(0,2.11,0),.40,'dark',14)
 def row(t,w,d,c=.16):
  return [f(u,t,q) for u,q in [(-w+c,d),(w-c,d),(w,d-c),(w,-d+c),(w-c,-d),(-w+c,-d),(-w,-d+c),(-w,d-c)]]
 b.loft(j,'前臂完整包覆主甲',[row(.30,.57,.59),row(.68,.72,.71),row(1.65,.62,.67),row(2.05,.43,.47)],'blue',.040)
 panel('前臂前方上檢修蓋',[(-.47,.54,.75),(.48,.58,.75),(.54,1.12,.76),(-.49,1.10,.76)],'blue2',.085)
 panel('前臂前方下檢修蓋',[(-.46,1.23,.72),(.50,1.28,.73),(.35,1.84,.62),(-.33,1.81,.62)],'armor',.085)
 pts=[f(.73,.63,.44),f(.73,.60,-.46),f(.67,1.53,-.49),f(.50,1.98,.25),f(.53,1.78,.48)]
 b.panel(j,'前臂橘色厚側甲',pts,(-s*.18,0,0),'orange',.03)
 for u,t,q in ((-.34,.69,.79),(.35,.72,.79),(-.28,1.41,.76),(.28,1.62,.72)):
  b.bolt(j,f(u,t,q),(0,1,0) if s==1 else (0,0,1),.046)
 b.piston(j,'前臂內側工作缸',f(-.65,.69,-.31),f(-.42,2.22,-.12),.13)
 b.cyl(j,'手腕旋轉主接頭',f(0,1.96,0),f(0,2.34,0),.39,'steel',18)
 b.ring(j,'手腕外部密封環',f(0,2.22,0),(0,0,1) if s==1 else (0,-1,0),.42,.30,'dark',.11,18)
 # Palm and four individually segmented fingers. In the right hand they close around the grip.
 b.loft(j,'手掌掌骨',[
  [f(u,2.30,q) for u,q in [(-.38,-.21),(.38,-.21),(.40,.16),(.29,.28),(-.27,.28),(-.40,.12)]],
  [f(u,2.85,q) for u,q in [(-.35,-.19),(.35,-.19),(.36,.15),(.26,.23),(-.24,.23),(-.36,.11)]]
 ],'dark',.018)
 panel('手背護甲',[(-.33,2.32,.29),(.32,2.32,.29),(.35,2.70,.29),(-.31,2.75,.29)],'armor',.08)
 for i in range(4):
  u=-.275+i*.18
  # Curled fingers, a small knuckle block and a final curved segment; no mitten silhouette.
  pts=[f(u,2.73,.01),f(u,3.00,-.02),f(u,3.10,-.20),f(u,2.94,-.35)]
  for k,(a,c) in enumerate(zip(pts,pts[1:])):
   b.cyl(j,'手指關節軸',a,c,.090 if k==0 else .080,'dark',8)
   mid=Vector(a).lerp(Vector(c),.46)
   # Small armor collar defines each phalanx without disconnected floating spheres.
   b.ring(j,'指節機械護環',mid,Vector(c)-Vector(a),.096,.078,'armor2',.11,8)
 b.cyl(j,'拇指根節',f(-.35,2.49,-.04),f(-.53,2.71,-.22),.125,'dark',10)
 b.cyl(j,'拇指末節',f(-.53,2.71,-.22),f(-.31,2.86,-.38),.112,'armor2',10)

def rifle(b):
 b.role=None
 j='M07_Rifle';x=4.05
 b.transform=lambda p:(p[0]+.41,p[1]+1.05,p[2]-.22)
 # Mechanical receiver above the right hand; muzzle bore has real depth.
 b.box(j,'步槍主機匣',(x,10.99,2.84),(.78,.73,2.69),'dark',.045)
 b.box(j,'機匣上層導軌',(x,11.37,3.27),(.73,.16,3.91),'armor',.022)
 b.box(j,'步槍握柄',(x,10.42,2.81),(.31,.65,.42),'rubber',.025,rot=(-.12,0,0))
 b.box(j,'後座緩衝器',(x,11.02,1.05),(.57,.57,.98),'armor',.045)
 b.box(j,'槍托防撞墊',(x,11.01,.51),(.63,.63,.13),'rubber',.02)
 # Long octagonal barrel shroud, narrower than the receiver.
 b.cyl(j,'內部槍管',(x,11.05,3.45),(x,11.05,7.12),.23,'dark',12)
 for side in (-1,1):
  xx=x+side*.40
  b.panel(j,'步槍側面主護板',[(xx,11.30,3.37),(xx,11.31,5.91),(xx,11.13,6.66),(xx,10.71,6.53),(xx,10.57,4.07)],(-side*.13,0,0),'armor',.024)
  b.panel(j,'槍身藍色嵌入板',[(xx+side*.015,11.19,3.86),(xx+side*.015,11.19,5.20),(xx+side*.015,10.79,5.43),(xx+side*.015,10.76,4.01)],(-side*.03,0,0),'navy',.012)
  b.box(j,'槍身能源槽',(xx+side*.035,10.96,4.54),(.035,.089,.92),'recess',.01)
  b.cyl(j,'槍身能源指示',(xx+side*.056,10.968,4.21),(xx+side*.056,10.968,4.84),.024,'cyan',6,glow=True)
  for z in (3.62,5.75,6.26):b.bolt(j,(xx+side*.02,11.16,z),(side,0,0),.04)
 for i in range(9):
  b.box(j,'槍管護罩散熱孔',(x,11.455,3.64+i*.29),(.38,.034,.14),'recess',.009)
  b.box(j,'槍頂短導軌',(x,11.48,1.97+i*.17),(.51,.07,.065),'steel',.009)
 b.box(j,'外置能源匣',(x,10.44,3.53),(.58,.57,.63),'armor',.035,rot=(.19,0,0))
 b.box(j,'能源匣橘色標記',(x+.30,10.45,3.52),(.035,.25,.38),'orange',.008,rot=(.19,0,0))
 b.cyl(j,'槍口多邊外罩',(x,11.05,6.61),(x,11.05,7.12),.45,'armor',8,r2=.38)
 b.ring(j,'槍口端面',(x,11.05,7.15),(0,0,1),.38,.235,'steel',.09,8)
 b.ring(j,'槍口深孔',(x,11.05,7.07),(0,0,1),.24,.17,'recess',.30,12)
 b.cyl(j,'槍口內膛暗面',(x,11.05,6.83),(x,11.05,6.85),.17,'rubber',12)
 # Compact sight and a visibly separate trigger guard.
 b.box(j,'步槍光學瞄具座',(x,11.55,2.36),(.45,.15,.66),'dark',.025)
 b.cyl(j,'步槍瞄具',(x,11.72,2.06),(x,11.72,2.61),.18,'armor',12)
 b.cyl(j,'瞄具前鏡片',(x,11.72,2.61),(x,11.72,2.63),.126,'cyan',12,glow=True)
 b.box(j,'扳機護圈底邊',(x,10.15,3.10),(.14,.10,.74),'steel',.015)
 b.box(j,'扳機護圈前邊',(x,10.34,3.48),(.14,.46,.10),'steel',.015)

 b.transform=None
