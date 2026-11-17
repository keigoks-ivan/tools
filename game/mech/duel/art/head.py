"""Original fighter helmet: swept crown and one uninterrupted armored visor."""
from math import sin, cos, pi
from geometry import section
J='M07_Upper'

def build(b):
 b.cyl(J,'頭部頸軸主承座',(0,13.45,.44),(0,14.46,.44),.56,'dark',20)
 for y,r,h,key in ((13.65,.76,.16,'armor'),(13.82,.69,.11,'steel'),(14.02,.65,.17,'dark')):
  b.cyl(J,'頸部防塵軸環',(0,y-h/2,.44),(0,y+h/2,.44),r,key,20)
 b.loft(J,'頭盔下方深嵌護圈',[section(13.73,0,.49,.90,.90,.22),section(14.10,0,.45,.98,.99,.24)],'navy',.035)
 # The dome is elongated front-to-back. Its rear is low and the forehead is swept.
 b.loft(J,'戰機頭盔內部殼體',[
  section(14.16,0,.60,.77,.77,.22),section(14.57,0,.65,1.10,1.00,.29),
  section(15.30,0,.72,1.28,1.22,.34),section(15.94,0,.55,1.12,1.08,.31),
  section(16.38,0,.34,.72,.73,.24),section(16.48,0,.25,.46,.48,.17)
 ],'dark',.045)
 # Upper shell wraps over the side of the visor; each slice is a real solid volume.
 def crown(z,cy,w,h):
  return [(-w*.68,cy+h,z),(w*.68,cy+h,z),(w,cy+h*.40,z),(w,cy-h*.54,z),(w*.68,cy-h,z),(-w*.68,cy-h,z),(-w,cy-h*.54,z),(-w,cy+h*.40,z)]
 b.loft(J,'流線額部主裝甲',[
  crown(-.55,15.62,.74,.60),crown(.18,15.72,1.16,.72),
  crown(1.17,15.59,1.25,.61),crown(1.94,15.43,1.05,.36),crown(2.48,15.36,.61,.17)
 ],'navy',0,True)
 # A faceted dorsal ridge replaces decorative antennae.
 b.loft(J,'中央後掠額脊',[
  [(-.19,15.42,2.10),(.19,15.42,2.10),(.20,15.49,2.03),(.16,15.56,1.91),(-.16,15.56,1.91),(-.20,15.49,2.03)],
  [(-.24,16.36,.20),(.24,16.36,.20),(.28,16.47,.12),(.22,16.55,-.02),(-.22,16.55,-.02),(-.28,16.47,.12)]
 ],'blue',.015)
 # Continuous panoramic visor, curved around the helmet's front corners.
 samples=17
 rows=[]
 for upper in (False,True):
  row=[]
  for i in range(samples):
   angle=(-73+146*i/(samples-1))*pi/180
   x=1.25*sin(angle);z=1.22+1.25*cos(angle)
   y=(15.38 if upper else 14.82)+(.10 if upper else .14)*abs(sin(angle))
   row.append((x,y,z))
  rows.append(row)
 verts=[v for r in rows for v in r]
 faces=[(i,i+1,i+1+samples,i+samples) for i in range(samples-1)]
 b.mesh(J,'一體式深色裝甲面罩',verts,faces,'visor',smooth=True)
 # Narrow machined visor surround follows the same curved canopy edge.
 for upper in (False,True):
  for i in range(samples-1):
   a=rows[1 if upper else 0][i];c=rows[1 if upper else 0][i+1]
   b.cyl(J,'面罩周圍密封金屬邊',a,c,.042 if upper else .032,'edge_dark',6)
 # A restrained internal sensor band is continuous, rather than a pair of humanoid eyes.
 r=[]
 for i in range(13):
  angle=(-52+104*i/12)*pi/180
  r.append((1.255*sin(angle),15.14+.04*abs(sin(angle)),1.22+1.26*cos(angle)))
 for a,c in zip(r,r[1:]):b.cyl(J,'面罩內部橫向感測光帶',a,c,.018,'cyan',6,glow=True)
 for s in (-1,1):
  p=lambda x,y,z:(s*x,y,z)
  # Cheek and jaw form one swept mechanical housing; there is no human mouth plate.
  b.loft(J,'頭盔側下方流線護殼',[
   [p(.31,14.75,2.17),p(.92,14.87,1.95),p(1.28,15.10,1.29),p(1.21,14.63,.28),p(.71,14.21,.62),p(.33,14.18,1.52)],
   [p(.25,14.65,1.93),p(.83,14.75,1.72),p(1.10,15.01,1.17),p(1.05,14.62,.33),p(.63,14.34,.64),p(.27,14.32,1.43)]
  ],'armor',.035)
  b.panel(J,'頭盔側面進氣護甲',[p(1.21,15.14,1.08),p(1.32,15.33,.58),p(1.20,15.18,-.13),p(1.10,14.64,-.05),p(1.12,14.59,.59)],(-s*.13,0,0),'blue',.022)
  for y in (14.79,14.91,15.03):b.box(J,'頭盔側進氣口',p(1.267,y,.48),(.034,.045,.34),'recess',.007)
  b.ring(J,'頭盔側面低矮鉸接座',p(1.18,14.66,.27),(s,0,0),.225,.143,'steel',.075,16)
  b.cyl(J,'頭盔側面軸承蓋',p(1.21,14.66,.27),p(1.26,14.66,.27),.132,'armor',16)
  b.panel(J,'後腦獨立維修蓋',[p(.12,15.84,-.54),p(.63,15.88,-.47),p(.99,15.38,-.52),p(.86,14.66,-.45),p(.24,14.58,-.49)],(0,0,.15),'armor',.026)
  b.bolt(J,p(.57,15.51,-.57),(0,0,-1),.037)
  for x,y,z in ((.48,16.10,.93),(.97,15.64,1.54)):
   b.bolt(J,p(x,y,z),(0,.52,.85),.035)
 # Compact chin intake ends above the protected neck swivel.
 b.loft(J,'面罩下方中央機械護板',[
  [(-.31,14.72,2.18),(.31,14.72,2.18),(.36,14.28,1.72),(.20,14.08,1.42),(-.20,14.08,1.42),(-.36,14.28,1.72)],
  [(-.31,14.65,1.99),(.31,14.65,1.99),(.33,14.27,1.53),(.18,14.12,1.26),(-.18,14.12,1.26),(-.33,14.27,1.53)]
 ],'navy',.026)
 b.box(J,'後腦中央線路保護脊',(0,15.22,-.55),(.22,.92,.20),'dark',.026)
 for y in (14.91,15.10,15.29,15.48):b.box(J,'後腦線路扣件',(0,y,-.67),(.18,.065,.055),'steel',.008)
 # A small amber rangefinding aperture is inset into the left brow.
 b.ring(J,'額側測距器金屬座',(-.88,15.50,1.79),(0,.2,1),.115,.075,'edge_dark',.075,14)
 b.cyl(J,'額側測距器鏡片',(-.88,15.49,1.78),(-.88,15.50,1.83),.069,'amber',14,glow=True)
