// Compact Japanese road cars in metres, facing +Z. Cached geometry is shared by city instances and map props.
import * as THREE from 'three';

const cache = new Map();
const mix = (a, b, t) => a + (b - a) * t;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const profiles = [
  { name: 'Japanese fastback', inspiration: 'Toyota Prius', length: 4.60, width: 1.78, height: 1.43, wheelbase: 2.75,
    axle: [-1.38, 1.37], radius: .335, arch: .39, greenhouse: .625, side: [-1.65, .80], front: [.22, 1.12], rear: [-1.89, -1.02], pillar: [-.36, -.23],
    // z, half width, belt height, crown height
    shape: [[-2.30,.78,.78,.86],[-2.03,.86,.87,.97],[-1.62,.885,.915,1.17],[-1.02,.89,.94,1.37],[-.47,.89,.94,1.43],[.06,.89,.92,1.415],[.55,.88,.91,1.225],[1.12,.875,.885,.965],[1.75,.855,.83,.90],[2.30,.755,.71,.79]] },
  { name: 'Japanese compact hatch', inspiration: 'Honda Fit', length: 3.995, width: 1.695, height: 1.515, wheelbase: 2.53,
    axle: [-1.265, 1.265], radius: .303, arch: .36, greenhouse: .64, side: [-1.71, .83], front: [.38, 1.14], rear: [-1.93, -1.60], pillar: [-.34, -.21],
    shape: [[-1.9975,.73,.86,1.10],[-1.93,.79,.92,1.25],[-1.60,.832,.955,1.455],[-1.02,.8475,.96,1.505],[-.42,.8475,.95,1.515],[.08,.845,.935,1.49],[.58,.834,.915,1.29],[1.14,.818,.895,1.015],[1.64,.80,.85,.935],[1.9975,.735,.82,.905]] },
  { name: 'Japanese compact crossover', inspiration: 'Mazda CX-30', length: 4.395, width: 1.795, height: 1.54, wheelbase: 2.655,
    axle: [-1.3275, 1.3275], radius: .344, arch: .41, greenhouse: .635, side: [-1.57, .77], front: [.25, 1.00], rear: [-1.91, -1.12], pillar: [-.39, -.25],
    shape: [[-2.1975,.79,.88,1.05],[-1.91,.86,.97,1.17],[-1.48,.893,1.015,1.425],[-.94,.8975,1.015,1.525],[-.42,.8975,.99,1.54],[.15,.892,.975,1.505],[.58,.882,.955,1.29],[1.00,.878,.94,1.03],[1.67,.86,.91,.995],[2.1975,.795,.84,.935]] },
];

// Interpolated sections give the bonnet, roof and shoulders one continuous surface.
function section(profile, z) {
  const a = profile.shape;
  let i = 0; while (i < a.length - 2 && z > a[i + 1][0]) i++;
  const lo = a[i], hi = a[i + 1], t = clamp((z - lo[0]) / (hi[0] - lo[0])), h = hi[0] - lo[0];
  return [1, 2, 3].map(k => {
    const prev = a[Math.max(0, i - 1)], next = a[Math.min(a.length - 1, i + 2)];
    const m0 = (hi[k] - prev[k]) / (hi[0] - prev[0]), m1 = (next[k] - lo[k]) / (next[0] - lo[0]);
    const value = (2*t*t*t-3*t*t+1)*lo[k]+(t*t*t-2*t*t+t)*h*m0+(-2*t*t*t+3*t*t)*hi[k]+(t*t*t-t*t)*h*m1;
    return clamp(value, Math.min(lo[k],hi[k]), Math.max(lo[k],hi[k]));
  });
}

class Bucket {
  constructor() { this.p = []; this.n = []; this.c = []; }
  triangle(a, b, c, col, outward) {
    const u = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), v = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const n = u.cross(v); if (n.lengthSq() < 1e-14) return;
    if (outward && n.dot(new THREE.Vector3(...outward)) < 0) { [b,c] = [c,b]; n.negate(); }
    n.normalize();
    for (const p of [a,b,c]) { this.p.push(...p); this.n.push(n.x,n.y,n.z); this.c.push(...col); }
  }
  quad(a,b,c,d,col,outward) { this.triangle(a,b,c,col,outward); this.triangle(a,c,d,col,outward); }
  add(g, col, creased = false) {
    const v = g.index ? g.toNonIndexed() : g;
    if (!v.attributes.normal) v.computeVertexNormals();
    const p = v.attributes.position, n = v.attributes.normal, c = v.attributes.color;
    if(creased) {
      const a=new THREE.Vector3(),b=new THREE.Vector3(),f=new THREE.Vector3(),average=new THREE.Vector3();
      for(let i=0;i<p.count;i+=3) {
        a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1).sub(a);f.fromBufferAttribute(p,i+2).sub(a);f.crossVectors(b,f).normalize();
        average.set(n.getX(i)+n.getX(i+1)+n.getX(i+2),n.getY(i)+n.getY(i+1)+n.getY(i+2),n.getZ(i)+n.getZ(i+1)+n.getZ(i+2)).normalize();
        // A crumpled corner is a crease; interpolate the intact roof and bonnet as before.
        if(f.dot(average)<.25)for(let j=0;j<3;j++)n.setXYZ(i+j,f.x,f.y,f.z);
      }
    }
    for (let i = 0; i < p.count; i++) {
      this.p.push(p.getX(i),p.getY(i),p.getZ(i)); this.n.push(n.getX(i),n.getY(i),n.getZ(i));
      this.c.push(...(col || (c ? [c.getX(i),c.getY(i),c.getZ(i)] : [1,1,1])));
    }
  }
  geometry() {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(this.p,3));
    g.setAttribute('normal',new THREE.Float32BufferAttribute(this.n,3));
    g.setAttribute('color',new THREE.Float32BufferAttribute(this.c,3));
    g.computeBoundingBox(); g.computeBoundingSphere(); return g;
  }
}

function box(bucket, w,h,d,x,y,z,col,ry=0) {
  bucket.add(new THREE.BoxGeometry(w,h,d).rotateY(ry).translate(x,y,z),col);
}

function polygon(bucket,points,col,outward) {
  for(let i=1;i<points.length-1;i++)bucket.triangle(points[0],points[i],points[i+1],col,outward);
}

function shell(out, profile, burned, crashed, detail) {
  const half = profile.length / 2, arcSegments = detail ? 7 : 4;
  const shapeCuts=detail?profile.shape:profile.shape.filter((p,i)=>![3,5,8].includes(i));
  const cuts = [-half,half,half-.23,...shapeCuts.map(p=>p[0]),...profile.pillar];
  if(detail)cuts.push(...profile.side,...profile.front,...profile.rear);
  // Sample the actual cut edge instead of covering an intact body with a black circle.
  for (const axle of profile.axle) for (let i=0;i<=arcSegments;i++) cuts.push(axle-profile.arch*Math.cos(i/arcSegments*Math.PI));
  if (detail && profile.inspiration === 'Honda Fit') cuts.push(.65,.70);
  const zs = [...new Set(cuts.map(z=>+clamp(z,-half,half).toFixed(5)))].sort((a,b)=>a-b);
  const p=[],colors=[],indices={body:[],dark:[],glass:[],inner:[]},full=[];
  const warp = (x,y,z) => {
    // A bowed nose and tucked lower corners keep the bumper from ending in a vertical slab.
    if(z>half-.65) {
      const t=smooth(half-.65,half,z),corner=profile.inspiration==='Honda Fit'?.27:profile.inspiration==='Mazda CX-30'?.245:.22;
      z-=t*(corner*(x/(profile.width/2))**2+.105*((y-.62)/.55)**2);
    }
    if (crashed && z > half-.85) { const t=smooth(half-.85,half,z); z-=t*.28; y-=t*.11*smooth(.45,.90,y); x*=1-t*.04; }
    return [x,y,z];
  };
  const rings = zs.map(z => {
    const [w,belt,roof]=section(profile,z),rise=Math.max(.055,roof-belt),g=clamp(rise/.5),wr=mix(w-.17,profile.greenhouse,g),nose=smooth(half-.55,half,z);
    let sill = profile.inspiration === 'Mazda CX-30' ? .32 : .265;
    for (const axle of profile.axle) { const d=Math.abs(z-axle); if(d<profile.arch)sill=Math.max(sill,profile.radius+Math.sqrt(profile.arch*profile.arch-d*d)); }
    sill+=nose*.075;
    const q=[[w-.055-nose*.055,sill],[w-.021-nose*.025,mix(sill,belt-.07,.45)],[w-nose*.015,belt-.07],[w-.029-nose*.035,belt],
      [w-.091,belt+rise*.10],[wr,belt+rise*.84],[wr-.075,roof-rise*.075],[0,roof]];
    const halfRing=detail?q:[q[0],q[1],q[3],q[4],q[5],q[7]];
    return [...halfRing,...halfRing.slice(0,-1).reverse().map(([x,y])=>[-x,y])];
  });
  for(let i=0;i<zs.length;i++)for(const [x,y]of rings[i]) {
    p.push(...warp(x,y,zs[i]));
    const soot=.78+.16*Math.sin(x*5.2+zs[i]*3.4)*Math.sin(y*7.1-zs[i]*1.7),v=burned?soot*(y>.96?.50:.68):.96;
    colors.push(...(burned?[v*.88,v*.70,v*.55]:[v,v,v]));
  }
  const N=rings[0].length, M=(N+1)/2, id=(i,j)=>i*N+j;
  const inRange=(a,b,r)=>a>=r[0]-1e-5&&b<=r[1]+1e-5;
  const windowRange=(a,b,r)=>detail?inRange(a,b,r):(a+b)/2>=r[0]&&(a+b)/2<=r[1];
  for(let i=0;i<zs.length-1;i++)for(let j=0;j<N-1;j++) {
    const k=j<M-1?j:2*M-3-j,a=zs[i],b=zs[i+1],side=windowRange(a,b,profile.side)&&!inRange(a,b,profile.pillar)&&!(detail&&profile.inspiration==='Honda Fit'&&inRange(a,b,[.65,.70]));
    const sideK=detail?4:3,roofK=detail?5:4;
    const window=(k===sideK&&side)||(k>=roofK&&(windowRange(a,b,profile.front)||windowRange(a,b,profile.rear)));
    const q=[id(i,j),id(i,j+1),id(i+1,j+1),id(i,j),id(i+1,j+1),id(i+1,j)]; full.push(...q);
    if(window&&burned)continue;
    const key=window?'glass':(k===sideK&&inRange(a,b,profile.pillar))||(profile.inspiration==='Mazda CX-30'&&k===0)?'dark':'body'; indices[key].push(...q);
    // Only the open burned cabin needs inward-facing panels.
    if(burned&&detail&&!window&&k>=5&&a>profile.side[0]&&b<profile.side[1])indices.inner.push(q[0],q[2],q[1],q[3],q[5],q[4]);
  }
  for(const i of [0,zs.length-1]) {
    const q=rings[i],base=p.length/3;
    p.push(...warp(0,(q[0][1]+q[M-1][1])*.5,zs[i])); colors.push(...(burned?[.37,.28,.21]:[.96,.96,.96]));
    for(const point of q){p.push(...warp(...point,zs[i]));colors.push(...(burned?[.37,.28,.21]:[.96,.96,.96]));}
    for(let j=0;j<N;j++) {
      const a=base+1+j,b=base+1+(j+1)%N,q=i===0?[base,b,a]:[base,a,b];
      const key=i>0&&profile.inspiration==='Mazda CX-30'&&(j===0||j>=N-2)?'dark':'body';indices[key].push(...q);full.push(...q);
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(full);g.computeVertexNormals();
  for(const key of ['body','dark','glass'])if(indices[key].length) {
    const part=g.clone();part.setIndex(indices[key]);
    out[key].add(part,key==='glass'?[.035,.055,.064]:key==='dark'?[.085,.09,.095]:null,crashed);
  }
  if(indices.inner.length) {
    const part=g.clone();part.setIndex(indices.inner);const normal=part.attributes.normal;
    for(let i=0;i<normal.count;i++)normal.setXYZ(i,-normal.getX(i),-normal.getY(i),-normal.getZ(i));
    out.dark.add(part,[.105,.09,.075]);
  }
  const lipColor=burned?[.37,.29,.23]:profile.inspiration==='Mazda CX-30'?[.13,.14,.14]:[.86,.86,.86];
  for(const side of [-1,1])for(const axle of profile.axle)for(let i=0;i<arcSegments;i++) {
    const theta0=i/arcSegments*Math.PI,theta1=(i+1)/arcSegments*Math.PI;
    const edge=(theta,r,depth=0)=>{const z=axle-r*Math.cos(theta),w=section(profile,z)[0];return warp(side*(w-.046+depth),profile.radius+r*Math.sin(theta),z);};
    const lip=profile.inspiration==='Mazda CX-30'?.072:.018;
    (profile.inspiration==='Mazda CX-30'?out.dark:out.body).quad(edge(theta0,profile.arch),edge(theta1,profile.arch),edge(theta1,profile.arch+lip),edge(theta0,profile.arch+lip),lipColor,[side,0,0]);
    out.dark.quad(edge(theta0,profile.arch,-.13),edge(theta1,profile.arch,-.13),edge(theta1,profile.arch),edge(theta0,profile.arch),[.09,.095,.10],[0,-1,0]);
  }
  return warp;
}

function wheels(out, profile, burned, detail) {
  const segments=detail?16:8,r=profile.radius,cy=burned?r*.76:r,scaleY=burned?.76:1;
  for(const side of [-1,1])for(const z of profile.axle) {
    const center=side*(profile.width/2-.135),tire=detail?[[-.115,.75],[-.095,.92],[.05,1],[.115,.92],[.132,.75]]:[[-.105,.76],[.04,1],[.13,.76]];
    const point=(x,rad,t)=>[center+side*x,cy+Math.sin(t)*rad*scaleY,z+Math.cos(t)*rad];
    for(let j=0;j<tire.length-1;j++)for(let i=0;i<segments;i++) {
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      out.dark.quad(point(tire[j][0],tire[j][1]*r,a),point(tire[j][0],tire[j][1]*r,b),point(tire[j+1][0],tire[j+1][1]*r,b),point(tire[j+1][0],tire[j+1][1]*r,a),burned?[.15,.13,.115]:[.045,.047,.05],[0,Math.sin((a+b)/2),Math.cos((a+b)/2)]);
    }
    const rim=r*.73,x=.135,metal=burned?[.42,.36,.29]:[.67,.70,.72];
    for(let i=0;i<segments;i++) {
      const a=i/segments*Math.PI*2,b=(i+1)/segments*Math.PI*2;
      out.metal.quad(point(x,rim,a),point(x,rim,b),point(x,rim*.83,b),point(x,rim*.83,a),metal,[side,0,0]);
      out.dark.triangle(point(x-.014,0,0),point(x-.014,rim*.82,a),point(x-.014,rim*.82,b),[.04,.045,.05],[side,0,0]);
      if(detail)out.metal.quad(point(x-.01,rim,a),point(x-.01,rim,b),point(x-.08,rim,b),point(x-.08,rim,a),[.35,.38,.40],[0,-Math.sin((a+b)/2),-Math.cos((a+b)/2)]);
    }
    const spokes=detail?5:4;
    for(let i=0;i<spokes;i++) {
      const a=i/spokes*Math.PI*2+.18,b=a+(detail?.20:.34);
      if(detail)out.metal.quad(point(x+.002,rim*.2,a-.15),point(x+.002,rim*.90,a),point(x+.002,rim*.90,b),point(x+.002,rim*.2,b+.15),metal,[side,0,0]);
      else out.metal.triangle(point(x+.002,0,0),point(x+.002,rim*.90,a),point(x+.002,rim*.90,b),metal,[side,0,0]);
    }
    if(detail)for(let i=0;i<8;i++)out.metal.triangle(point(x+.004,0,0),point(x+.004,rim*.21,i/8*Math.PI*2),point(x+.004,rim*.21,(i+1)/8*Math.PI*2),[.52,.55,.57],[side,0,0]);
  }
}

function trim(out, profile, burned, crashed, detail, warp) {
  const half=profile.length/2,w=profile.width/2,nose=half,tail=-half,col=burned?[.25,.21,.18]:[.035,.045,.05],lens=burned?[.16,.12,.09]:[.82,.88,.91];
  box(out.dark,profile.width*.76,.075,profile.length*.78,0,.23,0,[.055,.06,.065]);
  const hatch=profile.inspiration==='Honda Fit',cross=profile.inspiration==='Mazda CX-30';
  const face=(bucket,points,color,offset=.025)=>polygon(bucket,points.map(([x,y])=>warp(x,y,nose+offset)),color,[0,0,1]);
  // Lamp silhouettes share the bowed bumper rather than lying as pale sheets on the bonnet.
  for(const side of [-1,1]) {
    const lamp=(bucket,points,color,offset)=>face(bucket,points.map(([x,y])=>[side*x,y]),color,offset);
    if(hatch) {
      const outline=detail?[[.32,.70],[.36,.855],[.65,.875],[.77,.845],[.79,.735],[.73,.67],[.43,.65],[.35,.67]]:[[.32,.70],[.36,.86],[.68,.87],[.79,.81],[.75,.67],[.42,.65]];
      lamp(out.dark,outline,col,.026);
      lamp(out.lights,outline.map(([x,y])=>[mix(.555,x,.80),mix(.765,y,.80)]),burned?lens:[.56,.65,.69],.031);
      if(detail&&!burned)for(const p of [[[.38,.82],[.40,.71],[.425,.71],[.405,.82]],[[.40,.71],[.69,.705],[.69,.728],[.40,.733]],[[.69,.705],[.74,.80],[.72,.81],[.67,.728]]])lamp(out.lights,p,lens,.034);
    } else if(cross) {
      const outline=[[.42,.855],[.78,.84],[.80,.765],[.44,.785]];
      lamp(out.dark,outline,col,.026);
      lamp(out.lights,[[.445,.835],[.77,.817],[.772,.793],[.446,.808]],lens,.033);
    } else {
      lamp(out.dark,[[.29,.766],[.77,.752],[.78,.696],[.30,.711]],col,.026);
      lamp(out.dark,[[.725,.739],[.79,.732],[.765,.632],[.715,.642]],col,.026);
      lamp(out.lights,[[.315,.751],[.758,.739],[.753,.717],[.315,.730]],lens,.033);
      if(!burned)lamp(out.lights,[[.748,.736],[.771,.732],[.750,.652],[.728,.655]],lens,.033);
    }
    const yr=section(profile,tail)[1]+.075;
    out.lights.quad([side*.30,yr-.06,tail-.009],[side*(w-.1),yr-.04,tail+.04],[side*(w-.1),yr+.025,tail+.12],[side*.30,yr+.012,tail-.009],burned?[.19,.075,.06]:[.63,.045,.035],[side*.15,0,-1]);
    if(detail) {
      const z=.65,mirrorWidth=Math.min(.12,.945-w),x=side*(w+mirrorWidth/2-.02);
      box(out.dark,.035,.035,.095,side*(w-.02),1.015,z,col,-side*.2);
      box(out.body,mirrorWidth,.072,.145,x,1.045,z,[.83,.83,.83],-side*.16);
      box(out.glass,.006,.045,.106,x+side*mirrorWidth/2,1.045,z-.012,[.18,.24,.25],-side*.16);
      for(const dz of [.28,-.80]) {
        const sw=section(profile,dz)[0]-.025;
        out.dark.quad([side*sw,.835,dz-.07],[side*sw,.835,dz+.07],[side*sw,.854,dz+.07],[side*sw,.854,dz-.07],col,[side,0,0]);
        out.metal.quad([side*(sw+.005),.849,dz-.052],[side*(sw+.005),.849,dz+.052],[side*(sw+.005),.864,dz+.052],[side*(sw+.005),.864,dz-.052],burned?[.36,.29,.24]:[.64,.67,.68],[side,0,0]);
      }
      // Thin seams follow the door skin without adding a separate extruded door.
      for(const dz of [-1.04,-.295,.91]) {
        const sw=section(profile,dz)[0],top=section(profile,dz)[1]-.045;
        if(Math.abs(dz-profile.axle[1])<profile.arch+.06||Math.abs(dz-profile.axle[0])<profile.arch+.06)continue;
        out.dark.quad([side*(sw-.023),.39,dz-.007],[side*(sw-.023),.39,dz+.007],[side*(sw-.005),top,dz+.007],[side*(sw-.005),top,dz-.007],col,[side,0,0]);
      }
    }
  }
  const chrome=burned?[.32,.27,.22]:[.57,.61,.63];
  let plateY;
  if(cross) {
    const shield=[[-.52,.845],[.52,.845],[.49,.63],[.30,.49],[0,.455],[-.30,.49],[-.49,.63]];
    face(out.dark,shield,col,.027);plateY=.58;
    for(const side of [-1,1]) {
      face(out.metal,[[side*.525,.845],[side*.50,.63],[side*.478,.642],[side*.501,.845]],chrome,.034);
      face(out.metal,[[side*.50,.63],[side*.30,.49],[side*.31,.515],[side*.478,.642]],chrome,.034);
      face(out.metal,[[side*.30,.49],[0,.455],[0,.48],[side*.31,.515]],chrome,.034);
    }
    if(detail)for(const y of [.64,.70,.76])face(out.metal,[[-.43,y],[.43,y],[.43,y+.008],[-.43,y+.008]],[.23,.26,.27],.032);
  } else if(hatch) {
    face(out.dark,[[-.32,.825],[.32,.825],[.30,.765],[-.30,.765]],col,.028);plateY=.57;
    face(out.dark,[[-.56,.62],[.56,.62],[.47,.425],[-.47,.425]],col,.028);
    if(detail)for(const side of [-1,1])face(out.dark,[[side*.65,.59],[side*.75,.57],[side*.69,.40],[side*.61,.41]],col,.027);
  } else {
    face(out.dark,[[-.31,.699],[.31,.699],[.32,.674],[-.32,.674]],col,.028);plateY=.45;
    face(out.dark,[[-.59,.555],[.59,.555],[.50,.365],[-.50,.365]],col,.028);
  }
  if(detail) {
    face(out.dark,[[-.17,plateY-.043],[.17,plateY-.043],[.17,plateY+.043],[-.17,plateY+.043]],[.13,.15,.16],.036);
    face(out.metal,[[-.15,plateY-.032],[.15,plateY-.032],[.15,plateY+.032],[-.15,plateY+.032]],burned?[.37,.31,.25]:[.83,.82,.74],.039);
  }
  if(profile.inspiration==='Toyota Prius')out.lights.quad([-.58,.88,tail-.016],[.58,.88,tail-.016],[.58,.907,tail-.016],[-.58,.907,tail-.016],burned?[.18,.07,.05]:[.59,.04,.03],[0,0,-1]);
  if(burned) {
    box(out.dark,1.30,.055,1.82,0,.53,-.20,[.095,.085,.075]);
    for(const x of [-.37,.37]) {
      box(out.metal,.40,.035,.38,x,.58,.15,[.32,.27,.22]);
      if(detail)box(out.metal,.40,.36,.025,x,.77,-.075,[.29,.25,.21]);
    }
  }
}

export function buildJapaneseCar(variant = 0, { burned = false, crashed = false, detail = true } = {}) {
  variant = ((Math.trunc(variant) || 0) % profiles.length + profiles.length) % profiles.length;
  burned=Boolean(burned); crashed=Boolean(crashed); detail=Boolean(detail);
  const key=`${variant}:${burned}:${crashed}:${detail}`; if(cache.has(key))return cache.get(key);
  const source=profiles[variant],out={body:new Bucket(),dark:new Bucket(),metal:new Bucket(),glass:new Bucket(),lights:new Bucket()};
  const warp=shell(out,source,burned,crashed,detail);wheels(out,source,burned,detail);trim(out,source,burned,crashed,detail,warp);
  const result={};for(const name of Object.keys(out))result[name]=name==='glass'&&burned?null:out[name].geometry();
  result.profile=Object.freeze({name:source.name,inspiration:source.inspiration,length:source.length,width:source.width,height:source.height,wheelbase:source.wheelbase,axles:Object.freeze([...source.axle]),wheelRadius:source.radius,archRadius:source.arch,forward:'+Z',detail,burned,crashed});
  cache.set(key,result);return result;
}
