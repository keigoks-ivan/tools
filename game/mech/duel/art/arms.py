from math import pi
from mathutils import Vector
from geometry import section
J='M07_Upper'

def build(b):
 for s in (-1,1):
  p=lambda x,y,z:(s*x,13+(y-13)*.85,z)
  b.loft(J,'上臂內部承力桿',[[p(*v) for v in r] for r in [section(10.73,4.03,.06,.42,.43,.13),section(12.11,3.64,-.07,.49,.58,.12),section(12.64,3.48,-.06,.44,.51,.12)]],'dark',.025)
  b.panel(J,'上臂正面分層裝甲',[p(3.17,12.44,.61),p(3.79,12.52,.63),p(4.23,11.69,.71),p(4.39,11.07,.53),p(3.64,10.94,.76),p(3.34,11.43,.78)],(0,0,-.20),'armor',.027)
  b.panel(J,'上臂上段可拆鋼板',[p(3.23,12.40,.67),p(3.76,12.43,.69),p(4.04,11.87,.83),p(3.39,11.76,.86)],(0,0,-.10),'armor2',.024)
  b.panel(J,'上臂外側折面',[p(3.89,12.31,.40),p(4.21,12.06,-.26),p(4.49,11.05,-.14),p(4.34,10.91,.42)],(-s*.13,0,0),'blue',.025)
  b.piston(J,'上臂後側穩定缸',p(3.49,12.18,-.61),p(3.93,10.75,-.39),.17)
  b.tube(J,'上臂編織管路',[p(3.16,12.08,-.37),p(3.29,11.31,-.53),p(3.66,10.60,-.43)],.075)
  for x,y,z in ((3.47,12.20,.77),(3.96,11.34,.81)):b.bolt(J,p(x,y,z))
  for a,c,r,key in ((3.38,4.56,.51,'dark'),(4.51,4.70,.43,'steel'),(4.70,4.75,.29,'armor')):
   b.cyl(J,'肘關節樞軸',p(a,10.52,.10),p(c,10.52,.10),r,key,16)
  b.ring(J,'肘部外蓋嵌環',p(4.77,10.52,.10),(s,0,0),.23,.15,'dark',.05,16)
  forearm(b,s)
 rifle(b)

def forearm(b,s):
 # Right forearm, gripping hand and gun share the elbow pivot, including in preview.
 j='M07_Rifle' if s==1 else J
 def f(u,t,q):
  return (s*(4.05+u),10.89+q,.10+t*.77) if s==1 else (s*(4.05+u),10.89-t*.77,.10+q)
 def panel(name,pts,key='blue',depth=.17):
  d=(0,-depth,0) if s==1 else (0,0,-depth)
  return b.panel(j,name,[f(*p) for p in pts],d,key,.025)
 b.cyl(j,'前臂中央承軸',f(0,.22,0),f(0,2.06,0),.33,'dark',12)
 # This armor thickens toward the elbow and tapers into an exposed wrist bearing.
 panel('前臂主甲片',[(-.55,.42,.47),(-.39,.20,.46),(.42,.29,.46),(.65,.71,.50),(.48,1.85,.50),(.23,2.05,.36),(-.42,1.91,.43)],'blue',.25)
 panel('前臂分段護甲',[(-.43,.61,.56),(.48,.65,.58),(.43,1.19,.60),(-.45,1.14,.59)],'blue2',.08)
 panel('前臂下段檢修蓋',[(-.40,1.23,.58),(.42,1.28,.59),(.30,1.84,.59),(-.32,1.80,.59)],'armor',.085)
 # Broad polygonal outer plate is orthogonal to the front shield.
 pts=[f(.65,.55,.40),f(.64,.51,-.47),f(.61,1.63,-.40),f(.44,1.93,.32)]
 b.panel(j,'前臂橘色外護板',pts,(-s*.13,0,0),'orange',.025)
 back=[f(-.40,.38,-.41),f(.40,.40,-.41),f(.40,1.78,-.38),f(-.30,1.91,-.33)]
 b.panel(j,'前臂背側承殼',back,(0,.17,0) if s==1 else (0,0,.17),'dark',.024)
 for u,t,q in ((-.34,.49,.54),(.34,.55,.55),(-.29,1.47,.65),(.24,1.61,.66)):
  b.bolt(j,f(u,t,q),(0,1,0) if s==1 else (0,0,1),.043)
 b.piston(j,'腕部細型活塞',f(-.49,.57,-.20),f(-.38,2.13,-.11),.105)
 b.cyl(j,'手腕旋轉接頭',f(0,1.95,0),f(0,2.30,0),.34,'steel',16)
 b.ring(j,'手腕密封環',f(0,2.19,0),(0,0,1) if s==1 else (0,-1,0),.36,.27,'dark',.09,16)
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
 j='M07_Rifle';x=4.05
 b.transform=lambda p:(p[0],p[1]+.37,p[2]-.62)
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
