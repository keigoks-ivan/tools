"""Three cosmetic upper-body silhouettes share the same playable rig and weapon."""
from math import sin, cos, pi
from mathutils import Vector
from geometry import section
J='M07_Upper'

def build(b,variant):
 if variant=='bailu': scout(b)
 else: sentinel(b)
 engines(b,variant)

def visor(b,name,width,base,depth,top,bottom):
 n=21;rows=[]
 for y in (bottom,top):
  rows.append([(width*sin(a),y+.035*abs(sin(a)),base+depth*cos(a)) for a in [(-67+134*i/(n-1))*pi/180 for i in range(n)]])
 b.mesh(J,name,[p for row in rows for p in row],[(i,i+1,n+i+1,n+i) for i in range(n-1)],'visor',smooth=True)
 for row in rows:
  b.tube(J,'面罩密封條',row,.027,'edge_dark',6)
 # Sensor sits under the armored brow and in front of the dark optical laminate.
 points=[]
 for i in range(13):
  a=(-53+106*i/12)*pi/180;points.append((width*sin(a),top-.11,base+(depth+.014)*cos(a)))
 b.tube(J,'感測光帶承座',[(x,y,z-.045) for x,y,z in points],.033,'dark',6)
 for a,c in zip(points,points[1:]):b.cyl(J,'面罩導光感測器',a,c,.014,'cyan',6,glow=True)

def neck(b):
 b.cyl(J,'頭部回轉承座',(0,13.70,.4),(0,14.70,.4),.59,'dark',20)
 b.ring(J,'頸部旋轉密封環',(0,14.04,.4),(0,1,0),.80,.55,'steel',.14,18)

def scout(b):
 neck(b)
 start=len(b.parts[J])
 # A narrow swept reconnaissance head, with a pronounced low forehead.
 b.loft(J,'白鷺修長頭盔',[
  section(14.35,0,.56,.63,.75,.16),section(14.91,0,.72,.86,1.12,.22),
  section(15.65,0,.53,.92,1.07,.23),section(16.23,0,.15,.64,.64,.19),section(16.48,0,-.13,.29,.39,.13)
 ],'blue2',.024)
 b.panel(J,'白鷺後掠額甲',[(-.78,15.64,1.53),(-.28,16.29,.40),(.28,16.29,.40),(.78,15.64,1.53),(.46,15.49,2.02),(-.46,15.49,2.02)],(0,-.16,-.12),'blue',.018)
 visor(b,'白鷺窄幅光學面罩',.87,1.08,1.04,15.43,14.96)
 heads=[obj for obj,_ in b.parts[J][start:]]
 for s in (-1,1):
  start=len(b.parts[J])
  p=lambda x,y,z:(s*x,y,z)
  b.panel(J,'白鷺斜收頰甲',[p(.15,14.73,1.93),p(.76,14.95,1.77),p(.91,14.89,.72),p(.53,14.39,.44),p(.21,14.35,1.10)],(-s*.12,0,-.14),'navy',.02)
  b.box(J,'白鷺側面光學模組',p(.99,15.26,.40),(.28,.58,.74),'dark',.035)
  b.cyl(J,'白鷺側面測距鏡片',p(1.015,15.29,.82),p(1.015,15.29,.85),.11,'visor',16)
  b.cyl(J,'白鷺短距天線',p(.90,15.30,-.33),p(1.10,16.44,-.76),.034,'dark',8)
  heads.extend(obj for obj,_ in b.parts[J][start:])
  # Folded swept shoulder blades remain inside the common hit envelope.
  poly=[p(2.25,14.29,1.63),p(3.52,14.70,1.38),p(5.22,15.17,-1.05),p(4.81,15.48,-2.23),p(3.11,15.30,-1.87),p(2.16,14.79,-.32)]
  b.panel(J,'白鷺後掠肩部主甲',poly,(0,-.57,-.07),'blue2',.040)
  b.panel(J,'白鷺肩甲深色前緣',[p(2.34,14.27,1.72),p(3.57,14.68,1.45),p(4.17,14.87,.69),p(3.74,14.45,.83),p(2.48,14.02,1.51)],(0,-.18,-.12),'navy',.025)
  b.panel(J,'白鷺肩甲服務面板',[p(3.23,15.31,-1.55),p(4.51,15.42,-1.91),p(4.66,15.16,-.95),p(3.64,14.88,.59),p(3.25,14.77,.75)],(0,-.10,0),'blue',.018)
  b.cyl(J,'白鷺肩部承載軸',p(2.1,13.4,-.1),p(3.9,13.3,-.1),.70,'dark',18)
  b.piston(J,'白鷺肩甲調角油壓桿',p(3.12,13.42,-.62),p(4.35,14.89,-1.46),.19)
  for x,y,z in ((3.02,14.63,1.11),(4.67,15.34,-1.26),(3.28,15.27,-1.15)):
   b.bolt(J,p(x,y+.03,z),(0,1,0),.045)
  # Slim outboard fairing makes the profile legible from behind too.
  b.panel(J,'白鷺側向推力導流片',[p(2.60,14.63,-2.43),p(3.65,15.64,-3.37),p(3.44,12.22,-3.50),p(2.67,11.73,-2.86)],(-s*.16,0,.10),'blue2',.023)

 b.heads[b.variant]=heads

def sentinel(b):
 neck(b)
 start=len(b.parts[J])
 # A broad recessed sensor turret, separate from Cangyan's fighter helmet.
 b.loft(J,'鐵潮裝甲感測頭座',[
  section(14.16,0,.39,1.01,.91,.22),section(14.66,0,.59,1.25,1.15,.29),
  section(15.43,0,.42,1.21,1.21,.29),section(15.77,0,.16,.91,.88,.24)
 ],'armor',.041)
 b.panel(J,'鐵潮厚額防護甲',[(-1.17,15.49,1.46),(-.79,15.80,.47),(.79,15.80,.47),(1.17,15.49,1.46),(.92,15.32,1.94),(-.92,15.32,1.94)],(0,-.22,-.07),'blue',.03)
 visor(b,'鐵潮裝甲光學窗',1.13,.94,1.14,15.20,14.66)
 b.panel(J,'鐵潮下顎防護框',[(-1.04,14.55,1.95),(1.04,14.55,1.95),(.81,14.13,1.63),(-.81,14.13,1.63)],(0,0,-.24),'armor2',.03)
 heads=[obj for obj,_ in b.parts[J][start:]]
 for s in (-1,1):
  start=len(b.parts[J])
  p=lambda x,y,z:(s*x,y,z)
  b.box(J,'鐵潮側面感測防護盒',p(1.25,14.96,.52),(.37,.79,1.01),'armor',.05)
  for y in (14.77,14.93,15.09):b.box(J,'鐵潮側向散熱格柵',p(1.446,y,.50),(.03,.053,.51),'recess',.006)
  heads.extend(obj for obj,_ in b.parts[J][start:])
  # High rectangular ramparts with an articulated outer cheek, not larger hitboxes.
  rows=[section(13.58,3.64,.10,1.37,1.43,.28),section(14.15,3.69,.14,1.70,1.75,.34),section(15.10,3.65,-.05,1.66,1.69,.32),section(15.49,3.42,-.26,1.33,1.40,.30)]
  b.loft(J,'鐵潮堡壘式肩甲',[[p(*q) for q in row] for row in rows],'armor',.035)
  b.panel(J,'鐵潮肩甲正面防撞板',[p(2.31,14.96,1.60),p(4.85,14.96,1.60),p(5.07,14.65,1.91),p(4.91,13.96,1.91),p(2.38,13.96,1.91),p(2.17,14.29,1.91)],(0,0,-.16),'blue',.035)
  b.panel(J,'鐵潮肩甲上層檢修面',[p(2.41,15.39,-1.30),p(4.45,15.39,-1.30),p(4.69,15.19,1.09),p(2.26,15.19,1.09)],(0,-.12,0),'armor2',.026)
  b.panel(J,'鐵潮外側掛甲',[p(5.27,14.70,-.91),p(5.28,14.70,1.11),p(5.12,12.93,1.17),p(4.86,12.69,.57),p(4.89,13.57,-.99)],(-s*.23,0,0),'blue',.028)
  for z in (-.93,-.63,-.33):
   b.box(J,'鐵潮肩甲嵌入式冷卻槽',p(3.45,15.43,z),(.95,.033,.075),'recess',.007)
  for x in (2.66,4.34):
   b.cyl(J,'鐵潮肩甲檢修鉸鏈',p(x,15.34,.78),p(x+.25,15.34,.78),.057,'steel',10)
  b.box(J,'鐵潮肩甲橘色辨識條',p(3.62,14.36,1.955),(1.91,.14,.045),'orange',.012)
  for x,y,z in ((2.42,14.73,1.97),(4.81,14.73,1.97),(2.54,14.15,1.97),(4.73,14.15,1.97)):
   b.bolt(J,p(x,y,z),r=.06)
  b.cyl(J,'鐵潮肩甲下方橫軸',p(2.1,13.4,-.1),p(4.0,13.3,-.1),.76,'dark',18)
  b.piston(J,'鐵潮肩甲承載油壓桿',p(3.15,13.13,-1.02),p(4.31,14.29,-1.44),.23)

 b.heads[b.variant]=heads

def engines(b,variant):
 scout=variant=='bailu'
 b.box(J,'推進背架',(0,12.80,-2.18),(1.12,4.80,.79),'dark',.07)
 for s in (-1,1):
  x=s*1.78
  if scout:
   rows=[section(10.05,x,-3.32,.63,.80,.22),section(11.03,x,-3.18,.79,1.02,.25),section(14.85,x,-2.88,.76,.93,.23),section(16.41,x,-2.57,.47,.68,.18)]
  else:
   rows=[section(10.15,x,-3.23,.85,1.10,.23),section(11.00,x,-3.20,1.15,1.29,.26),section(15.54,x,-3.07,1.18,1.24,.27),section(16.61,x,-2.97,.96,1.06,.22)]
  b.loft(J,'推進艙外殼',rows,'blue' if scout else 'armor',.035)
  # Distinct rear cover geometry for the third-person combat view.
  if scout:
   b.panel(J,'白鷺狹長背艙護甲',[(x-.53,15.14,-3.84),(x+.53,15.14,-3.84),(x+.63,11.08,-4.24),(x+.33,10.53,-4.28),(x-.33,10.53,-4.28),(x-.63,11.08,-4.24)],(0,0,.12),'blue2',.023)
  else:
   for y in (11.64,13.26,14.88):b.box(J,'鐵潮背艙橫向熱交換器',(x,y,-4.39),(1.91,1.16,.32),'armor2',.04)
  z=-3.82 if scout else -4.15
  b.box(J,'推進艙排熱口內腔',(x,15.75,z),(1.04 if scout else 1.55,.94,.16),'recess',.018)
  for i in range(4):b.box(J,'推進艙金屬排熱葉片',(x,15.42+i*.21,z-.13),(1.0 if scout else 1.51,.072,.20),'edge_dark',.014,rot=(-.32,0,0))
  c=Vector((x,9.73,-4.44));axis=Vector((0,-.56,-.83))
  b.cyl(J,'推進噴口承套',(x,10.51,-3.43),c,.80,'dark',20,r2=1.10)
  b.ring(J,'推進噴口護圈',c,axis,1.16,.84,'armor',.37,24)
  b.ring(J,'推進噴口唇緣',c+axis*.21,axis,1.07,.84,'steel',.09,24)
  b.ring(J,'推進噴口熱遮罩',c+axis*.14,axis,.84,.53,'recess',.28,20)
  b.ring(J,'推進光環',c+axis*.31,axis,.73,.60,'cyan',.055,24,True)
