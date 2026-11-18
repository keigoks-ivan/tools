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
  # Thin overlapping vanes, swept aft without a broad box underneath.
  poly=[p(2.21,14.21,1.20),p(3.10,14.48,1.03),p(4.47,14.95,-.90),p(4.08,15.23,-1.82),p(2.95,15.06,-1.57),p(2.12,14.62,-.20)]
  b.panel(J,'白鷺後掠肩部主甲',poly,(0,-.27,-.05),'blue2',.025)
  b.panel(J,'白鷺肩甲斜切前緣',[p(2.27,14.20,1.27),p(3.13,14.47,1.10),p(3.62,14.62,.41),p(3.28,14.28,.59),p(2.40,14.04,1.07)],(0,-.10,-.07),'navy',.018)
  b.panel(J,'白鷺肩甲服務面板',[p(3.01,15.07,-1.31),p(3.94,15.19,-1.62),p(4.21,14.96,-.91),p(3.35,14.65,.41),p(3.06,14.53,.64)],(0,-.07,0),'blue',.014)
  b.cyl(J,'白鷺肩部承載軸',p(2.1,13.4,-.1),p(3.9,13.3,-.1),.61,'dark',18)
  b.piston(J,'白鷺肩甲調角油壓桿',p(3.12,13.42,-.62),p(3.91,14.75,-1.22),.16)
  for x,y,z in ((2.77,14.50,.74),(4.10,15.09,-1.12),(3.15,15.05,-1.15)):
   b.bolt(J,p(x,y+.03,z),(0,1,0),.037)
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
  # A short faceted pauldron with a sloping cheek rather than a rectangular rampart.
  rows=[section(13.92,3.33,-.16,.89,1.03,.29),section(14.38,3.40,-.25,1.20,1.35,.50),section(14.83,3.18,-.46,1.11,1.10,.47),section(15.02,2.98,-.58,.69,.70,.31)]
  b.loft(J,'鐵潮斜切包覆肩甲',[[p(*q) for q in row] for row in rows],'armor',.025)
  b.panel(J,'鐵潮肩甲斜向防護面',[p(2.50,14.78,.57),p(3.66,14.78,.57),p(4.24,14.40,1.09),p(3.96,14.02,.89),p(2.70,14.02,.89),p(2.28,14.38,1.09)],(0,0,-.09),'blue',.023)
  b.panel(J,'鐵潮肩甲上層檢修面',[p(2.51,15.03,-1.01),p(3.40,15.03,-1.01),p(3.82,14.80,.32),p(2.22,14.80,.32)],(0,-.08,0),'armor2',.018)
  b.panel(J,'鐵潮外側斜收護片',[p(4.47,14.43,-.63),p(4.47,14.43,.57),p(4.27,13.59,.69),p(3.99,13.29,.30),p(4.12,13.87,-.71)],(-s*.12,0,0),'blue',.019)
  for z in (-.86,-.64,-.42):
   b.box(J,'鐵潮肩甲嵌入式冷卻槽',p(3.02,15.05,z),(.65,.023,.05),'recess',.005)
  for x in (2.57,3.56):
   b.cyl(J,'鐵潮肩甲檢修鉸鏈',p(x,14.89,.13),p(x+.18,14.89,.13),.042,'steel',8)
  b.panel(J,'鐵潮肩甲橘色辨識條',[p(2.82,14.36,1.11),p(3.84,14.36,1.11),p(3.75,14.24,1.05),p(2.90,14.24,1.05)],(0,0,-.025),'orange',.009)
  for x,y,z in ((2.53,14.43,1.13),(3.99,14.43,1.13),(2.79,14.14,.97),(3.80,14.14,.97)):
   b.bolt(J,p(x,y,z),r=.043)
  b.cyl(J,'鐵潮肩甲下方橫軸',p(2.1,13.4,-.1),p(3.9,13.3,-.1),.65,'dark',18)
  b.piston(J,'鐵潮肩甲承載油壓桿',p(3.15,13.13,-1.02),p(3.83,14.21,-1.14),.18)

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
