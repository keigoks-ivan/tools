import * as THREE from './vendor/three.module.js';

// Original lamp artwork, fitted to the selected body's rear surface. Coordinates
// are metres, before the chassis suspension offset; none are image textures.
export const TAIL_LAMP_PROFILES = {
  bmwX3: {
    signature: 'g45-opposed-l-smoked-lens',
    units: [{
      outline: [[.265,1.052],[.30,1.110],[.62,1.119],[.755,1.171],[.918,1.165],[.933,1.037],[.78,1.024],[.625,1.062]],
      leds: [
        { points: [[.29,1.093],[.615,1.102],[.745,1.151],[.909,1.151]], width: .017 },
        { points: [[.295,1.065],[.615,1.079],[.756,1.043],[.916,1.055]], width: .017 },
        { points: [[.754,1.045],[.713,1.069],[.739,1.120],[.770,1.150]], width: .011 },
      ],
      reverse: [[.776,1.092],[.903,1.093],[.902,1.108],[.789,1.108]],
      facets: true,
    }],
  },
  porsche911gt3rs: {
    signature: '992-recessed-continuous-light-band', fullWidth: true, verticalOffset: -.025,
    units: [{
      outline: [[-.851,.728],[-.66,.757],[-.35,.774],[.35,.774],[.66,.757],[.851,.728],[.83,.695],[.60,.717],[.31,.731],[-.31,.731],[-.60,.717],[-.83,.695]],
      leds: [{ points: [[-.834,.722],[-.62,.741],[-.30,.753],[.30,.753],[.62,.741],[.834,.722]], width: .013 }],
      reverse: [[.60,.720],[.73,.708],[.73,.719],[.60,.731]],
    }],
  },
  porsche911turboS: {
    signature: '992-turbo-continuous-four-chamber-band', fullWidth: true, verticalOffset: -.035,
    units: [{
      outline: [[-.854,.736],[-.64,.763],[-.34,.778],[.34,.778],[.64,.763],[.854,.736],[.834,.699],[.60,.727],[.30,.740],[-.30,.740],[-.60,.727],[-.834,.699]],
      leds: [{ points: [[-.831,.731],[-.61,.754],[-.31,.762],[.31,.762],[.61,.754],[.831,.731]], width: .012 }],
    }],
  },
  astonVantage: {
    signature: 'vantage-contoured-smoked-ducktail-band', fullWidth: true, verticalOffset: -.06,
    units: [{
      outline: [[-.873,.707],[-.628,.748],[-.466,.785],[-.319,.823],[.319,.823],[.466,.785],[.628,.748],[.873,.707],[.835,.679],[.602,.714],[.444,.751],[.31,.791],[-.31,.791],[-.444,.751],[-.602,.714],[-.835,.679]],
      leds: [
        { points: [[-.845,.702],[-.62,.735],[-.462,.773],[-.328,.807]], width: .013 },
        { points: [[.328,.807],[.462,.773],[.62,.735],[.845,.702]], width: .013 },
      ],
    }],
  },
  corvetteZ06: {
    signature: 'c8-paired-arrow-reflector-chambers', verticalOffset: -.07,
    units: [{
      outline: [[.278,.725],[.31,.789],[.736,.823],[.861,.753],[.824,.675],[.343,.660]],
      leds: [
        { points: [[.315,.685],[.457,.704],[.497,.731],[.458,.779]], width: .024 },
        { points: [[.512,.714],[.731,.721],[.799,.760],[.755,.797]], width: .024 },
      ],
      reverse: [[.523,.756],[.711,.774],[.747,.795],[.539,.775]],
      reflectors: [
        [[.311,.742],[.420,.759],[.457,.780],[.326,.765]],
      ],
    }],
  },
  bmwM4: {
    signature: 'g82-lci-fine-laser-fibre-lens', verticalOffset: -.055,
    units: [{
      outline: [[.282,.831],[.637,.880],[.866,.840],[.852,.748],[.628,.742],[.353,.771]],
      leds: [
        { points: [[.31,.823],[.565,.852],[.76,.850],[.843,.826]], width: .006 },
        { points: [[.33,.807],[.580,.836],[.78,.833],[.848,.811]], width: .006 },
        { points: [[.36,.794],[.602,.820],[.788,.817],[.848,.795]], width: .006 },
        { points: [[.42,.777],[.634,.784],[.790,.777],[.844,.786]], width: .005 },
      ],
      reverse: [[.502,.773],[.733,.770],[.739,.786],[.502,.790]],
    }],
  },
  nissanZ: {
    signature: 'rz34-z32-capsule-black-fascia', fullWidth: true, verticalOffset: -.045,
    units: [{
      outline: [[-.87,.818],[.87,.818],[.878,.694],[-.878,.694]],
      leds: [
        { capsule: [-.625,.784,.295,.025], width: .006 },
        { capsule: [-.625,.747,.295,.025], width: .006 },
        { capsule: [.625,.784,.295,.025], width: .006 },
        { capsule: [.625,.747,.295,.025], width: .006 },
      ],
    }],
  },
  mustangDarkHorse: {
    signature: 's650-three-folded-lens-blocks', verticalOffset: -.115,
    units: [{
      outline: [[.30,.960],[.843,.933],[.870,.715],[.326,.699]],
      leds: [.386,.553,.720].map(x => ({
        fill: [[x,.928],[x+.068,.924],[x+.137,.833],[x+.068,.731],[x,.735],[x+.069,.833]], round: false,
      })),
      reverse: [[.330,.709],[.805,.721],[.803,.734],[.335,.722]],
    }],
  },
  amgGT63: {
    signature: 'c192-three-horizontal-red-chambers', verticalOffset: -.05,
    units: [{
      outline: [[.285,.822],[.430,.856],[.813,.866],[.864,.816],[.840,.772],[.414,.780]],
      leds: [
        { capsule: [.423,.813,.116,.035], solid: true },
        { capsule: [.589,.821,.137,.035], solid: true },
        { capsule: [.763,.826,.131,.035], solid: true },
      ],
      reverse: [[.394,.786],[.795,.794],[.806,.807],[.386,.798]],
    }],
  },
  amgSL63: {
    signature: 'r232-triangular-matrix-lens', verticalOffset: -.08,
    units: [{
      outline: [[.290,.842],[.580,.882],[.844,.882],[.858,.763],[.707,.762],[.478,.808]],
      leds: Array.from({ length: 24 }, (_,i) => {
        const col=i%8,row=Math.floor(i/8),x=.396+col*.055,y=.837+row*.011+col*.0018;
        return { fill: [[x,y],[x+.027,y+.001],[x+.032,y+.008],[x+.004,y+.008]], round: false };
      }),
      reverse: [[.595,.785],[.799,.785],[.800,.799],[.565,.803]],
    }],
  },
  lamborghiniTemerario: {
    signature: 'temerario-closed-flat-hexagonal-lens', verticalOffset: -.035,
    units: [{
      outline: [[.359,.767],[.402,.834],[.723,.836],[.824,.781],[.754,.704],[.431,.705]], round: false,
      leds: [{ ring: {
        outer: [[.389,.768],[.430,.811],[.709,.812],[.784,.776],[.734,.729],[.448,.729]],
        inner: [[.415,.768],[.442,.796],[.703,.797],[.758,.775],[.725,.744],[.455,.744]],
      }}],
    }],
  },
  ferrari296Speciale: {
    signature: '296-speciale-paired-horizontal-lens-cells', verticalOffset: -.04,
    units: [{
      outline: [[.338,.768],[.398,.839],[.795,.848],[.845,.802],[.794,.746],[.414,.746]],
      leds: [
        { capsule: [.493,.796,.168,.039], width: .010 },
        { capsule: [.714,.799,.181,.042], width: .010 },
      ],
      reverse: [[.535,.761],[.769,.765],[.777,.777],[.535,.775]],
    }],
  },
  lamborghiniRevuelto: {
    signature: 'revuelto-three-branch-y-in-recessed-blade', verticalOffset: -.085,
    units: [{
      outline: [[.286,.742],[.287,.837],[.638,.850],[.861,.916],[.864,.652],[.610,.697]], round: false,
      leds: [
        { points: [[.314,.791],[.590,.798],[.843,.895]], width: .019 },
        { points: [[.592,.798],[.825,.685]], width: .019 },
      ],
    }],
  },
  mclaren750s: {
    signature: '750s-short-arched-led-in-black-rear-aperture', verticalOffset: -.035,
    units: [{
      outline: [[.299,.733],[.350,.862],[.609,.876],[.837,.806],[.819,.724],[.638,.747],[.430,.756]],
      leds: [{ points: [[.350,.784],[.456,.798],[.623,.796],[.796,.771]], width: .012 }],
    }],
  },
  ferrari12cilindri: {
    signature: '12cilindri-four-separate-blades-black-tail-panel', fullWidth: true, verticalOffset: -.055,
    units: [{
      outline: [[-.860,.819],[-.634,.837],[-.30,.830],[.30,.830],[.634,.837],[.860,.819],[.842,.740],[.61,.759],[.28,.772],[-.28,.772],[-.61,.759],[-.842,.740]],
      leds: [-1,1].flatMap(side => [
        { points: [[side*.330,.803],[side*.503,.813]], width: .007 },
        { points: [[side*.527,.812],[side*.810,.798]], width: .007 },
      ]),
    }],
  },
  mazdaMX5: {
    signature: 'nd3-round-lens-with-outboard-teardrop', verticalOffset: -.07,
    units: [{
      outline: [[.470,.746],[.478,.794],[.531,.821],[.583,.801],[.716,.788],[.806,.751],[.708,.713],[.579,.701],[.529,.680],[.483,.702]],
      leds: [
        { capsule: [.538,.751,.106,.106], width: .014, circular: true },
        { points: [[.591,.785],[.701,.778],[.779,.751],[.696,.727],[.595,.720]], width: .012 },
      ],
      reverse: [[.611,.751],[.699,.761],[.741,.750],[.699,.740],[.611,.740]],
    }],
  },
  lotusEmira: {
    signature: 'emira-open-capsule-in-wide-smoked-eye', verticalOffset: -.035,
    units: [{
      outline: [[.290,.818],[.558,.826],[.782,.801],[.862,.751],[.757,.675],[.478,.684],[.323,.722]],
      leds: [{ points: [[.334,.800],[.552,.801],[.732,.778],[.794,.747],[.748,.714],[.555,.707],[.451,.724]], width: .014 }],
      reverse: [[.441,.745],[.678,.747],[.694,.758],[.458,.757]],
    }],
  },
  hondaPrelude: {
    signature: 'prelude-continuous-red-lens-over-black-panel', fullWidth: true, verticalOffset: -.04,
    units: [{
      outline: [[-.856,.858],[-.653,.885],[.653,.885],[.856,.858],[.842,.749],[.626,.758],[-.626,.758],[-.842,.749]],
      leds: [{ points: [[-.833,.844],[-.637,.866],[0,.870],[.637,.866],[.833,.844]], width: .023 }],
      reflectors: [
        [[-.783,.771],[-.425,.782],[-.425,.800],[-.783,.790]],
        [[.425,.782],[.783,.771],[.783,.790],[.425,.800]],
      ],
    }],
  },
  toyotaGR86: {
    signature: 'gr86-broad-c-red-lens-clear-inner-chamber', verticalOffset: -.035, bridge: {width:.66,y:.800,height:.012},
    units: [{
      outline: [[.301,.806],[.814,.817],[.866,.759],[.829,.663],[.376,.663]],
      leds: [{ points: [[.356,.790],[.758,.790],[.815,.763],[.796,.708],[.708,.688],[.409,.685]], width: .032 }],
      reverse: [[.419,.746],[.710,.756],[.748,.744],[.711,.719],[.443,.718]],
    }],
  },
  bmwM2: {
    signature: 'g87-high-shoulder-hook-sculpted-lens', verticalOffset: -.08,
    units: [{
      outline: [[.277,.849],[.477,.896],[.723,.947],[.863,.866],[.846,.746],[.698,.735],[.483,.786]], round: false,
      leds: [{ points: [[.319,.829],[.505,.857],[.710,.908],[.818,.856],[.808,.780]], width: .030 }],
      reverse: [[.404,.802],[.612,.797],[.755,.781],[.790,.792],[.614,.816],[.403,.816]],
      reflectors: [[[.727,.817],[.738,.865],[.786,.842],[.790,.809]]],
    }],
  },
};

function capsuleShape(x,y,width,height) {
  const r = height/2, shape = new THREE.Shape();
  shape.moveTo(x-width/2+r,y+r); shape.lineTo(x+width/2-r,y+r);
  shape.absarc(x+width/2-r,y,r,Math.PI/2,-Math.PI/2,true);
  shape.lineTo(x-width/2+r,y-r); shape.absarc(x-width/2+r,y,r,-Math.PI/2,Math.PI/2,true);
  shape.closePath(); return shape;
}

function outlineShape(points, round = true) {
  const shape = new THREE.Shape();
  if (!round) {
    shape.moveTo(...points[0]); points.slice(1).forEach(p => shape.lineTo(...p));
  } else {
    const corners=points.map((a,i) => {
      const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
      const beforeRatio=Math.min(.18,.012/Math.hypot(before[0]-a[0],before[1]-a[1]));
      const afterRatio=Math.min(.18,.012/Math.hypot(after[0]-a[0],after[1]-a[1]));
      return {a,start:[a[0]+(before[0]-a[0])*beforeRatio,a[1]+(before[1]-a[1])*beforeRatio],end:[a[0]+(after[0]-a[0])*afterRatio,a[1]+(after[1]-a[1])*afterRatio]};
    });
    shape.moveTo(...corners[0].start);
    for (let i = 0; i < points.length; i++) {
      const {a,end}=corners[i];
      shape.quadraticCurveTo(a[0],a[1],...end);shape.lineTo(...corners[(i+1)%points.length].start);
    }
  }
  shape.closePath(); return shape;
}

function ledOutline(points, width) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x,y]) => new THREE.Vector3(x,y,0)), false, 'centripetal');
  const samples = Math.max(8, points.length * 4), left = [], right = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples, point = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    const nx = -tangent.y * width / 2, ny = tangent.x * width / 2;
    left.push([point.x + nx, point.y + ny]); right.push([point.x - nx, point.y - ny]);
  }
  return [...left, ...right.reverse()];
}

export function addVehicleTailLights({ vehicle, mobile = false, halfWidth, baseY, chassis, mesh, material, rearLight, black, fasciaPoint }) {
  const profile = TAIL_LAMP_PROFILES[vehicle];
  if (!profile) return { vehicle, lights: 0, samples: 0 };
  const lens = material('rear-smoked-lens', THREE.MeshPhysicalMaterial, {
    color: '#40131b', metalness: 0, roughness: .16, clearcoat: 1,
    clearcoatRoughness: .055, ior: 1.49, envMapIntensity: .8,
  });
  const clear = material('rear-reverse-reflector', THREE.MeshPhysicalMaterial, {
    color: '#b9b9b3', metalness: .12, roughness: .28, clearcoat: .9,
  });
  const widthScale = halfWidth / .96;
  let lights = 0, samples = 0;
  for (const unit of profile.units) for (const side of profile.fullWidth ? [1] : [-1,1]) {
    const verticalOffset=profile.verticalOffset || 0;
    const map = points => points.map(([x,y]) => [side * x * widthScale,y+verticalOffset]);
    const outline = map(unit.outline);
    const xMin = Math.min(...outline.map(p => p[0])), xMax = Math.max(...outline.map(p => p[0]));
    const yMin = Math.min(...outline.map(p => p[1])), yMax = Math.max(...outline.map(p => p[1]));
    const nx = profile.fullWidth ? 25 : 13, ny = 3, grid = [];
    // One small fit grid is shared by the shell, lens, internal guides and facets.
    // Rear-surface raycasts stay bounded even when a lens has many vertices.
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const x = THREE.MathUtils.lerp(xMin,xMax,i/(nx-1)), y = THREE.MathUtils.lerp(yMin,yMax,j/(ny-1));
      const fitted = fasciaPoint(x,y,0);
      grid.push(Array.isArray(fitted) ? fitted[2] : fitted.z); samples++;
    }
    function point(x,y,offset) {
      const u = THREE.MathUtils.clamp((x-xMin)/(xMax-xMin),0,1)*(nx-1);
      const v = THREE.MathUtils.clamp((y-yMin)/(yMax-yMin),0,1)*(ny-1);
      const i = Math.min(nx-2,Math.floor(u)), j = Math.min(ny-2,Math.floor(v));
      const z0 = THREE.MathUtils.lerp(grid[j*nx+i],grid[j*nx+i+1],u-i);
      const z1 = THREE.MathUtils.lerp(grid[(j+1)*nx+i],grid[(j+1)*nx+i+1],u-i);
      return [x,y-baseY,THREE.MathUtils.lerp(z0,z1,v-j)-offset];
    }
    function solid(points, mat, offset, thickness, name, rounded = true) {
      const shape = points instanceof THREE.Shape ? points : outlineShape(points,rounded), flat = new THREE.ShapeGeometry(shape,mobile ? 3 : 5);
      const flatPosition = flat.attributes.position, vertices = [];
      for (let i=0;i<flatPosition.count;i++) vertices.push([flatPosition.getX(i),flatPosition.getY(i)]);
      let faces=Array.from(flat.index.array);
      // Wide triangles cut through a convex bumper even when their corners fit.
      // Split their longest edges before mapping the shallow lens to its surface.
      const edgeLimit=mobile ? .085 : .065;
      for (let pass=0;pass<7;pass++) {
        const next=[],midpoints=new Map(); let split=false;
        for (let i=0;i<faces.length;i+=3) {
          const triangle=faces.slice(i,i+3), lengths=triangle.map((a,j) => {
            const b=triangle[(j+1)%3]; return Math.hypot(vertices[a][0]-vertices[b][0],vertices[a][1]-vertices[b][1]);
          });
          const edge=lengths.indexOf(Math.max(...lengths));
          if (lengths[edge]<=edgeLimit) { next.push(...triangle); continue; }
          const a=triangle[edge],b=triangle[(edge+1)%3],c=triangle[(edge+2)%3],key=`${Math.min(a,b)}:${Math.max(a,b)}`;
          if (!midpoints.has(key)) {
            midpoints.set(key,vertices.length);vertices.push([(vertices[a][0]+vertices[b][0])/2,(vertices[a][1]+vertices[b][1])/2]);
          }
          const midpoint=midpoints.get(key);next.push(a,midpoint,c,midpoint,b,c);split=true;
        }
        faces=next;if(!split)break;
      }
      const count = vertices.length, positions = [], indices = [];
      for (let face = 0; face < 2; face++) for (let i = 0; i < count; i++) {
        positions.push(...point(vertices[i][0],vertices[i][1],offset-face*thickness));
      }
      for (let i = 0; i < faces.length; i += 3) {
        const [a,b,c]=faces.slice(i,i+3);
        indices.push(a,c,b,a+count,b+count,c+count);
      }
      for (const path of [shape,...shape.holes]) {
        const contour = path.getPoints(mobile ? 3 : 5);
        for (let i = 0; i < contour.length-1; i++) {
          const a=contour[i],b=contour[i+1],segments=Math.max(1,Math.ceil(a.distanceTo(b)/edgeLimit));
          for (let segment=0;segment<segments;segment++) {
            const start=a.clone().lerp(b,segment/segments),end=a.clone().lerp(b,(segment+1)/segments),k=positions.length/3;
            positions.push(...point(start.x,start.y,offset),...point(end.x,end.y,offset),...point(start.x,start.y,offset-thickness),...point(end.x,end.y,offset-thickness));
            indices.push(k,k+1,k+2,k+1,k+3,k+2);
          }
        }
      }
      flat.dispose(); const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3)); geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere();
      const object = mesh(geometry,mat,chassis,`${vehicle}-${name}`);
      object.userData.tailLamp = { vehicle, signature: profile.signature, component: name };
      return object;
    }
    const roundHousing=unit.round !== false&&!profile.fullWidth;
    solid(outline,black,.010,.010,'recessed-tail-lamp-housing',roundHousing);
    const cx = (xMin+xMax)/2,cy=(yMin+yMax)/2;
    solid(outline.map(([x,y]) => [cx+(x-cx)*.965,cy+(y-cy)*.87]),lens,.015,.006,'sculpted-smoked-tail-lens',roundHousing);
    for (const led of unit.leds) {
      if (led.capsule) {
        const [x,rawY,w,h] = led.capsule, y=rawY+verticalOffset,scaledWidth=w*widthScale, scaledHeight=led.circular ? h*widthScale : h;
        const shape = capsuleShape(side*x*widthScale,y,scaledWidth,scaledHeight);
        if (!led.solid) shape.holes.push(capsuleShape(side*x*widthScale,y,scaledWidth-led.width*2,scaledHeight-led.width*2));
        solid(shape,rearLight,.021,.003,led.solid ? 'filled-capsule-led-chamber' : 'closed-capsule-led-chamber');
      } else if (led.ring) {
        const shape=outlineShape(map(led.ring.outer),false);
        shape.holes.push(outlineShape(map(led.ring.inner),false));
        solid(shape,rearLight,.021,.003,'angular-ring-led-chamber');
      } else if (led.fill) {
        solid(map(led.fill),rearLight,.021,.003,'individual-led-lens-cell',led.round !== false);
      } else solid(ledOutline(map(led.points),led.width),rearLight,.021,.003,'flat-internal-led-guide',false);
    }
    if (unit.reverse) solid(map(unit.reverse),clear,.019,.003,'reverse-reflector-chamber');
    for (const reflector of unit.reflectors || []) solid(map(reflector),clear,.019,.003,'separate-clear-reflector-chamber');
    if (unit.facets) for (let i=0;i<6;i++) {
      const x = THREE.MathUtils.lerp(.805,.898,i/5);
      solid(map([[x,1.078],[x+.006,1.079],[x+.006,1.126],[x,1.126]]),lens,.018,.002,'molded-lens-prism',false);
    }
    lights++;
  }
  if(profile.bridge){
    const {width,y,height}=profile.bridge,positions=[],indices=[];
    for(const x of [-width/2,0,width/2])for(const delta of [-height/2,height/2]){
      const xx=x*widthScale,yy=y+(profile.verticalOffset||0)+delta,fitted=fasciaPoint(xx,yy,.016);samples++;
      positions.push(xx,yy-baseY,Array.isArray(fitted)?fitted[2]:fitted.z);
    }
    for(let i=0;i<2;i++){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    const object=mesh(geometry,black,chassis,`${vehicle}-fitted-dark-tail-bridge`);
    object.userData.tailLamp={vehicle,signature:profile.signature,component:'non-emitting-dark-tail-bridge'};
  }
  return { vehicle, lights, samples };
}
