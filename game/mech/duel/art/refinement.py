"""Functional, restrained mechanical details for all three shared chassis."""
from mathutils import Vector

def build(b):
 for s,label in ((-1,'L'),(1,'R')):
  p=lambda x,y,z:(s*x,y,z)
  j='M07_Upper'
  # Protection for the hydraulic unions, with actual mounting points.
  for y,x in ((11.07,1.20),(11.79,1.57)):
   b.ring(j,'液壓接頭壓帽',p(x,y,1.12),(0,1,0),.29,.20,'edge_dark',.10,10)
  b.tube(j,'腹部回油硬管',[p(1.38,10.90,.29),p(1.88,11.12,.26),p(2.02,11.77,.29),p(1.89,12.10,.29)],.045,'steel',8)
  b.box(j,'腹部回油閥座',p(1.87,11.24,.23),(.24,.25,.31),'dark',.025)
  # Anchored service cover hinges instead of bolts drawn across empty space.
  for x in (.91,1.96):
   b.cyl(j,'胸甲鉸鏈軸',p(x,13.43,1.94),p(x+.24,13.43,1.94),.055,'steel',10)
  sh='M07_Shin_'+label
  b.tube(sh,'小腿主缸回油硬管',[p(3.22,2.37,-.53),p(3.40,2.61,-.64),p(3.06,5.48,-.59),p(2.88,5.67,-.45)],.046,'steel',8)
  for y,x in ((2.67,3.37),(5.24,3.09)):
   b.box(sh,'硬管定位夾',p(x,y,-.62),(.22,.12,.17),'dark',.015)
  # Slender wiper seals and bearing dust caps distinguish rubber from chrome.
  for x,y,z in ((2.87,5.84,.66),(1.59,5.78,.58),(2.45,5.71,-.59)):
   b.ring(sh,'活塞防塵刮環',p(x,y,z),(0,1,0),.27,.18,'rubber',.08,14)
  ft='M07_Foot_'+label
  for x in (2.05,3.38):
   b.box(ft,'靴前分段固定座',p(x,.66,1.98),(.17,.29,.12),'dark',.015)
   b.bolt(ft,p(x,.68,2.06),r=.049)
