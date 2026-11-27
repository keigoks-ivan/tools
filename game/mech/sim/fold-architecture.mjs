import * as THREE from 'three';
import {HEIGHT} from './campaign.mjs';

// Shared cross-sections. Metre-scaled UVs are applied when each building joins the city batch.
function roofProfile(outline){
  const pos=[],uv=[],indices=[];
  function point(x,y,z){pos.push(x,y,z);uv.push(x+.5,y);}
  for(const z of [-.5,.5]){
    const start=pos.length/3;
    for(const [x,y] of outline)point(x,y,z);
    for(let i=1;i<outline.length-1;i++){
      if(z<0)indices.push(start,start+i+1,start+i);else indices.push(start,start+i,start+i+1);
    }
  }
  for(let i=0;i<outline.length;i++){
    const [x,y]=outline[i],[xx,yy]=outline[(i+1)%outline.length],v=pos.length/3;
    point(x,y,-.5);point(xx,yy,-.5);point(xx,yy,.5);point(x,y,.5);
    indices.push(v,v+1,v+2,v,v+2,v+3);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(indices);g.computeVertexNormals();return g;
}
const mansard=roofProfile([[-.5,0],[.5,0],[.37,.84],[.18,1],[-.18,1],[-.37,.84]]);
const vault=roofProfile([[-.5,0],[.5,0],[.47,.33],[.38,.65],[.23,.91],[0,1],[-.23,.91],[-.38,.65],[-.47,.33]]);
const shed=roofProfile([[-.5,0],[.5,0],[.36,1],[-.5,.12]]);
const cube=new THREE.BoxGeometry(),drum=new THREE.CylinderGeometry(.5,.5,1,16);
const lantern=new THREE.CylinderGeometry(.11,.5,1,8);
const fanlight=new THREE.TorusGeometry(1,.13,4,10,Math.PI);
const greenery=new THREE.SphereGeometry(1,6,4);

const stone=[0xe8d9bd,0xd6c6b0,0xd7d3c4,0xe6d3b8];
const slate=[0x617e83,0x887569,0x65727d];
const alloy=[0xe5dcc5,0xd5e1df,0xdccfb7];
const glass=[0xd7f6f6,0xf2e8ce,0xc6dfe9];
const frontage=[0,3,1,2,0,1,3,2,1,0,2];

// The city grid indexes one envelope per plot and orientation. Only the active envelope
// exposes its constituent roofs, wings and terraces to nearby movement and ray queries.
export function foldedSolids(site){
  const plots=[],empty=[];
  function envelope(parts){
    const b={x0:Infinity,x1:-Infinity,z0:Infinity,z1:-Infinity,bottom:Infinity,top:-Infinity};
    for(const part of parts){
      b.x0=Math.min(b.x0,part.x0);b.x1=Math.max(b.x1,part.x1);
      b.z0=Math.min(b.z0,part.z0);b.z1=Math.max(b.z1,part.z1);
      b.bottom=Math.min(b.bottom,part.bottom);b.top=Math.max(b.top,part.top);
    }
    return b;
  }
  function register(parts,ceiling){
    const inverted=parts.map(b=>({x0:-b.x1,x1:-b.x0,z0:b.z0,z1:b.z1,bottom:HEIGHT-b.top,top:HEIGHT-b.bottom}));
    const a=envelope(parts),b=envelope(inverted);
    plots.push({a,b,parts,inverted,ceiling});site.boxes.push(a,b);
  }
  function orient(upper){
    for(const plot of plots){
      const up=upper===plot.ceiling;
      plot.a.collisionParts=up?plot.parts:empty;plot.b.collisionParts=up?empty:plot.inverted;
    }
  }
  return {register,orient};
}

export function building(p,solids,i,j,ceiling){
  const side=Math.sign(i),row=Math.abs(i),near=row===1;
  const seed=(row*137+(j+7)*53+(side+1)*71+(ceiling?863:0))>>>0;
  const noise=(k)=>{let h=Math.imul(seed+k,0x45d9f3b);h=Math.imul(h^(h>>>16),0x45d9f3b);return (h>>>0)/4294967296;};
  const kind=frontage[(j+5+(side<0?0:4)+(ceiling?2:0)+row-1)%frontage.length];
  // Keep both bosses' full strafe arcs clear at the far intersection.
  const setback=near&&j>=3&&j<=4?20:0;
  const x=side*((near?90:row*111)+setback+noise(1)*14);
  const z=j*104+(noise(2)-.5)*20;
  const w=31+noise(3)*14,d=42+noise(4)*21;
  const floors=5+Math.floor(noise(5)*5),h=floors*3.8;
  const face=ceiling?'curtain':'quayside',wall=ceiling?glass[seed%3]:[0xfff7e8,0xffebdb,0xeef4ee][seed%3];
  const trim=ceiling?alloy[seed%3]:stone[seed%4],roof=slate[seed%3];
  const X=offset=>x+side*offset;
  function piece(g,dx,y,dz,width,height,depth,color,skin=false){
    p.add(g,X(dx),y,z+dz,width,height,depth,color,skin);
  }
  function box(dx,y,dz,width,height,depth,color,skin=false){
    piece(cube,dx,y,dz,width,height,depth,color,skin);
  }
  const parts=[];
  function solid(dx,dz,width,depth,lo,hi){
    parts.push({x0:X(dx)-width/2,x1:X(dx)+width/2,z0:z+dz-depth/2,z1:z+dz+depth/2,bottom:lo,top:hi});
  }
  function storeys(dx,dz,width,depth,lo,hi,color=wall){
    box(dx,(lo+hi)/2,dz,width,hi-lo,depth,color,face);solid(dx,dz,width,depth,lo,hi);
    box(dx,hi+.22,dz,width+.75,.44,depth+.75,trim);
  }
  function oval(dx,dz,width,depth,lo,hi){
    piece(drum,dx,(lo+hi)/2,dz,width,hi-lo,depth,wall,face);
    piece(drum,dx,hi+.28,dz,width+1,.56,depth+1,trim);
    const slices=near?7:3;
    for(let k=0;k<slices;k++){
      const t=(k+.5)*2/slices-1;
      solid(dx,dz+t*depth/2,width*Math.sqrt(1-t*t),depth/slices,lo,hi+.56);
    }
  }
  function cap(profile,dx,dz,width,depth,lo,rise,color){
    piece(profile,dx,lo,dz,width,rise,depth,color);
    const slices=near?7:3;
    for(let k=0;k<slices;k++){
      const t=(k+.5)*2/slices-1,span=profile===mansard?Math.min(1,(1-Math.abs(t))*3.8):
        profile===shed?(t<.72?.12+(1+t)*.51:(1-t)/.28):Math.sqrt(1-t*t);
      solid(dx+side*t*width/2,dz,width/slices,depth,lo,lo+rise*span);
    }
  }
  function doors(dx,upto,zCentre=0){
    for(const dz of [-upto,0,upto]){
      box(dx,2.1,zCentre+dz,.35,4.2,3.8,0x53656a);
      box(dx-.95,4.5,zCentre+dz,2.2,.45,5.5,trim);
    }
  }

  function arcade(width,depth){
    const front=-depth*.5-.25,bays=3;
    box(0,4.9,front,width+.7,.56,1.2,trim);
    for(let k=0;k<bays;k++){
      const dx=(k-1)*width*.28;
      box(dx,1.75,front,4.2,3.5,.6,0x4d6265);
      p.add(drum,X(dx),3.25,z+front-.26,4.2,.4,4.2,0x62797b,false,Math.PI/2);
      p.add(fanlight,X(dx),3.25,z+front-.55,2.25,1.62,2,trim);
      for(const post of [-2.23,2.23])box(dx+post,1.6,front-.42,.45,3.2,.58,trim);
    }
  }

  if(!ceiling&&kind===0){
    // Exchange hall: a copper barrel roof, stone end gables and a lower unloading wing.
    storeys(0,0,w,d,0,h*.68);
    cap(vault,0,0,w+1,d+1,h*.68,10,0x72948c);
    storeys(w*.55,-d*.09,w*.32,d*.76,0,h*.44);
    if(near){
      for(let k=-2;k<=2;k++)piece(vault,0,h*.68+.15,d*k*.22,w+1.6,10.4,.48,trim);
      arcade(w,d);doors(-w/2-.15,d*.28);
      // Cast-iron market canopy and narrow high windows beneath the roof spring.
      const apron=-w*.5-2.2;
      box(apron,5.4,0,4.7,.58,d*.90,0x69887f);
      for(const dz of [-d*.37,-d*.12,d*.12,d*.37]){
        box(apron-1.6,2.7,dz,.4,5.3,.4,roof);
        p.strut([X(apron-1.6),3.7,z+dz],[X(-w*.5),5.2,z+dz],.26,.25,roof);
      }
      box(-w*.5-.1,h*.68-1.8,0,.42,2.1,d*.89,0x758f8e);
      for(const sign of [-1,1])p.add(drum,x,h*.68+3.6,z+sign*(d/2+.57),6.5,.55,6.5,0x455f61,false,Math.PI/2);
    }
  }else if(!ceiling&&kind===1){
    // Narrow adjoining houses: party walls, offset ridges, dormers and individual chimneys.
    const units=near?3:2;
    for(let k=0;k<units;k++){
      const dz=(k-(units-1)/2)*d/units,depth=d/units-.65;
      const width=w*(.80+.09*((k+seed)%3)),eave=h*(.8+.12*((k+1+seed)%3));
      const dx=(w-width)*.24;
      storeys(dx,dz,width,depth,0,eave);
      cap(mansard,dx,dz,width+1,depth+.7,eave,6.4,slate[(seed+k)%3]);
      box(dx+width*.19,eave+6.1,dz+depth*.22,1.6,3.9,1.7,0x977668);
      if(near){
        const bay=dx-width*.44;
        box(bay,eave+2.25,dz,3.6,3.7,4.2,trim);
        box(bay-1.86,eave+2.2,dz,.15,2.5,2.5,0x53656b);
        piece(mansard,bay,eave+4.05,dz,4.6,1.35,5.1,roof);
        box(dx-width*.5-.95,4.1,dz,2.7,.55,depth*.79,trim);
        const front=dx-width*.5;
        box(front-.12,1.75,dz-depth*.2,.36,3.5,2.6,0x46565a);
        box(front-.85,eave*.49,dz+depth*.13,1.85,eave*.40,depth*.34,0xf3ebd5,face);
        box(front-.95,eave*.69+.24,dz+depth*.13,2.2,.48,depth*.37,trim);
      }
    }
  }else if(!ceiling&&kind===2){
    // A clock hotel anchors the low street wall with a tall, narrow corner tower.
    storeys(0,0,w,d,0,h*.77);
    cap(mansard,0,0,w+1,d+1,h*.77,5.3,roof);
    const dx=-w*.26,dz=-d*.31,tower=h+12;
    storeys(dx,dz,13,14,h*.77,tower-5);
    box(dx,tower-2.5,dz,13.2,5,14.2,trim);solid(dx,dz,13,14,tower-5,tower);
    box(dx,tower-.05,dz,14.4,.65,15,trim);
    piece(lantern,dx,tower+4.4,dz,15.8,8.8,15.8,0x628b83);
    if(near){
      piece(drum,dx,tower+9.45,dz,2.3,2.2,2.3,0xa48260);
      box(dx,tower+11.7,dz,.3,3.2,.3,roof);
      for(const dir of [-1,1])box(dx+dir*5.8,tower-3,dz-7.1,.66,6.2,.72,trim);
    }
    solid(dx,dz,8,8,tower,tower+7);
    if(near){
      p.add(drum,X(dx),tower-2.6,z+dz-7.25,4.4,.46,4.4,0xf5e6c6,false,Math.PI/2);
      box(dx,tower-2,dz-7.55,.22,1.45,.15,0x374752);box(dx+.51,tower-2.7,dz-7.55,1.22,.2,.15,0x374752);
      p.add(drum,X(dx)-side*6.83,tower-2.6,z+dz,4.4,.56,4.4,0xf8ebca,false,0,0,Math.PI/2);
      box(dx-7.17,tower-2.15,dz,.15,1.32,.21,0x36464c);
      box(dx-7.17,tower-2.64,dz+.54,.15,.21,1.24,0x36464c);
      arcade(w,d);doors(-w/2-.2,d*.25);
      for(const k of [-1,1])box(k*w*.36,h*.37,-d*.5-.32,1.3,h*.74,1.3,trim);
    }
  }else if(!ceiling){
    // Brick works with north-light sawtooths; each roof has a glazed clerestory.
    const eave=h*.68,n=3;storeys(0,0,w,d,0,eave);
    for(let k=0;k<n;k++){
      const dx=(k-1)*w/n;
      cap(shed,dx,0,w/n,d,eave,6.5,roof);
      // The sawtooth runs along world X, even on the opposite side of the street.
      box(dx+side*w/n*.36,eave+4.3,0,.48,2.7,d*.92,0xb2c7c7);
    }
    if(near){
      const dx=w*.66,dz=d*.28;
      piece(drum,dx,h*.62,dz,3.8,h*1.24,3.8,0xb4836b);
      solid(dx,dz,3.3,3.3,0,h*1.24);doors(-w/2-.2,d*.28);
    }
  }else if(kind===0){
    // Cascade housing: genuinely habitable terraces step back from the avenue.
    const levels=4,rise=h*.31;
    for(let k=0;k<levels;k++){
      const width=w*(1-k*.18),depth=d*(1-k*.08),dx=k*w*.09,dz=k*1.5;
      storeys(dx,dz,width,depth,k*rise,(k+1)*rise);
      if(near&&k<levels-1){
        const edge=dx-width/2+.65;
        box(edge,(k+1)*rise+.94,dz,.55,1.05,depth,trim);
        for(const off of [-depth*.28,depth*.26]){
          box(edge+1.6,(k+1)*rise+.72,dz+off,2.3,1.2,5.5,0xd4cbb8);
          piece(greenery,edge+1.6,(k+1)*rise+1.65,dz+off,1.15,1.35,2.6,0x738875);
        }
      }
    }
  }else if(kind===1){
    // A lenticular office with a low side lobby and a recessed mechanical crown.
    const tall=h+15;oval(1,-2,w*.87,d,0,tall);
    oval(-w*.29,d*.26,w*.5,d*.38,0,8);
    piece(drum,1,tall+1.65,-2,w*.68,2.5,d*.80,0x889c9e);
    if(near){
      for(let floor=7.6;floor<tall;floor+=7.6)
        piece(drum,1,floor,-2,w*.87+1.2,.54,d+1.2,trim);
      for(let k=0;k<10;k++){
        const theta=k*Math.PI/5;
        const dx=1+Math.sin(theta)*w*.435,dz=-2+Math.cos(theta)*d*.5;
        box(dx,tall*.50,dz,.66,tall,.77,trim);
      }
      piece(drum,-w*.29,8.35,d*.26,w*.53,.63,d*.41,trim);
    }
  }else if(kind===2){
    // Split towers: daylight is visible through the gap below the enclosed skybridge.
    const a=-d*.27,b=d*.28,tall=h+11,low=h+2;
    oval(3,a,w*.74,d*.43,0,tall);oval(-4,b,w*.72,d*.40,0,low);
    const lo=low*.65,depth=b-a;
    storeys(0,(a+b)/2,w*.24,depth,lo,lo+4.0,0xe4edde);
    if(near)for(const [dx,dz,width,depth,height] of [[3,a,w*.74,d*.43,tall],[-4,b,w*.72,d*.4,low]]){
      piece(drum,dx,height+1.4,dz,width*.77,2.2,depth*.75,0x93a4a0);
      piece(drum,dx,height*.58,dz,width+1,.64,depth+1,trim);
    }
  }else{
    // Conservatory: paired arched naves, exposed roof ribs and an offset service core.
    const eave=h*.52;
    storeys(0,0,w,d,0,eave);
    for(const sign of [-1,1]){
      const dx=sign*w*.25;
      cap(vault,dx,0,w*.50,d,eave,8.6,0xa7c6bf);
      if(near){
        for(const end of [-1,1]){
          piece(vault,dx,eave+.02,end*(d*.5+.14),w*.48,8.4,.38,0xdeeee5,face);
          for(const t of [-.65,0,.65])p.strut([X(dx),eave,z+end*(d*.5+.37)],
            [X(dx+t*w*.24),eave+8.45*Math.sqrt(1-t*t),z+end*(d*.5+.37)],.47,.35,trim);
        }
        for(const t of [-.6,0,.6])box(dx+t*w*.25,eave+8.6*Math.sqrt(1-t*t),0,.37,.47,d,trim);
      }
      if(near)for(let k=-2;k<=2;k++)
        piece(vault,dx,eave+.25,k*d*.22,w*.5+.5,8.9,.70,trim);
    }
    storeys(w*.37,-d*.25,w*.30,d*.27,eave,eave+12);
    if(near){
      box(-w*.5-.15,1.25,0,.75,2.5,d+.32,trim);
      box(-w*.5-1.6,5.8,0,3.4,.6,d*.67,trim);
      for(const t of [-.4,-.2,0,.2,.4])box(-w*.5-.30,eave*.52,d*t,.85,eave*.96,.72,trim);
      for(const dz of [-d*.24,d*.24])box(-w*.5-2.7,2.8,dz,.48,5.6,.62,trim);
    }
  }

  // The old street has deep shopfront bays; above, glazed winter gardens hang from the podiums.
  if(near){
    const bx=-w*.54-2.8,depth=d*.72,height=ceiling?8.8:7.4,glass=ceiling?'conservatory':'shop';
    box(bx+1.3,height*.5,0,5,height,depth+1.2,trim);
    solid(bx+1.3,0,5,depth+1.2,0,height);
    for(let n=0;n<3;n++){
      const bz=(n-1)*depth/3;
      p.panel(X(bx-1.23),height*.50,z+bz,depth/3-.30,height-.60,glass,0,-side*Math.PI/2);
      box(bx-1.4,height*.50,bz-depth/6,.42,height,.45,trim);
    }
    box(bx-.2,height+.34,0,6.9,.68,depth+2,ceiling?0x9bb3ae:0x587f75);
    if(!ceiling){
      for(const k of [-1,1]){
        const bz=k*d*.25;
        box(bx-2.1,height-1.3,bz,.42,2.1,.45,0x584f43);
        box(bx-2.1,height-.35,bz,.82,.94,.88,0xffe1ab,true);
      }
    }
  }

  // Shallow infill and split shopfronts close gaps along the principal street.
  // Leave a cross street every third plot, wide enough to see and fly between blocks.
  if(near&&j%3!==0){
    const run=21+noise(9)*7,depth=17+noise(10)*6,dx=-w*.16;
    const dz=d*.5+run*.5+4,storey=ceiling?9.2:7.5;
    storeys(dx,dz,depth,run,0,storey);
    const edge=dx-depth*.5;
    if(ceiling){
      box(edge-.9,storey+.18,dz,3.2,.4,run+1.5,trim);
      for(const k of [-1,1]){
        box(edge-1.7,storey*.5,dz+k*run*.33,.5,storey,.7,trim);
        box(dx,storey+1.4,dz+k*run*.22,4.5,1.8,2.9,0x93a3a2);
      }
    }else{
      cap(mansard,dx,dz,depth+.6,run+.6,storey,3.3,roof);
      for(const k of [-1,1]){
        box(edge-.2,2.1,dz+k*run*.25,.45,3.9,run*.38,0x526768);
        p.add(cube,X(edge-1),4.4,z+dz+k*run*.25,2.7,.28,run*.43,k<0?0x798d83:0xa4806a,false,0,0,side*.16);
      }
    }
  }
  solids.register(parts,ceiling);
}
