"""Full-volume torso, overhanging shoulder decks and integrated propulsion."""
from math import pi, sin, cos
from mathutils import Vector
from geometry import section
J='M07_Upper'

def build(b):
 # The outer chest is carried by a deep, tapered cast frame.
 b.loft(J,'胸腔完整承力殼',[section(11.67,0,-.10,1.43,1.15,.29),section(12.36,0,-.08,2.13,1.48,.38),section(13.52,0,-.14,2.43,1.57,.39),section(14.32,0,-.18,1.84,1.24,.33)],'dark',.075)
 b.role='Hatch'
 b.loft(J,'前胸中央厚實龍骨',[section(11.57,0,1.26,.38,.43,.14),section(12.12,0,1.59,.61,.56,.18),section(13.48,0,1.72,.86,.59,.23),section(14.15,0,1.35,.64,.43,.20)],'blue',.045)
 # Front inset ends before the machined glancing surfaces around the chest.
 b.panel(J,'胸甲中央檢修蓋',[(-.53,13.77,2.07),(.53,13.77,2.07),(.63,13.31,2.34),(.49,12.56,2.28),(-.49,12.56,2.28),(-.63,13.31,2.34)],(0,0,-.055),'blue2',.019)
 for k in range(3):b.box(J,'中央排熱柵',(0,13.08-k*.078,2.335),(.53,.032,.035),'recess',.006)
 for x,y,z in ((-.45,13.57,2.24),(.45,13.57,2.24),(-.36,12.72,2.31),(.36,12.72,2.31)):b.bolt(J,(x,y,z),r=.041)
 b.role=None
 for s in (-1,1):
  p=lambda x,y,z:(s*x,y,z)
  def rings(rows):return [[p(*v) for v in section(*r)] for r in rows]
  # The clavicle and pectoral plates wrap the front, flank and top, not a floating front sheet.
  b.loft(J,'包覆式斜肩胸甲',rings([(12.42,1.60,.65,.64,.85,.23),(13.12,1.68,.61,.88,1.15,.27),(13.87,1.43,.48,.91,1.12,.25),(14.22,1.18,.32,.67,.88,.23)]),'blue',.042)
  b.loft(J,'下胸鉸接重甲',rings([(11.83,1.49,.68,.47,.62,.17),(12.38,1.71,.75,.57,.83,.20),(12.96,1.89,.74,.58,.88,.20)]),'navy',.035)
  b.panel(J,'鎖骨前緣獨立鋼板',[p(.87,13.96,1.64),p(1.68,13.88,1.68),p(2.20,13.44,1.74),p(2.20,13.24,1.88),p(.94,13.48,1.87)],(0,0,-.09),'blue2',.024)
  b.panel(J,'胸側小型維修面',[p(1.39,12.77,1.67),p(1.98,12.85,1.68),p(2.05,12.45,1.62),p(1.68,12.15,1.58),p(1.43,12.30,1.58)],(0,0,-.07),'armor',.02)
  # Recessed machinery is partly occluded by the sloping breastplate.
  for i in range(3):b.box(J,'胸側層疊散熱片',p(2.16,12.24+i*.29,-.35),(.22,.16,1.25),'edge_dark',.022)
  b.cyl(J,'斜向胸架承力樞軸',p(.80,11.76,.42),p(1.91,12.41,.51),.24,'armor',12)
  b.piston(J,'主腹部液壓撐桿',p(1.75,12.09,1.05),p(1.08,10.68,1.08),.26)
  b.piston(J,'次級腹部液壓撐桿',p(1.77,12.01,.37),p(1.20,10.66,.26),.15)
  b.tube(J,'腹部編織管線',[p(1.97,12.10,-.38),p(1.90,11.58,-.59),p(1.50,10.87,-.44)],.095)
  b.box(J,'腹部液壓閥體',p(1.31,10.90,.83),(.37,.39,.45),'armor2',.047,rot=(0,0,s*.17))
  for x,y,z in ((1.11,13.71,1.86),(1.94,13.48,1.89),(1.66,12.49,1.75)):b.bolt(J,p(x,y,z),r=.045)
 b.box(J,'駕駛艙內嵌暗室',(0,13.10,1.64),(.98,1.57,.14),'rubber',.04)
 b.box(J,'駕駛艙座椅靠背',(0,12.91,1.76),(.46,.70,.12),'dark',.045)
 b.box(J,'駕駛艙座墊',(0,12.54,1.90),(.46,.12,.31),'rubber',.03)
 for s in (-1,1):
  b.box(J,'駕駛艙側控制台',(s*.37,12.91,1.82),(.16,.22,.29),'dark',.025)
  b.cyl(J,'駕駛艙側屏幕',(s*.37,13.01,1.86),(s*.37,13.04,1.89),.055,'cyan',8,glow=True)
 # A short, layered rotating abdomen leaves room for the diagonal struts.
 b.cyl(J,'腹部旋轉主軸',(0,10.45,-.12),(0,12.10,-.12),.70,'recess',16)
 for y,r,d,c in ((10.75,.91,.21,'dark'),(11.03,.84,.13,'steel'),(11.30,.80,.19,'dark'),(11.59,.86,.13,'edge_dark')):
  b.cyl(J,'腹部環形承力層',(0,y-d/2,-.12),(0,y+d/2,-.12),r,c,16)
 b.box(J,'腹部內嵌電控模組',(0,11.39,.62),(.71,.56,.36),'dark',.04)
 pelvis(b)


def pelvis(b):
 j='M07_Body'
 b.loft(j,'骨盆整體深框',[section(9.50,0,-.20,1.28,.95,.25),section(10.14,0,-.12,1.95,1.18,.31),section(10.84,0,-.08,1.71,1.10,.29)],'dark',.055)
 b.loft(j,'骨盆中央承載重甲',[section(8.88,0,.77,.43,.45,.15),section(9.48,0,1.10,.65,.63,.20),section(10.35,0,1.12,.83,.68,.22),section(10.79,0,.92,.62,.50,.19)],'blue',.041)
 b.panel(j,'骨盆前甲檢修片',[(-.48,10.49,1.81),(.48,10.49,1.81),(.48,10.05,1.85),(.25,9.80,1.81),(-.28,9.80,1.81),(-.49,10.05,1.85)],(0,0,-.06),'blue2',.018)
 for s in (-1,1):
  p=lambda x,y,z:(s*x,y,z)
  b.cyl(j,'髖部主旋轉軸',p(.71,10.12,-.08),p(2.39,10.12,-.08),.73,'dark',16)
  b.ring(j,'髖部外部密封座',p(1.61,10.12,-.08),(s,0,0),.79,.58,'armor',.27,16)
  b.loft(j,'腰帶斜角承載塊',[[p(*v) for v in r] for r in [section(10.19,1.32,.61,.67,.57,.19),section(10.65,1.42,.50,.85,.67,.22),section(10.92,1.22,.37,.67,.57,.18)]],'armor2',.04)
  # Thick segmented outrigger skirt protects the hip motor and the outside upper thigh.
  b.loft(j,'外髖側裙厚殼',[
   [p(2.09,10.62,.59),p(2.57,10.43,.34),p(2.92,9.04,.30),p(2.83,8.52,.57),p(2.51,8.74,1.09),p(1.96,10.03,1.20)],
   [p(2.22,10.58,.11),p(2.63,10.36,-.22),p(3.03,8.99,-.23),p(2.93,8.45,.12),p(2.65,8.66,.70),p(2.11,10.03,.80)]
  ],'dark',.04)
  b.panel(j,'外髖橘色重裝側甲',[p(2.11,10.48,.70),p(2.53,10.30,.50),p(2.83,9.12,.48),p(2.73,8.70,.68),p(2.46,8.90,1.13),p(2.03,9.97,1.24)],(-s*.10,0,-.13),'orange',.026)
  b.panel(j,'髖側下緣厚折片',[p(2.77,9.12,.43),p(3.00,8.89,.08),p(3.08,8.37,.10),p(2.88,8.33,.48),p(2.68,8.65,.80)],(-s*.17,0,-.08),'armor',.022)
  for x,y,z in ((2.28,10.19,.91),(2.62,9.06,.85),(1.57,10.65,1.12)):b.bolt(j,p(x,y,z),r=.055)

def shoulders(b):
 for s in (-1,1):
  p=lambda x,y,z:(s*x,y,z)
  # A compact swept shell: the leading edge narrows to a bevel rather than a vertical wall.
  outline=[(2.04,-1.52),(2.76,-1.92),(3.91,-1.73),(4.53,-.92),(4.49,.66),(3.98,1.66),(3.00,1.87),(2.16,1.08),(1.98,-.06)]
  def deck_y(x,z):return 14.96-.23*z-.21*(x-2.5)
  cx=sum(x for x,z in outline)/len(outline);cz=sum(z for x,z in outline)/len(outline)
  def ring(scale,height):
   return [p(cx+(x-cx)*scale,deck_y(cx+(x-cx)*scale,cz+(z-cz)*scale)+height,cz+(z-cz)*scale) for x,z in outline]
  b.loft(J,'肩甲後掠楔形外殼',[ring(.86,-.34),ring(.98,-.17),ring(1.0,-.015),ring(.96,.035)],'armor',.022)
  b.loft(J,'肩甲內縮承力框',[ring(.69,-.51),ring(.81,-.34),ring(.83,-.27)],'dark',.025)
  def tile(name,poly,key='armor',offset=.095):
   return b.panel(J,name,[p(x,deck_y(x,z)+offset,z) for x,z in poly],(0,-.08,0),key,.018)
  tile('肩甲內側斜收護脊',[(2.16,-1.40),(2.79,-1.76),(3.10,-1.70),(2.95,-.33),(2.71,.90),(2.94,1.63),(2.30,1.01),(2.12,-.08)],'armor2')
  tile('肩甲後掠上層面板',[(3.21,-1.62),(3.85,-1.56),(4.35,-.88),(4.32,.26),(3.68,.18),(3.08,-.24)],'armor')
  tile('肩甲斜切前緣護片',[(3.03,-.10),(3.64,.31),(4.31,.40),(3.86,1.50),(3.10,1.67),(2.87,.96)],'armor2')
  if s==-1:
   tile('肩甲橘色窄幅識別甲',[(3.34,-1.43),(3.76,-1.39),(4.11,-.72),(3.91,-.18),(3.30,-.40)],'orange',.12)
  else:
   for z in (-1.21,-.98,-.75):tile('肩甲平嵌排熱縫',[(3.35,z),(3.91,z+.11),(3.94,z+.18),(3.33,z+.07)],'recess',.12)
  for coords in [[(2.39,-.86),(2.80,-.68),(2.77,-.50)],[(3.65,.55),(3.51,1.15),(3.17,1.30)]]:
   b.tube(J,'肩甲凹入式接縫',[p(x,deck_y(x,z)+.116,z) for x,z in coords],.010,'recess',4)
  for x,z in ((2.57,-1.14),(4.09,-.29)):
   yy=deck_y(x,z)+.11
   b.box(J,'肩甲平嵌維修鎖座',p(x,yy,z),(.16,.035,.24),'recess',.008)
   b.box(J,'肩甲平嵌鎖銷',p(x,yy+.012,z),(.045,.026,.16),'edge_dark',.006)
  for x,z in ((2.37,.66),(3.80,1.16),(4.12,-.75),(2.85,-1.53)):
   b.bolt(J,p(x,deck_y(x,z)+.13,z),(0,1,0),.040)
  # The bearing still meets the unchanged arm axis; only the cover loses bulk.
  b.cyl(J,'肩部主承力橫軸',p(2.04,13.44,-.10),p(3.90,13.22,-.12),.64,'dark',18)
  b.ring(J,'肩部外側承力環',p(3.85,13.23,-.10),(s,0,0),.66,.48,'steel',.15,18)
  b.loft(J,'肩甲內縮關節護罩',[[p(*v) for v in r] for r in [section(12.95,3.62,-.23,.53,.63,.18),section(13.73,3.58,-.24,.66,.73,.24),section(14.23,3.24,-.42,.54,.65,.22)]],'dark',.03)
  b.piston(J,'肩甲掀起液壓桿',p(3.17,13.14,-.70),p(3.44,14.58,-1.20),.16)

def packs(b):
 b.box(J,'雙推進艙背架',(0,12.66,-2.08),(1.20,4.95,1.06),'dark',.09)
 for y in (10.66,11.26,11.86,12.46,13.06,13.66,14.26):b.box(J,'背架橫向骨節',(0,y,-2.73),(1.0,.22,.35),'armor2',.04)
 for s in (-1,1):
  x=s*1.78
  b.loft(J,'推進艙承力壓力殼',[section(10.02,x,-3.14,.76,1.00,.23),section(10.66,x,-3.14,1.13,1.30,.28),section(13.83,x,-3.03,1.17,1.25,.27),section(15.48,x,-2.90,1.03,1.16,.24),section(16.76,x,-2.86,.93,1.02,.22),section(17.11,x,-2.85,.77,.90,.21)],'armor',.055)
  b.loft(J,'推進艙後上裝甲',[section(12.67,x,-4.17,.89,.33,.16),section(14.67,x,-4.06,.91,.34,.18)],'blue',.035)
  b.loft(J,'推進艙後下裝甲',[section(10.55,x,-4.21,.78,.33,.17),section(11.17,x,-4.37,.95,.34,.20),section(12.53,x,-4.22,.92,.32,.19)],'armor2',.037)
  b.box(J,'推進艙側前鋼軌',(x+s*1.07,12.86,-2.08),(.14,3.81,.17),'edge_dark',.018)
  b.box(J,'推進艙後側鋼軌',(x+s*1.10,12.79,-4.19),(.13,3.74,.16),'edge_dark',.018)
  # Open, recessed intake with an actual arch-shaped top cap.
  for direction in (-1,1):
   z=-2.89+direction*1.12
   b.box(J,'推進進氣口內腔',(x,16.11,z),(1.51,1.45,.19),'recess',.055)
   for i in range(6):b.box(J,'進氣口斜置葉片',(x,15.54+i*.205,z+direction*.12),(1.47-.024*i,.088,.24),'edge_dark',.02,rot=(direction*.40,0,0))
   for side in (-1,1):b.box(J,'進氣口厚實側壁',(x+side*.85,16.10,z),(.17,1.56,.30),'armor2',.035,rot=(0,0,-side*.055))
   b.box(J,'進氣口頂部護罩',(x,16.93,z-direction*.05),(1.65,.25,.59),'armor2',.055,rot=(direction*.12,0,0))
  for side in (-1,1):
   xx=x+side*1.17
   b.panel(J,'推進艙側面實體維修蓋',[(xx,14.57,-3.74),(xx,14.53,-2.28),(xx,12.02,-2.15),(xx,11.67,-3.83)],(-side*.15,0,0),'blue',.028)
   for y in (12.14,13.16,14.26):b.bolt(J,(xx+side*.01,y,-3.43),(side,0,0),.052)
  for y in (10.94,11.40,12.24,13.20,14.20):
   for side in (-1,1):b.bolt(J,(x+side*.63,y,-4.66 if y<12.5 else -4.43),(0,0,-1),.050)
  # Gimballed bell is integrated into the bottom cowling.
  axis=Vector((0,-.56,-.83));a=Vector((x,10.42,-3.49));c=Vector((x,9.73,-4.44))
  b.cyl(J,'噴口外側逐段承套',a,c,.86,'dark',20,r2=1.14)
  b.ring(J,'噴口外包護甲',c,axis,1.18,.84,'armor',.39,24)
  b.ring(J,'噴口亮金屬唇緣',c+axis*.21,axis,1.09,.84,'steel',.10,24)
  b.ring(J,'噴口內側熱遮罩',c+axis*.14,axis,.84,.53,'recess',.28,20)
  b.ring(J,'蒼焰噴口環',c+axis*.31,axis,.73,.60,'cyan',.055,24,True)
  for i in range(8):
   angle=i*pi/4
   b.box(J,'噴口周圍散熱鰭',(x+cos(angle)*1.10,9.84+sin(angle)*.82,-4.42),(.13,.27,.31),'edge_dark',.018,rot=(0,0,angle))
