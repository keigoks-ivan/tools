import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { indexGeometry } from './index-geometry.js?v=20261002c';

// New sets use the director's exact height field; scenery stays outside combat
// bounds. Static pieces merge by material, with one bounded weather draw.
export function createChapterWorld(T, scene, world) {
  const sets = new Map();
  const originals = [];
  world.group.traverse(mesh => {
    if (/^march-(stone|props|cutout|glow)-\d$|^march-sky$/.test(mesh.name)) originals.push(mesh);
  });
  let active = null;
  function build(kind) {
    if (kind === 'ember' || kind === 'rift') return buildSet(kind);
    const frost = kind === 'frost', group = new T.Group(), batches = new Map(), owned = new Set();
    group.name = `chapter-${kind}`; scene.add(group);
    const surface = world.group.getObjectByName('march-stone-0')?.material.uniforms || {};
    const stoneMap = surface.stoneColour?.value || surface.map?.value || null;
    const normalMap = surface.stoneSurface?.value || null;
    const woodMap = surface.woodGrain?.value || null;
    const propsMap = world.group.getObjectByName('march-props-0')?.material.map || null;
    const material = (color, extra = {}) => { const m = new T.MeshStandardMaterial({ color, roughness: 0.82, ...extra }); owned.add(m); return m; };
    const stone = material(frost ? 0xc2d5df : 0xd5cbbb, { map: stoneMap, normalMap, normalScale: new T.Vector2(0.65,0.65), roughnessMap: normalMap, roughness: 1 });
    const dark = material(frost ? 0x243a46 : 0x302636);
    const metal = material(frost ? 0x95b7c7 : 0xc7a060, { metalness: 0.65, roughness: 0.38 });
    const roof = material(frost ? 0x638498 : 0x8e99ad, { map: propsMap, roughness: 0.8 });
    const snow = material(0xd3e1e8, { roughness: 0.94 });
    const red = material(frost ? 0x4a3c41 : 0x8e3329, { map: propsMap, bumpMap: woodMap, bumpScale: 0.035, roughness: 0.76 });
    const wood = material(frost ? 0x8493a0 : 0xe2c6a0, { map: woodMap || propsMap, bumpMap: woodMap, bumpScale: 0.045, roughness: 0.88 });
    const lattice = material(frost ? 0x577589 : 0xb69b77, { map: propsMap });
    const light = material(frost ? 0x9ceaff : 0xffc273, { emissive: frost ? 0x54bddc : 0xff762c, emissiveIntensity: 1.2 });
    function put(geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
      geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)));
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(geometry.index ? geometry.toNonIndexed() : geometry); geometry.dispose();
    }
    const box = (mat, x, y, z, sx, sy, sz, ry = 0) => put(new T.BoxGeometry(1, 1, 1), mat, x, y, z, sx, sy, sz, 0, ry);
    const pole = (mat, x, y, z, radius, height) => put(new T.CylinderGeometry(radius, radius * 1.1, height, 8), mat, x, y, z);
    // Grid vertices agree with the collision surface, including the terraces.
    const p = [], uv = [], ix = [], nx = 64, nz = 136;
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) { const wx = x - 32, wz = 20 - z; p.push(wx, world.heightAt(wx, wz) + 0.01, wz); uv.push(wx / 4, -wz / 4); if (x < nx && z < nz) { const n = z * (nx + 1) + x; ix.push(n, n + 1, n + nx + 1, n + 1, n + nx + 2, n + nx + 1); } }
    const floor = new T.BufferGeometry(); floor.setAttribute('position', new T.Float32BufferAttribute(p, 3)); floor.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); floor.setIndex(ix); floor.computeVertexNormals();
    // The normal map's alpha packs roughness; its RGB remains linear normal data.
    stone.onBeforeCompile = shader => {
      if (!surface.stoneColour) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\ndiffuseColor *= texture2D(map, vec2(0.004,0.504)+fract(vMapUv)*0.492);\n#endif');
      if (normalMap) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\nroughnessFactor *= texture2D(roughnessMap,vRoughnessMapUv).a;\n#endif');
      if (frost) shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb,vec3(dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722))),0.7);');
    };
    stone.customProgramCacheKey = () => `chapter-stone-bg8-${frost}-${!!normalMap}-${!!surface.stoneColour}`;
    const floorColors = [];
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2], width = z > -31 ? 10.6 : z > -53 ? 16.2 : z > -85 ? 15.4 : 11.2;
      const dz = ((8 - z) % 8 + 8) % 8, nearLamp = Math.exp(-(Math.pow(Math.abs(x) - (width - 0.5), 2) + Math.pow(Math.min(dz,8-dz),2)) / 10);
      const pool = nearLamp * 0.8;
      // Bake contact and colonnade shade into the existing floor vertices, once.
      const lampContact = Math.exp(-(Math.pow(Math.abs(x)-(width-0.5),2)*2.5+Math.pow(Math.min(dz,8-dz),2)*2.5));
      let occlusion = (1-lampContact*0.48)*(1-0.2*Math.exp(-Math.pow(Math.abs(x)-width,2)/1.8));
      for (const [az,aw] of [[-24,8.4],[-48,14.5],[-82,13],[-105,6]]) occlusion *= 1-0.42*Math.exp(-(Math.pow(Math.abs(x)-aw,2)+Math.pow(z-az,2))/1.6);
      if (!frost) occlusion *= 1-0.24*Math.exp(-Math.pow(Math.abs(x)-(width+3),2)/9);
      floorColors.push((0.65 + pool * (frost ? 0.35 : 0.8))*occlusion, (0.7 + pool * (frost ? 0.65 : 0.46))*occlusion, (0.8 + pool * (frost ? 0.8 : 0.2))*occlusion);
    }
    floor.setAttribute('color', new T.Float32BufferAttribute(floorColors,3)); stone.vertexColors = true;
    put(floor, stone, 0, 0, 0);
    function lantern(x, z) {
      const y = world.heightAt(x, z);
      put(new T.CylinderGeometry(0.43,0.57,0.5,8),dark,x,y+0.25,z); pole(metal, x, y + 1.25, z, 0.11, 1.5);
      box(light, x, y + 2.25, z, 0.38, 0.65, 0.38);
      for (const dx of [-0.23, 0.23]) for (const dz of [-0.23, 0.23]) pole(dark, x + dx, y + 2.25, z + dz, 0.035, 0.8);
      put(new T.ConeGeometry(0.58, 0.3, 4), roof, x, y + 2.75, z, 1, 1, 1, 0, Math.PI / 4);
    }
    // All sets share the base world's maps, without allocating textures per chapter.
    function atlas(mat, rect) {
      mat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
diffuseColor *= texture2D(map, vec2(${rect[0]},${rect[1]})+fract(vMapUv)*vec2(${rect[2]},${rect[3]}));
#endif`); };
      mat.customProgramCacheKey = () => `chapter-atlas-${rect.join('-')}`;
    }
    atlas(roof, [0.501, 0.626, 0.248, 0.123]);
    atlas(red, [0.876, 0.626, 0.123, 0.123]);
    if (!woodMap) atlas(wood, [0.751, 0.626, 0.123, 0.123]);
    red.onBeforeCompile = shader => {
      shader.uniforms.woodGrain = { value: woodMap || propsMap };
      shader.fragmentShader = 'uniform sampler2D woodGrain;\n'+shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
        vec3 grain = texture2D(woodGrain,vMapUv).rgb;
        diffuseColor.rgb *= vec3(0.72)+grain*1.5;
        #endif`);
    };
    red.customProgramCacheKey = () => 'chapter-lacquer-grain-bg8';
    atlas(lattice, [0.751, 0.751, 0.248, 0.123]);
    function tileRoof(x, y, z, width, depth, rise) {
      const nx = 8, nz = 6, p = [], uv = [], ids = [], curl = Math.min(0.7, width * 0.065);
      const at = (u, v) => [u * width / 2 * (1 + 0.08 * Math.abs(v)), rise * Math.pow(1 - Math.abs(v), 1.5) + curl * Math.pow(Math.abs(u), 4) * Math.pow(Math.abs(v), 3), v * depth / 2];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const u = i / nx * 2 - 1, v = j / nz * 2 - 1;
        p.push(...at(u, v)); uv.push(i / nx * width / 2.4, j / nz * depth / 2.4);
        if (i < nx && j < nz) { const k = j * (nx + 1) + i; ids.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2); }
      }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(p, 3)); geometry.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); geometry.setIndex(ids); geometry.computeVertexNormals();
      const soffit = geometry.clone(); soffit.translate(0, -0.16, 0);
      for (let i = 0; i < soffit.index.count; i += 3) { const k = soffit.index.getX(i); soffit.index.setX(i, soffit.index.getX(i + 1)); soffit.index.setX(i + 1, k); }
      soffit.computeVertexNormals(); put(soffit, wood, x, y, z); put(geometry, roof, x, y, z);
      // A curved edge replaces rows of square rafters and the dense tube trim.
      for (const side of [-1, 1]) {
        const cross = [];
        for (let i = 0; i <= 12; i++) { const p = at(i / 6 - 1, side); cross.push(new T.Vector3(p[0], p[1], p[2])); }
        put(new T.TubeGeometry(new T.CatmullRomCurve3(cross), 12, 0.065, 4, false), metal, x, y, z);
      }
      box(roof, x, y + rise, z, width + 0.15, 0.14, 0.24);
    }
    function hangingCloth(x, y, z, width, length) {
      const p = [], uv = [], ids = [];
      for (let j = 0; j <= 6; j++) for (let i = 0; i <= 4; i++) {
        const u = i / 4, v = j / 6;
        p.push((u - 0.5) * width, -v * length + 0.1 * Math.cos(u * Math.PI * 4) * v * v, Math.sin(u * Math.PI * 4 + v * 2) * 0.11 * v);
        uv.push(u, v);
        if (i < 4 && j < 6) { const k = j * 5 + i; ids.push(k,k+1,k+5,k+1,k+6,k+5); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position',new T.Float32BufferAttribute(p,3)); g.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); g.setIndex(ids); g.computeVertexNormals();
      const back=g.clone(); for(let i=0;i<back.index.count;i+=3){const k=back.index.getX(i);back.index.setX(i,back.index.getX(i+1));back.index.setX(i+1,k);} back.computeVertexNormals();
      put(g,red,x,y,z); put(back,red,x,y,z);
    }
    function arch(z, width, height) {
      const y = world.heightAt(0, z);
      for (const side of [-1, 1]) {
        pole(red, side * width, y + height / 2, z, 0.32, height);
        pole(metal, side * width, y + 0.7, z, 0.37, 0.2);
        pole(metal, side * width, y + height - 0.9, z, 0.36, 0.17);
        put(new T.CylinderGeometry(0.43,0.57,0.38,8),dark,side*width,y+0.19,z);
        pole(metal,side*width,y+height-0.3,z,0.48,0.16);
      }
      box(red, 0, y + height - 0.7, z, width * 2 + 1, 0.34, 0.6);
      tileRoof(0, y + height, z, width * 2 + 2, 2.8, 0.85);
      box(metal, 0, y + height - 0.42, z + 0.34, width * 1.5, 0.06, 0.05);
      box(wood, 0, y + height - 0.15, z, width * 2 + 0.6, 0.18, 0.7);
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) box(red, side * (width - 0.5 - i * 0.34), y + height - 0.95 - i * 0.16, z, 0.55, 0.19, 0.7);
    }
    for (let z = 8; z >= -102; z -= 8) for (const side of [-1, 1]) {
      const width = z > -31 ? 10.6 : z > -53 ? 16.2 : z > -85 ? 15.4 : 11.2;
      const x = side * width, y = world.heightAt(x, z);
      lantern(side * (width - 0.5), z);
      box(dark, x, y + 0.38, z - 3.8, 0.45, 0.75, 7.6);
      box(wood, x, y + 0.83, z - 3.8, 0.32, 0.16, 7.6);
      for (let i = 0; i < 5; i++) pole(metal, x, y + 1.15, z - 0.7 - i * 1.45, 0.05, 0.7);
      box(metal, x, y + 1.5, z - 3.8, 0.55, 0.09, 7.6);
      if (frost) {
        put(new T.SphereGeometry(1, 12, 6), snow, x, y + 1.6, z - 3.8, 0.45, 0.18, 3.9);
        put(new T.IcosahedronGeometry(1, 1), snow, side * (width + 2.5), y + 0.4, z, 2.2, 0.75, 3);
        for (let i = 0; i < 3; i++) put(new T.ConeGeometry(0.5 + i * 0.16, 3 + i, 5), metal, side * (width + 2 + i * 1.3), y + 1.5 + i * 0.5, z - i, 1, 1, 1, side * 0.18, i);
      } else {
        pole(red, side * (width + 1.1), y + 4.8, z, 0.38, 9.6);
        box(metal, side * (width + 1.1), y + 3.5, z, 0.82, 0.12, 0.82);
        tileRoof(side * (width + 4.2), y + 9.6, z - 3, 8.8, 9, 1.8);
        box(wood, side * (width + 1.1), y + 8.95, z - 3, 0.5, 0.6, 8);
        box(lattice, side * (width + 6.8), y + 3.4, z - 3, 0.18, 4.8, 7.5);
        for (const dz of [-6, -3, 0]) pole(red, side * (width + 6.8), y + 4.8, z + dz, 0.18, 9.6);
        put(new T.CylinderGeometry(0.47,0.62,0.5,8),dark,side*(width+1.1),y+0.25,z);
        pole(metal,side*(width+1.1),y+0.55,z,0.46,0.08);
        hangingCloth(side * (width + 1.1), y + 10.5, z + 0.5, 1.3, 3.1);
        box(metal, side * (width + 1.1), y + 7.4, z + 0.53, 0.075, 2.8, 0.04);
      }
    }
    for (const [z, w, h] of [[-24, 8.4, 6.5], [-48, 14.5, 7.5], [-82, 13, 8], [-105, 6, 12]]) arch(z, w, h);
    for (const z of [-12, -41, -70, -96]) {
      const y = world.heightAt(0, z);
      for (const radius of [2.2, 2.6, 3.4]) put(new T.TorusGeometry(radius, 0.025, 4, 48), metal, 0, y + 0.035, z, 1, 1, 1, Math.PI / 2);
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; box(light, Math.cos(a) * 3, y + 0.04, z + Math.sin(a) * 3, 0.08, 0.025, 0.35, -a); }
    }
    if (frost) {
      const mountainMat = material(0xffffff, { vertexColors: true, roughness: 1 });
      if (woodMap) {
        // Reuse a neutral grain sample as subtle horizontal rock strata, below the snow tint.
        mountainMat.onBeforeCompile = shader => {
          shader.uniforms.rockGrain = { value: woodMap };
          shader.vertexShader = 'varying vec3 vRockPosition;\n'+shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPosition=position;');
          shader.fragmentShader = 'uniform sampler2D rockGrain; varying vec3 vRockPosition;\n'+shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat strata=dot(texture2D(rockGrain,vec2(vRockPosition.y*0.35,(vRockPosition.x+vRockPosition.z)*0.08)).rgb,vec3(0.2126,0.7152,0.0722));\ndiffuseColor.rgb*=0.82+strata*2.4;');
        };
        mountainMat.customProgramCacheKey = () => 'chapter-rock-strata-bg8';
      }
      const rockColor = new T.Color(0x455969), snowColor = new T.Color(0xd2e4ec);
      for (let i = 0; i < 16; i++) for (const side of [-1,1]) {
        const z=15-i*9, x=side*(34+i%3*5), height=14+i%4*3, p=[], uv=[], ids=[], colors=[];
        // An indexed terrain patch gives irregular ridgelines instead of cone silhouettes.
        for(let j=0;j<=10;j++) for(let k=0;k<=11;k++) {
          const u=k/5.5-1,v=j/5-1,edge=Math.max(0,1-u*u)*Math.max(0,1-v*v);
          const peak=Math.max(Math.exp(-((u+0.16*Math.sin(i))* (u+0.16*Math.sin(i))*3.5+(v+0.15)*(v+0.15)*4)),0.78*Math.exp(-((u-0.4)*(u-0.4)*9+(v-0.25)*(v-0.25)*8)));
          const rough=1+0.1*Math.sin(u*7+i)*Math.cos(v*6-i)+0.05*Math.sin(u*5+v*4+i);
          p.push(u*14,height*Math.pow(edge,0.65)*peak*rough,v*12); uv.push(k/11,j/10);
          if(k<11&&j<10){const n=j*12+k;ids.push(n,n+12,n+1,n+1,n+12,n+13);}
        }
        const mountain=new T.BufferGeometry(); mountain.setAttribute('position',new T.Float32BufferAttribute(p,3)); mountain.setAttribute('uv',new T.Float32BufferAttribute(uv,2)); mountain.setIndex(ids); mountain.computeVertexNormals();
        const normal=mountain.attributes.normal;
        for(let k=0;k<p.length/3;k++){const snowLine=0.3+0.06*Math.sin(p[k*3]*0.4+i);const snow=Math.max(0,Math.min(1,(p[k*3+1]/height-snowLine)/0.32))*Math.max(0,Math.min(1,normal.getY(k)*1.4));const color=rockColor.clone().lerp(snowColor,snow);colors.push(color.r,color.g,color.b);}
        mountain.setAttribute('color',new T.Float32BufferAttribute(colors,3));put(mountain,mountainMat,x,-4,z,1,1,1,0,i*0.8);
      }
    }
    else for (const side of [-1, 1]) for (let tier = 0; tier < 5; tier++) {
      const x = side * 21, y = 5 + tier * 3, w = 11 - tier * 1.4;
      box(lattice, x, y, -105, w - 1, 2.7, w - 1); tileRoof(x, y + 1.5, -105, w + 1, w + 1, 1.0); box(metal, x, y + 1.15, -99.5 - tier * 0.7, w, 0.07, 0.06);
    }
    if (!frost) {
      const leaves = material(0xeac18f, { map: propsMap, side: T.DoubleSide, alphaTest: 0.5 });
      atlas(leaves,[0.688,0.251,0.123,0.123]);
      for (const side of [-1,1]) for (const [x,z] of [[19.5,-16],[25,-38],[25,-48],[22,-74],[16,-94]]) {
        const y=world.heightAt(side*x,z), phase=z*0.37;
        const trunk=new T.CatmullRomCurve3([new T.Vector3(0,0,0),new T.Vector3(side*0.15,2,0),new T.Vector3(side*0.5,4.2,0.2)]);
        put(new T.TubeGeometry(trunk,5,0.2,5,false),wood,side*x,y,z);
        for(let j=0;j<3;j++) { const a=j*Math.PI*2/3+phase, branch=new T.CatmullRomCurve3([new T.Vector3(side*0.2,2.8,0),new T.Vector3(Math.cos(a),3.8,Math.sin(a)),new T.Vector3(Math.cos(a)*2,4.4,Math.sin(a)*2)]);put(new T.TubeGeometry(branch,3,0.1,4,false),wood,side*x,y,z); }
        for(let i=0;i<14;i++){const a=i*2.399+phase,r=0.5+(i%4)*0.5;put(new T.PlaneGeometry(2.6,2.2),leaves,side*x+Math.cos(a)*r,y+4.1+(i%3)*0.55,z+Math.sin(a)*r,1,1,1,0.2*Math.sin(a),a,0.2*Math.cos(a));}
      }
    }
    for (const [mat, pieces] of batches) { const merged = mergeGeometries(pieces), geometry = indexGeometry(merged); if (geometry !== merged) merged.dispose(); const mesh = new T.Mesh(geometry, mat); mesh.name = `${kind}-set`; mesh.matrixAutoUpdate = false; group.add(mesh); pieces.forEach(g => g.dispose()); }
    // A distant sky is a single draw and shares the already-loaded sky image.
    // No procedural noise loop, extra texture, post-processing or shadow pass.
    const skyMap = world.group.getObjectByName('march-sky')?.material.uniforms?.map?.value || null;
    const skyMat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { map: { value: skyMap }, zenith: { value: new T.Color(frost ? 0x102b48 : 0x331a31) }, horizon: { value: new T.Color(frost ? 0x789da9 : 0xd89468) }, tint: { value: new T.Color(frost ? 0x6298ad : 0xb67263) } },
      vertexShader: 'varying vec3 direction; void main(){ direction=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p; gl_Position.z=p.w*0.99999; }',
      fragmentShader: `uniform sampler2D map; uniform vec3 zenith,horizon,tint; varying vec3 direction;
        void main(){ vec3 d=normalize(direction); float h=max(0.0,d.y); vec2 uv=vec2(atan(d.x,-d.z)/6.2831853+0.5,clamp(h*2.5,0.002,0.998));
        vec3 sky=mix(horizon,zenith,smoothstep(0.0,0.7,h)); vec3 clouds=texture2D(map,uv).rgb;
        sky+=clouds*tint*0.32; gl_FragColor=vec4(sky,1.0);
        #include <colorspace_fragment>
        }` });
    owned.add(skyMat);
    const sky = new T.Mesh(new T.SphereGeometry(1,24,12),skyMat); sky.name=`${kind}-sky`; sky.scale.setScalar(85); sky.frustumCulled=false; sky.onBeforeRender=(_,__,camera)=>{sky.position.copy(camera.position);sky.updateMatrixWorld();}; group.add(sky);
    const weather = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) { weather[i * 3] = Math.sin(i * 17.3) * 25; weather[i * 3 + 1] = (i * 7.37) % 15; weather[i * 3 + 2] = 15 - (i * 11.17) % 130; }
    const particleGeometry = new T.BufferGeometry(); particleGeometry.setAttribute('position', new T.BufferAttribute(weather, 3));
    const particleMaterial = new T.PointsMaterial({ color: frost ? 0xe0f4ff : 0xffb865, size: frost ? 0.055 : 0.045, transparent: true, opacity: 0.65, depthWrite: false, sizeAttenuation: true }); owned.add(particleMaterial);
    const particles = new T.Points(particleGeometry, particleMaterial); group.add(particles);
    return { group, particles, weather, owned, frost };
  }
  // 赤月圍城 (ember) and 虛空封魂 (rift). Same rules as the sets above: scenery stays outside the
  // combat lanes, static pieces merge per material, one sky, one weather draw. Shapes are extruded,
  // lathed or noise-displaced rather than stacked boxes; the few animated parts (flames, floating
  // rocks, the vortex) move in shaders driven by one time uniform.
  function buildSet(kind) {
    const ember = kind === 'ember', group = new T.Group(), batches = new Map(), owned = new Set();
    group.name = `chapter-${kind}`; scene.add(group);
    const surface = world.group.getObjectByName('march-stone-0')?.material.uniforms || {};
    const stoneMap = surface.stoneColour?.value || surface.map?.value || null;
    const normalMap = surface.stoneSurface?.value || null;
    const woodMap = surface.woodGrain?.value || null;
    const propsMap = world.group.getObjectByName('march-props-0')?.material.map || null;
    const time = { value: 0 };
    const material = (color, extra = {}) => { const m = new T.MeshStandardMaterial({ color, roughness: 0.82, ...extra }); owned.add(m); return m; };
    // Deterministic value noise for rock and rubble displacement.
    const noise = (x, y, z) => Math.sin(x * 1.7 + y * 3.1 + z * 2.3) * 0.5 + Math.sin(x * 3.9 - z * 2.7 + y * 1.3) * 0.3 + Math.sin(y * 5.1 + x * 4.3 - z * 3.7) * 0.2;
    let seed = ember ? 11 : 29;
    const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const range = (a, b) => a + (b - a) * rand();
    const lane = z => z > -31 ? 10.6 : z > -53 ? 16.2 : z > -85 ? 15.4 : 11.2;
    function normalise(geometry, mat) {
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) g.deleteAttribute(name);
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (mat.vertexColors && !g.attributes.color) g.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
      return g;
    }
    function put(geometry, mat, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
      geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz)));
      const g = normalise(geometry, mat);
      if (!batches.has(mat)) batches.set(mat, []);
      batches.get(mat).push(g); if (g !== geometry) geometry.dispose();
    }
    // Texture scale in metres for primitives whose UVs run 0..1.
    const metres = (g, su, sv) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return g; };
    // Ambient occlusion baked as vertex colour: darker toward the base of a piece.
    const shade = (g, low = 0.45, height = 3, tint = [1, 1, 1]) => {
      g.computeBoundingBox(); const p = g.attributes.position, c = [], y0 = g.boundingBox.min.y;
      for (let i = 0; i < p.count; i++) { const k = low + (1 - low) * Math.min(1, (p.getY(i) - y0) / height); c.push(k * tint[0], k * tint[1], k * tint[2]); }
      g.setAttribute('color', new T.Float32BufferAttribute(c, 3)); return g;
    };
    function atlas(mat, rect, key) {
      mat.onBeforeCompile = shader => { shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
diffuseColor *= texture2D(map, vec2(${rect[0]},${rect[1]})+fract(vMapUv)*vec2(${rect[2]},${rect[3]}));
#endif`); };
      mat.customProgramCacheKey = () => `chapter-${key}-${rect.join('-')}`;
    }
    // Masonry: the street's stone colour and normal maps, scaled per metre.
    const masonry = material(ember ? 0xb48e7c : 0x9aa6b6, { map: stoneMap, normalMap, normalScale: new T.Vector2(1.4, 1.4), roughness: 0.95, vertexColors: true });
    // Dressed-stone blocks drawn in world space: staggered rows with mortar joints and a tint per block;
    // the street texture only adds grain, so walls never read as tiled cobbles.
    masonry.onBeforeCompile = shader => {
      const sample = surface.stoneColour ? 'texture2D(map, vMapUv*0.35)' : 'texture2D(map, vec2(0.004,0.504)+fract(vMapUv*0.35)*0.492)';
      shader.vertexShader = 'varying vec3 vStonePos; varying vec3 vStoneNormal;\n' + shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvStonePos = (modelMatrix * vec4(transformed, 1.0)).xyz; vStoneNormal = normalize(mat3(modelMatrix) * objectNormal);');
      shader.fragmentShader = 'varying vec3 vStonePos; varying vec3 vStoneNormal;\nfloat stoneHash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }\n' + shader.fragmentShader.replace('#include <map_fragment>', `#ifdef USE_MAP
        vec4 stoneTex = ${sample};
        vec3 n = normalize(vStoneNormal);
        vec2 c = abs(n.y) > 0.7 ? vStonePos.xz : vec2(abs(n.x) > abs(n.z) ? vStonePos.z : vStonePos.x, vStonePos.y);
        float rowH = 0.46, row = floor(c.y / rowH), along = c.x / (0.95 + 0.25 * stoneHash(vec2(row, 3.0))) + 0.5 * mod(row, 2.0);
        vec2 f = vec2(fract(along), fract(c.y / rowH)); vec2 cell = vec2(floor(along), row);
        float joint = smoothstep(0.0, 0.05, f.x) * smoothstep(1.0, 0.95, f.x) * smoothstep(0.0, 0.09, f.y) * smoothstep(1.0, 0.91, f.y);
        float block = 0.7 + 0.32 * stoneHash(cell) + 0.1 * (f.y - 0.5);
        float soot = 0.62 + 0.38 * smoothstep(-0.6, 0.9, sin(c.x * 0.55 + sin(c.y * 0.35) * 1.7) + 0.5 * sin(c.x * 1.9 - c.y * 0.15));
        float grain = clamp((stoneTex.r + stoneTex.g + stoneTex.b) / 3.0 * 0.9 + 0.55, 0.7, 1.25);
        diffuseColor.rgb *= mix(vec3(0.26, 0.21, 0.2), vec3(block * grain), joint) * soot;
        #endif`);
    };
    masonry.customProgramCacheKey = () => `chapter-ashlar-${kind}-${!!surface.stoneColour}`;
    const dark = material(ember ? 0x24161a : 0x161d2a, { roughness: 0.9 });
    const metal = material(ember ? 0x5a4a44 : 0x7f93a6, { metalness: 0.7, roughness: 0.42 });
    const wood = material(ember ? 0x6e4a36 : 0x5a5a62, { map: woodMap || propsMap, roughness: 0.9, vertexColors: true });
    if (!woodMap) atlas(wood, [0.751, 0.626, 0.123, 0.123], 'wood');
    const roof = material(ember ? 0x5c3535 : 0x3c4a5c, { map: propsMap, roughness: 0.78 });
    atlas(roof, [0.501, 0.626, 0.248, 0.123], `roof-${kind}`);

    // ---- floor: the shared height field, with a per-set colour pass ----
    const p = [], uv = [], ix = [], nx = 64, nz = 136;
    const edgeNoise = (z, side) => 1.6 * Math.sin(z * 0.43 + side) + 0.9 * Math.sin(z * 1.37 + side * 2.1);
    for (let z = 0; z <= nz; z++) for (let x = 0; x <= nx; x++) {
      const wx = x - 32, wz = 20 - z; let y = world.heightAt(wx, wz) + 0.01;
      // The void set breaks off beyond the shelves along the lane, so the street ends at a cliff.
      if (!ember && Math.abs(wx) > lane(wz) + 6 + edgeNoise(wz, Math.sign(wx))) y = -14;
      p.push(wx, y, wz); uv.push(wx / 4, -wz / 4);
      if (x < nx && z < nz) { const n = z * (nx + 1) + x; ix.push(n, n + 1, n + nx + 1, n + 1, n + nx + 2, n + nx + 1); }
    }
    const floor = new T.BufferGeometry(); floor.setAttribute('position', new T.Float32BufferAttribute(p, 3)); floor.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); floor.setIndex(ix); floor.computeVertexNormals();
    const stone = material(ember ? 0xd2b4a4 : 0x7d8796, { map: stoneMap, normalMap, normalScale: new T.Vector2(0.65, 0.65), roughnessMap: normalMap, roughness: 1, vertexColors: true });
    stone.onBeforeCompile = shader => {
      if (!surface.stoneColour) shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', '#ifdef USE_MAP\ndiffuseColor *= texture2D(map, vec2(0.004,0.504)+fract(vMapUv)*0.492);\n#endif');
      if (normalMap) shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness;\n#ifdef USE_ROUGHNESSMAP\nroughnessFactor *= texture2D(roughnessMap,vRoughnessMapUv).a;\n#endif');
    };
    stone.customProgramCacheKey = () => `chapter-floor-${kind}-${!!normalMap}-${!!surface.stoneColour}`;
    // Glowing cracks (rift) are polylines; the floor colour brightens within reach of them.
    const cracks = [];
    for (const side of [-1, 1]) for (let z0 = 12; z0 > -104; z0 -= ember ? range(13, 20) : range(7, 11)) {
      const line = []; let x = side * (lane(z0) - range(0.5, 2.5)), z = z0;
      for (let i = 0; i < 7; i++) { line.push([x, z]); x += range(-1.2, 1.2) - side * range(0.2, 0.9); z -= range(0.6, 1.6); }
      cracks.push(line);
    }
    const crackDistance = (x, z) => {
      let best = 9;
      for (const line of cracks) for (let i = 1; i < line.length; i++) {
        const [ax, az] = line[i - 1], [bx, bz] = line[i], dx = bx - ax, dz = bz - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
        best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
      }
      return best;
    };
    const colours = [];
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], z = p[i + 2], w = lane(z), edge = Math.max(0, Math.abs(x) - w + 2);
      const soot = 0.5 + 0.5 * noise(x * 0.35, 0, z * 0.35);
      const glow = Math.exp(-Math.pow(crackDistance(x, z) / 0.35, 2));
      if (ember) {
        // Scorched stone: soot patches, warm pools under the braziers, a faint glow along the cracks.
        const dz = ((6 - z) % 8 + 8) % 8, pool = Math.exp(-(Math.pow(Math.abs(x) - (w - 0.5), 2) + Math.pow(Math.min(dz, 8 - dz), 2)) / 7);
        const scorch = 0.62 + 0.38 * Math.min(1, Math.max(0, 0.5 + noise(x * 0.21, 1, z * 0.21)));
        const k = (0.66 + 0.12 * soot) * scorch * (1 - 0.3 * Math.min(1, edge / 3));
        colours.push(k * 0.98 + pool * 0.6 + glow * 0.7, k * 0.86 + pool * 0.3 + glow * 0.28, k * 0.78 + pool * 0.08 + glow * 0.05);
      } else {
        const k = (0.5 + 0.15 * soot) * (1 - 0.4 * Math.min(1, edge / 4));
        colours.push(k * 0.85 + glow * 0.08, k * 0.92 + glow * 0.42, k + glow * 0.55);
      }
    }
    floor.setAttribute('color', new T.Float32BufferAttribute(colours, 3));
    put(floor, stone, 0, 0, 0);

    // ---- shared shape helpers ----
    const extrude = (points, depth, bevel = 0) => {
      const shape = new T.Shape(); shape.moveTo(...points[0]); for (const q of points.slice(1)) shape.lineTo(...q); shape.closePath();
      const g = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 6 });
      g.translate(0, 0, -depth / 2); return g;
    };
    function rock(radius, detail, stretch = [1, 1, 1], roughness = 0.35, key = rand() * 50) {
      const g = mergeVertices(new T.IcosahedronGeometry(1, detail)), pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), d = 1 + roughness * noise(x * 2.1 + key, y * 2.1, z * 2.1 - key);
        pos.setXYZ(i, x * d * radius * stretch[0], y * d * radius * stretch[1], z * d * radius * stretch[2]);
      }
      g.computeVertexNormals(); return g;
    }
    // A cloth strip with a ragged hem (war banners).
    function banner(mat, x, y, z, width, length, ry = 0) {
      const pos = [], uvs = [], ids = [], cols = 6, rows = 8;
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const u = i / cols, v = j / rows, ragged = 1 - 0.22 * Math.max(0, Math.sin(u * 17.3 + width)) * Math.pow(v, 6);
        pos.push((u - 0.5) * width, -v * length * ragged, 0.09 * Math.sin(u * Math.PI * 3 + v * 2.2) * v); uvs.push(u, v);
        if (i < cols && j < rows) { const k = j * (cols + 1) + i; ids.push(k, k + 1, k + cols + 1, k + 1, k + cols + 2, k + cols + 1); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(ids); g.computeVertexNormals();
      shade(g, 0.55, length);
      put(g, mat, x, y, z, 1, 1, 1, 0, ry);
    }
    // A Chinese hip-and-gable roof, curved and upturned at the corners.
    function tileRoof(x, y, z, width, depth, rise, ry = 0) {
      const nx = 8, nz = 6, pos = [], uvs = [], ids = [], curl = Math.min(0.7, width * 0.065);
      const at = (u, v) => [u * width / 2 * (1 + 0.08 * Math.abs(v)), rise * Math.pow(1 - Math.abs(v), 1.5) + curl * Math.pow(Math.abs(u), 4) * Math.pow(Math.abs(v), 3), v * depth / 2];
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
        const u = i / nx * 2 - 1, v = j / nz * 2 - 1;
        pos.push(...at(u, v)); uvs.push(i / nx * width / 2.4, j / nz * depth / 2.4);
        if (i < nx && j < nz) { const k = j * (nx + 1) + i; ids.push(k, k + nx + 1, k + 1, k + 1, k + nx + 1, k + nx + 2); }
      }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2)); g.setIndex(ids); g.computeVertexNormals();
      const under = g.clone(); under.translate(0, -0.16, 0);
      for (let i = 0; i < under.index.count; i += 3) { const k = under.index.getX(i); under.index.setX(i, under.index.getX(i + 1)); under.index.setX(i + 1, k); }
      under.computeVertexNormals(); put(under, dark, x, y, z, 1, 1, 1, 0, ry); put(g, roof, x, y, z, 1, 1, 1, 0, ry);
      for (const side of [-1, 1]) {
        const edge = []; for (let i = 0; i <= 12; i++) { const q = at(i / 6 - 1, side); edge.push(new T.Vector3(q[0], q[1], q[2])); }
        put(new T.TubeGeometry(new T.CatmullRomCurve3(edge), 12, 0.07, 4, false), metal, x, y, z, 1, 1, 1, 0, ry);
      }
    }
    // A pointed, flared octagonal roof for round towers.
    function spire(x, y, z, radius, height, mat = roof) {
      const profile = []; for (let i = 0; i <= 8; i++) { const t = i / 8; profile.push(new T.Vector2(radius * (1 - t) * (1 + 0.25 * Math.pow(1 - t, 3)) + 0.02, height * Math.pow(t, 0.8) - 0.35 * Math.pow(1 - t, 4))); }
      const g = metres(new T.LatheGeometry(profile, 8), 6, 2); put(g, mat, x, y, z);
      put(new T.TorusGeometry(radius * 1.02, 0.06, 4, 8), metal, x, y - 0.3, z, 1, 1, 1, Math.PI / 2, 0, Math.PI / 8);
    }

    const dynamic = [];
    const sky = { zenith: 0, horizon: 0, tint: 0 };
    const veins = material(0x080808, { emissive: ember ? 0xff6a1e : 0x26c8f2, emissiveIntensity: ember ? 1.2 : 1.0, roughness: 0.5 });
    // Floor cracks as thin glowing strips.
    for (const line of cracks) for (let i = 1; i < line.length; i++) {
      const [ax, az] = line[i - 1], [bx, bz] = line[i], length = Math.hypot(bx - ax, bz - az), y = Math.max(world.heightAt(ax, az), world.heightAt(bx, bz));
      put(new T.PlaneGeometry(ember ? 0.05 : 0.06, length), veins, (ax + bx) / 2, y + 0.025, (az + bz) / 2, 1, 1, 1, -Math.PI / 2, 0, Math.atan2(-(bx - ax), -(bz - az)));
    }
    if (ember) buildEmber(); else buildRift();

    function buildEmber() {
      const lacquer = material(0x8c2a20, { roughness: 0.7, vertexColors: true });
      const cloth = material(0x8a1f1a, { side: T.DoubleSide, roughness: 0.92, vertexColors: true });
      const trimGold = material(0xc79a52, { metalness: 0.7, roughness: 0.35 });
      const glow = material(0x2a0d06, { emissive: 0xff6a24, emissiveIntensity: 1.6, roughness: 0.6 });
      const shieldPaint = material(0x7e2219, { roughness: 0.6, side: T.DoubleSide });
      const H = 7.2;
      // City wall: battered plinth, sheer face, a moulded string course and a crenellated parapet.
      const wallProfile = [[-0.6, 0], [2.6, 0], [2.6, H], [0.18, H], [0.18, H - 0.4], [0, H - 0.5], [0, 1.6], [-0.6, 0.55]];
      function wallRun(side, x0, z0, z1) {
        const length = z0 - z1, steps = Math.max(1, Math.round(length / 8)), chunk = length / steps;
        for (let k = 0; k < steps; k++) {
          const zc = z0 - chunk * (k + 0.5), base = Math.min(world.heightAt(0, zc), world.heightAt(side * x0, zc)) - 0.4, turn = side > 0 ? 0 : Math.PI;
          const g = shade(metres(extrude(wallProfile, chunk), 1, 1), 0.42, 4);
          put(g, masonry, side * x0, base, zc, 1, 1, 1, 0, turn);
          // Ledge, merlons and arrow slits along the inner face.
          const ledge = shade(extrude([[0, 0], [0.32, 0], [0.24, 0.12], [0.1, 0.2], [0, 0.22]], chunk), 0.7, 0.3);
          put(ledge, masonry, side * (x0 - 0.3), base + H - 1.3, zc, 1, 1, 1, 0, turn);
          for (let m = 0; m < Math.floor(chunk / 1.7); m++) {
            const zm = zc + chunk / 2 - 0.85 - m * 1.7;
            put(shade(extrude([[-0.45, 0], [0.45, 0], [0.45, 0.8], [0.3, 1.0], [-0.3, 1.0], [-0.45, 0.8]], 0.5, 0.05), 0.75, 1), masonry, side * (x0 + 0.45), base + H, zm, 1, 1, 1, 0, Math.PI / 2);
            if (m % 2 === 0) put(new T.BoxGeometry(0.1, 1.0, 0.16), m % 4 === 0 ? glow : dark, side * (x0 - 0.02), base + H - 2.6, zm);
          }
          // String courses, corbels under the parapet, and per-section features at eye level.
          for (const h of [1.55, 4.1]) put(shade(extrude([[0, 0], [0.18, 0], [0.18, 0.1], [0.08, 0.2], [0, 0.2]], chunk), 0.75, 0.2), masonry, side * (x0 - 0.17), base + h, zc, 1, 1, 1, 0, turn);
          for (let c = 0; c < Math.floor(chunk / 0.85); c++) put(shade(extrude([[0, 0], [0.12, 0], [0.38, 0.32], [0.38, 0.5], [0, 0.5]], 0.3, 0.02), 0.6, 0.5), masonry, side * (x0 - 0.37), base + H - 1.82, zc + chunk / 2 - 0.42 - c * 0.85, 1, 1, 1, 0, turn);
          const feature = (Math.round(zc / 8) % 3 + 3) % 3, fz = zc + range(-1.2, 1.2);
          if (feature === 0) {
            // Arched doorway: chamfered stone frame, recessed plank door with iron straps.
            const frame = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; frame.push([Math.cos(a) * 1.15, 2.1 + Math.sin(a) * 1.15]); }
            const outline = [[1.15, 0], ...frame, [-1.15, 0], [-0.8, 0], ...frame.slice().reverse().map(([u, v]) => [u * 0.7, 2.1 + (v - 2.1) * 0.7]), [0.8, 0]];
            put(shade(extrude(outline, 0.32, 0.03), 0.55, 3), masonry, side * (x0 - 0.12), base + 0.4, fz, 1, 1, 1, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
            const door = []; for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; door.push([Math.cos(a) * 0.82, 2.1 + Math.sin(a) * 0.8]); }
            put(shade(extrude([[0.82, 0], ...door, [-0.82, 0]], 0.08), 0.5, 2.5), wood, side * (x0 + 0.02), base + 0.4, fz, 1, 1, 1, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
            for (const h of [0.7, 1.6, 2.4]) put(new T.CylinderGeometry(0.025, 0.025, 1.6, 6), metal, side * (x0 - 0.04), base + 0.4 + h, fz, 1, 1, 1, Math.PI / 2, 0, 0);
          } else if (feature === 1) {
            // Barred window lit from inside.
            const win = []; for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI; win.push([Math.cos(a) * 0.55, 1.0 + Math.sin(a) * 0.55]); }
            put(extrude([[0.55, 0], ...win, [-0.55, 0]], 0.05), glow, side * (x0 + 0.03), base + 2.7, fz, 1, 1, 1, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
            for (const dz of [-0.3, 0, 0.3]) put(new T.CylinderGeometry(0.03, 0.03, 1.6, 6), metal, side * (x0 - 0.05), base + 3.45, fz + dz);
            put(shade(extrude([[0.75, 0], [0.75, 1.0], ...win.map(([u, v]) => [u * 1.36, (v - 1.0) * 1.36 + 1.0]), [-0.75, 1.0], [-0.75, 0], [-0.55, 0], ...win.slice().reverse(), [0.55, 0]], 0.25, 0.03), 0.6, 2), masonry, side * (x0 - 0.1), base + 2.55, fz, 1, 1, 1, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
          } else {
            // Timber hoarding post and brace, with round shields hung on the wall.
            put(shade(new T.CylinderGeometry(0.11, 0.13, 4.4, 8), 0.5, 4), wood, side * (x0 - 0.55), base + 2.2, fz);
            put(new T.CylinderGeometry(0.07, 0.07, 2.2, 6), wood, side * (x0 - 0.3), base + 3.6, fz + 0.7, 1, 1, 1, 0.75, 0, 0);
            for (const dz of [-1.6, 1.8]) {
              const shield = new T.LatheGeometry([[0, 0.09], [0.32, 0.07], [0.48, 0.02], [0.5, 0]].map(([a, b]) => new T.Vector2(a, b)), 16);
              put(shield, shieldPaint, side * (x0 - 0.02), base + 2.9, fz + dz, 1, 1, 1, 0, 0, side > 0 ? Math.PI / 2 : -Math.PI / 2);
              put(new T.TorusGeometry(0.49, 0.03, 4, 16), trimGold, side * (x0 - 0.04), base + 2.9, fz + dz, 1, 1, 1, 0, Math.PI / 2, 0);
            }
          }
          // Buttress at every joint hides the step where the wall follows the terraces.
          const b = shade(metres(extrude([[-1.1, 0], [1.4, 0], [1.4, H + 0.4], [-0.25, H + 0.4], [-0.25, 2.8]], 1.3, 0.06), 1, 1), 0.4, 4);
          put(b, masonry, side * x0, base, zc + chunk / 2, 1, 1, 1, 0, turn);
        }
      }
      // Round watchtower: tapered drum, machicolation ring, crenels, glowing loopholes, flared roof and a pennant.
      function tower(x, z, radius = 2.6, height = 11) {
        const y = world.heightAt(x, z) - 0.4;
        put(shade(metres(new T.CylinderGeometry(radius, radius * 1.18, height, 16, 4), radius * 6.3, height), 0.4, 5), masonry, x, y + height / 2, z);
        put(shade(metres(new T.CylinderGeometry(radius * 1.16, radius * 1.02, 0.9, 16, 1), radius * 7, 1), 0.6, 1), masonry, x, y + height + 0.2, z);
        for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; put(shade(extrude([[-0.4, 0], [0.4, 0], [0.4, 0.75], [0.25, 0.92], [-0.25, 0.92], [-0.4, 0.75]], 0.45, 0.04), 0.75, 1), masonry, x + Math.cos(a) * radius * 1.08, y + height + 0.65, z + Math.sin(a) * radius * 1.08, 1, 1, 1, 0, -a + Math.PI / 2); }
        for (const [a, h] of [[0.4, 0.45], [2.2, 0.62], [3.6, 0.5], [5.1, 0.7]]) put(extrude([[-0.12, 0], [0.12, 0], [0.12, 0.7], [0, 0.85], [-0.12, 0.7]], 0.1), glow, x + Math.cos(a) * radius * 1.04, y + height * h, z + Math.sin(a) * radius * 1.04, 1, 1, 1, 0, -a + Math.PI / 2);
        spire(x, y + height + 1.1, z, radius * 1.35, radius * 1.9);
        put(new T.CylinderGeometry(0.05, 0.05, 2.6, 5), metal, x, y + height + radius * 1.9 + 1.9, z);
        banner(cloth, x + 0.55, y + height + radius * 1.9 + 3.0, z, 1.0, 1.1, Math.PI / 2);
      }
      // Brazier: tripod, lathed bowl, glowing coals; the flame itself is in the animated batch.
      const flames = [];
      function brazier(x, z, scale = 1) {
        const y = world.heightAt(x, z);
        for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; put(new T.CylinderGeometry(0.035, 0.05, 1.7, 5), metal, x + Math.cos(a) * 0.32 * scale, y + 0.82 * scale, z + Math.sin(a) * 0.32 * scale, 1, scale, 1, Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22); }
        const bowl = new T.LatheGeometry([[0, 0], [0.32, 0.04], [0.52, 0.28], [0.6, 0.42], [0.55, 0.44]].map(([a, b]) => new T.Vector2(a, b)), 12);
        put(bowl, metal, x, y + 1.62 * scale, z, scale, scale, scale);
        put(new T.CircleGeometry(0.5, 10), glow, x, y + 1.95 * scale, z, scale, scale, scale, -Math.PI / 2);
        flames.push([x, y + 1.98 * scale, z, scale]);
      }
      function spears(x, z, count, lean) {
        const y = world.heightAt(x, z);
        for (let i = 0; i < count; i++) {
          const sx = x + range(-0.8, 0.8), sz = z + range(-1.2, 1.2), rx = range(-0.35, 0.35), rz = lean * range(0.2, 0.5), len = range(2.2, 3.1);
          const shaft = new T.CylinderGeometry(0.03, 0.035, len, 5); shaft.translate(0, len / 2, 0);
          put(shaft, wood, sx, y - 0.2, sz, 1, 1, 1, rx, 0, rz);
          const tip = new T.ConeGeometry(0.06, 0.32, 4); tip.translate(0, len + 0.12, 0); put(tip, metal, sx, y - 0.2, sz, 1, 1, 1, rx, 0, rz);
        }
      }
      function rubble(x, z, size) {
        const y = world.heightAt(x, z);
        put(shade(rock(size, 2, [1.3, 0.45, 1], 0.3), 0.35, size * 0.8), masonry, x, y - size * 0.15, z, 1, 1, 1, 0, range(0, 6));
        for (let i = 0; i < 4; i++) put(shade(rock(size * range(0.15, 0.3), 1, [1, 0.7, 1], 0.35), 0.5, 0.4), masonry, x + range(-size, size) * 1.2, y + 0.05, z + range(-size, size) * 1.2, 1, 1, 1, range(0, 3), range(0, 3), 0);
      }
      function cart(x, z, ry) {
        const y = world.heightAt(x, z);
        const spokes = [new T.TorusGeometry(0.55, 0.07, 6, 16), ...Array.from({ length: 6 }, (_, i) => new T.CylinderGeometry(0.025, 0.025, 1.0, 4).rotateZ(i * Math.PI / 6))];
        const wheel = mergeGeometries(spokes.map(g => g.toNonIndexed())); spokes.forEach(g => g.dispose());
        put(wheel, wood, x + 0.9 * Math.cos(ry), y + 0.5, z - 0.9 * Math.sin(ry), 1, 1, 1, 0, ry, 0.35);
        for (let i = 0; i < 4; i++) put(shade(extrude([[-1.2, 0], [1.2, 0], [1.15, 0.12], [-1.15, 0.12]], 0.28, 0.02), 0.6, 0.2), wood, x, y + 0.35 + i * 0.05, z + (i - 1.5) * 0.3, 1, 1, 1, range(-0.2, 0.2), ry, -0.28 + range(-0.08, 0.08));
      }
      // Gatehouse over each barrier: a stone arch spanning the street with a pavilion on top.
      function gatehouse(z, inner, outer, opening) {
        const y = world.heightAt(0, z) - 0.4, rise = 3.2, spring = opening, top = spring + rise + 2.6;
        const shape = new T.Shape(); shape.moveTo(-outer, 0); shape.lineTo(-inner, 0); shape.lineTo(-inner, spring);
        for (let i = 1; i < 16; i++) { const a = Math.PI - i / 16 * Math.PI; shape.lineTo(Math.cos(a) * inner, spring + Math.sin(a) * rise); }
        shape.lineTo(inner, spring); shape.lineTo(inner, 0); shape.lineTo(outer, 0); shape.lineTo(outer, top); shape.lineTo(-outer, top); shape.closePath();
        const g = new T.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1, curveSegments: 16 }); g.translate(0, 0, -1.5);
        put(shade(g, 0.45, 5), masonry, 0, y, z);
        // Voussoir ring and keystone around the opening.
        for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; put(shade(extrude([[-0.28, 0], [0.28, 0], [0.24, 0.62], [-0.24, 0.62]], 3.15, 0.03), 0.8, 0.6), masonry, Math.cos(a) * (inner - 0.05), y + spring + Math.sin(a) * (rise - 0.05), z, 1, 1, 1, 0, 0, a - Math.PI / 2); }
        for (let m = -outer + 0.7; m < outer - 0.4; m += 1.7) put(shade(extrude([[-0.45, 0], [0.45, 0], [0.45, 0.8], [0.3, 1.0], [-0.3, 1.0], [-0.45, 0.8]], 0.5, 0.05), 0.75, 1), masonry, m, y + top, z + 1.25);
        // Pavilion: lacquered pillars, a balustrade and a two-tier roof.
        const deck = y + top, span = Math.min(outer - 1, inner + 1.5);
        for (const px of [-span, -span / 3, span / 3, span]) for (const pz of [-0.9, 0.9]) put(shade(new T.CylinderGeometry(0.2, 0.24, 3.0, 10), 0.5, 3), lacquer, px, deck + 1.5, z + pz);
        put(shade(extrude([[-span - 0.6, 0], [span + 0.6, 0], [span + 0.6, 0.35], [-span - 0.6, 0.35]], 2.6, 0.05), 0.6, 0.4), wood, 0, deck + 2.9, z);
        tileRoof(0, deck + 3.2, z, span * 2 + 3.2, 4.4, 1.5);
        tileRoof(0, deck + 4.9, z, span * 1.2 + 1.6, 2.8, 1.1);
        banner(cloth, -inner * 0.55, y + spring + rise - 0.2, z + 1.62, 1.3, 3.2);
        banner(cloth, inner * 0.55, y + spring + rise - 0.2, z + 1.62, 1.3, 3.2);
      }
      // Walls by lane segment, with towers at each corner where the lane widens or narrows.
      const runs = [[10.9, 16, -29.5], [16.5, -32.5, -51.5], [15.7, -54.5, -83.5], [11.5, -86.5, -102]];
      for (const side of [-1, 1]) for (const [x0, z0, z1] of runs) wallRun(side, x0, z0, z1);
      for (const side of [-1, 1]) {
        for (const [x, z, r, h] of [[13.6, -31, 2.8, 12], [18.4, -53, 2.6, 11.5], [15.4, -85, 3, 13], [13.6, 4, 2.4, 10], [18.6, -42, 2.2, 9.5], [17.6, -69, 2.4, 10.5]]) tower(side * x, z, r, h);
        // Cross walls closing the corners behind the towers.
        for (const [z, a, b] of [[-31, 10.9, 16.5], [-53, 15.7, 16.5], [-85, 11.5, 15.7]]) {
          const g = shade(metres(extrude(wallProfile, b - a + 1.4), 1, 1), 0.42, 4);
          put(g, masonry, side * (a + b) / 2, Math.min(world.heightAt(0, z), world.heightAt(side * a, z)) - 0.4, z - 1.3, 1, 1, 1, 0, Math.PI / 2);
        }
      }
      gatehouse(-30, 9.4, 13.4, 6.4); gatehouse(-52, 10.2, 18.2, 6.4); gatehouse(-84, 9.4, 17, 6.8);
      // Keep at the far end: two great towers and a curtain wall behind the soul gate.
      for (const side of [-1, 1]) tower(side * 9.6, -108, 3.6, 17);
      const keepBase = world.heightAt(0, -102) - 0.4;
      put(shade(metres(extrude(wallProfile.map(([u, v]) => [u, v * 1.6]), 16), 1, 1), 0.42, 5), masonry, 0, keepBase, -110, 1, 1, 1, 0, Math.PI / 2);
      tileRoof(0, keepBase + H * 1.6 + 0.3, -111.2, 15, 5, 2);
      // Braziers along the wall foot, banners on the walls, debris between.
      for (let z = 6; z >= -100; z -= 8) for (const side of [-1, 1]) {
        const w = lane(z);
        brazier(side * (w - 0.5), z - 2, 1);
        if (Math.abs(z / 8 + (side > 0 ? 1 : 0)) % 2 === 0) banner(cloth, side * (w + 0.22), world.heightAt(side * w, z) + 6.1, z - 5.5, 1.5, 4.2, side > 0 ? -Math.PI / 2 : Math.PI / 2);
        if (rand() < 0.55) spears(side * (w + 0.1), z - 6, 3 + Math.floor(rand() * 3), -side);
        if (rand() < 0.4) rubble(side * (w + 0.2), z - 3.5, range(0.6, 1.1));
      }
      for (const [x, z, ry] of [[-9.6, -12, 0.6], [9.8, -22, -2.4], [-14.8, -60, 2.0], [14.6, -76, -0.7]]) cart(x, z, ry);
      // Burning city beyond the walls: dark gabled roofs with fire behind the eaves (fog softens them).
      const silhouette = material(0x1c0e10, { roughness: 1 });
      for (let i = 0; i < 36; i++) {
        const side = i % 2 ? 1 : -1, z = 14 - Math.floor(i / 2) * 7 + range(-2, 2), x = side * range(26, 46), w = range(5, 9), h = range(4, 9), y = -0.5;
        put(extrude([[-w / 2, 0], [w / 2, 0], [w / 2, h], [w * 0.62, h], [0, h + w * 0.42], [-w * 0.62, h], [-w / 2, h]], range(5, 8)), silhouette, x, y, z, 1, 1, 1, 0, range(-0.4, 0.4));
        if (rand() < 0.6) put(new T.PlaneGeometry(w * 0.9, range(1, 2.4)), glow, x - side * range(2.6, 4), y + h * 0.6, z, 1, 1, 1, 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
      }
      // One animated batch for every flame: three crossed teardrops per brazier, flickering in the vertex shader.
      const parts = [];
      for (const [x, y, z, scale] of flames) for (let k = 0; k < 3; k++) {
        const tear = new T.LatheGeometry([[0, 0], [0.22, 0.12], [0.26, 0.32], [0.16, 0.62], [0.05, 0.92], [0, 1.05]].map(([a, b]) => new T.Vector2(a * (1 - k * 0.22), b * (1 - k * 0.18))), 6);
        tear.scale(scale * 0.85, scale * 0.95, scale * 0.85); tear.rotateY(k * 1.1); tear.translate(x, y, z);
        const n = tear.attributes.position.count, origin = new Float32Array(n * 4), colour = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const h = (tear.attributes.position.getY(i) - y) / (1.05 * scale);
          origin.set([x, y, z, x * 0.37 + z * 0.61 + k], i * 4);
          colour.set([0.95 - h * 0.35, 0.5 - h * 0.38 - k * 0.06, 0.1 - h * 0.08], i * 3);
        }
        tear.setAttribute('origin', new T.BufferAttribute(origin, 4)); tear.setAttribute('color', new T.BufferAttribute(colour, 3));
        parts.push(tear.index ? tear.toNonIndexed() : tear);
      }
      const splashParts = [];
      for (const [x, y, z, scale] of flames) {
        const side = Math.sign(x), plane = new T.PlaneGeometry(4.2 * scale, 4.2 * scale);
        plane.rotateY(side > 0 ? -Math.PI / 2 : Math.PI / 2); plane.translate(x + side * 0.75, y + 0.6, z);
        const phase = new Float32Array(plane.attributes.position.count).fill(x * 0.37 + z * 0.61);
        plane.setAttribute('phase', new T.BufferAttribute(phase, 1)); splashParts.push(plane.toNonIndexed());
        const pool = new T.PlaneGeometry(3.6 * scale, 3.6 * scale); pool.rotateX(-Math.PI / 2); pool.translate(x, y - 1.95 * scale + 0.04, z);
        pool.setAttribute('phase', new T.BufferAttribute(new Float32Array(pool.attributes.position.count).fill(x * 0.37 + z * 0.61), 1)); splashParts.push(pool.toNonIndexed());
      }
      const splashMaterial = new T.ShaderMaterial({ transparent: true, depthWrite: false, blending: T.AdditiveBlending, uniforms: { uTime: time },
        vertexShader: 'attribute float phase; varying vec2 vUv; varying float vFlicker; uniform float uTime; void main(){ vUv=uv*2.0-1.0; vFlicker=0.82+0.12*sin(uTime*9.0+phase*7.0)+0.06*sin(uTime*23.0+phase*3.0); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
        fragmentShader: 'varying vec2 vUv; varying float vFlicker; void main(){ float r=length(vUv); float a=exp(-r*r*3.2)*vFlicker*0.55; gl_FragColor=vec4(vec3(1.0,0.45,0.12)*a,1.0); }' });
      owned.add(splashMaterial);
      const splash = new T.Mesh(mergeGeometries(splashParts), splashMaterial); splashParts.forEach(g => g.dispose());
      splash.name = 'ember-glow'; splash.frustumCulled = false; splash.matrixAutoUpdate = false; dynamic.push(splash);
      const flameMaterial = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      flameMaterial.onBeforeCompile = shader => {
        shader.uniforms.uTime = time;
        shader.vertexShader = 'attribute vec4 origin; uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
          float f = 1.0 + 0.22 * sin(uTime * 9.0 + origin.w * 7.0) + 0.12 * sin(uTime * 23.0 + origin.w * 3.0);
          vec3 rel = transformed - origin.xyz; float w = inversesqrt(f);
          transformed = origin.xyz + vec3(rel.x * w + 0.06 * sin(uTime * 6.0 + origin.w + rel.y * 4.0) * rel.y, rel.y * f, rel.z * w);`);
      };
      flameMaterial.customProgramCacheKey = () => 'chapter-ember-flame';
      owned.add(flameMaterial);
      const flameMesh = new T.Mesh(mergeGeometries(parts), flameMaterial); parts.forEach(g => g.dispose());
      flameMesh.name = 'ember-flames'; flameMesh.frustumCulled = false; flameMesh.matrixAutoUpdate = false; dynamic.push(flameMesh);
      Object.assign(sky, { zenith: 0x170408, horizon: 0x6e1d14, tint: 0xa8442e });
    }

    function buildRift() {
      const crystal = material(0x2fc8d4, { emissive: 0x18a8c4, emissiveIntensity: 1.3, roughness: 0.22, metalness: 0.1, flatShading: true });
      const crystalDeep = material(0x6b4bd8, { emissive: 0x4d2bb8, emissiveIntensity: 1.1, roughness: 0.25, flatShading: true });
      // Rift stone is untextured: colour comes from baked strata and occlusion, relief from the normal map.
      const strata = (g, a, b, scale = 1) => {
        const pos = g.attributes.position, col = g.attributes.color, c = new T.Color(), ca = new T.Color(a), cb = new T.Color(b);
        for (let i = 0; i < pos.count; i++) {
          const band = 0.5 + 0.5 * Math.sin(pos.getY(i) * 3.1 * scale + noise(pos.getX(i) * 0.6, 0, pos.getZ(i) * 0.6) * 2.4);
          c.copy(ca).lerp(cb, band); const k = col ? col.getX(i) : 1; col.setXYZ(i, c.r * k, c.g * k, c.b * k);
        }
        return g;
      };
      const rockMat = material(0xffffff, { normalMap, normalScale: new T.Vector2(0.8, 0.8), roughness: 0.95, vertexColors: true });
      const pale = material(0xffffff, { normalMap, normalScale: new T.Vector2(0.5, 0.5), roughness: 0.85, vertexColors: true });
      function crystals(x, y, z, count, size, mat = crystal) {
        for (let i = 0; i < count; i++) {
          const h = size * range(0.7, 1.6), r = size * range(0.12, 0.22);
          const g = new T.LatheGeometry([[0, -0.2 * h], [r, 0], [r * 0.85, h * 0.72], [0, h]].map(([a, b]) => new T.Vector2(a, b)), 6);
          put(g, i % 4 === 3 ? crystalDeep : mat, x + range(-size, size) * 0.5, y, z + range(-size, size) * 0.5, 1, 1, 1, range(-0.5, 0.5), range(0, 3), range(-0.5, 0.5));
        }
      }
      // Broken shelves along the lane: flat-topped rock with a deep, tapering underside over the void.
      function shelf(x, z, radius) {
        const y = world.heightAt(x, z), g = new T.CylinderGeometry(radius, radius * 0.35, 8, 9, 4), pos = g.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i), d = 1 + 0.28 * noise(vx * 0.9 + x, vy * 0.4, vz * 0.9 + z);
          pos.setXYZ(i, vx * d, vy > 3.9 ? vy + 0.15 * noise(vx, 0, vz) : vy * (1 + 0.15 * noise(vz, vy, vx)), vz * d);
        }
        g.computeVertexNormals(); shade(g, 0.15, 8); strata(g, 0x3b4656, 0x5d6b7c);
        put(metres(g, radius * 2, 2), rockMat, x, y - 4.05, z, 1, 1, 1, 0, range(0, 6));
      }
      // Ancient column: lathed base, fluted shaft and a jagged break at the top.
      function column(x, z, height, fallen = false) {
        const y = world.heightAt(x, z);
        const base = new T.LatheGeometry([[0, 0], [0.75, 0], [0.75, 0.25], [0.62, 0.32], [0.62, 0.45], [0.5, 0.55]].map(([a, b]) => new T.Vector2(a, b)), 16);
        const shaft = new T.CylinderGeometry(0.42, 0.48, height, 16, 6), pos = shaft.attributes.position;
        for (let i = 0; i < pos.count; i++) {
          const vx = pos.getX(i), vy = pos.getY(i), vz = pos.getZ(i), a = Math.atan2(vz, vx), flute = 1 - 0.06 * Math.max(0, Math.cos(a * 16));
          const top = vy > height / 2 - 0.01 ? -0.6 * Math.abs(noise(a * 2, x, z)) : 0;
          pos.setXYZ(i, vx * flute, vy + top, vz * flute);
        }
        shaft.computeVertexNormals(); shaft.translate(0, height / 2 + 0.5, 0);
        const ivory = g => strata(g, 0xaeb4bf, 0xc9ccd3, 2.2);
        if (fallen) { put(ivory(shade(metres(shaft, 3, height), 0.5, 1)), pale, x, y + 0.45, z, 1, 1, 1, 0, Math.PI / 2 + range(-0.25, 0.25), Math.PI / 2); return; }
        put(ivory(shade(base, 0.5, 0.6)), pale, x, y, z); put(ivory(shade(metres(shaft, 3, height), 0.45, height)), pale, x, y, z);
      }
      // Ruined arch over a barrier: piers and a ring of wedge stones with gaps where blocks fell away.
      const floaters = [];
      function ruinArch(z, inner, missing) {
        const y = world.heightAt(0, z), spring = 4.2, thick = 1.3, n = 15;
        for (const side of [-1, 1]) {
          const pier = new T.CylinderGeometry(0.9, 1.1, spring, 8, 3); pier.translate(0, spring / 2, 0);
          put(strata(shade(metres(pier, 6, spring), 0.4, spring), 0xaeb4bf, 0xc9ccd3, 2.2), pale, side * (inner + 0.65), y, z);
        }
        for (let i = 0; i < n; i++) {
          const a0 = i / n * Math.PI, a1 = (i + 1) / n * Math.PI, r0 = inner, r1 = inner + thick;
          const wedge = extrude([[Math.cos(a0) * r0, Math.sin(a0) * r0], [Math.cos(a0) * r1, Math.sin(a0) * r1], [Math.cos(a1) * r1, Math.sin(a1) * r1], [Math.cos(a1) * r0, Math.sin(a1) * r0]], 1.6, 0.05);
          strata(shade(wedge, 0.6, 1.5), 0xaeb4bf, 0xc9ccd3, 2.2);
          if (missing.includes(i)) { floaters.push({ geometry: wedge, x: range(-3, 3), y: y + spring + range(5, 9), z: z + range(-3, 3), spin: range(0, 6) }); continue; }
          put(wedge, pale, 0, y + spring, z);
        }
      }
      for (const side of [-1, 1]) for (let z = 14; z > -104; z -= range(3.6, 5.2)) {
        const w = lane(z); shelf(side * (w + range(1.6, 3.2)), z, range(2.2, 3.4));
        if (rand() < 0.5) crystals(side * (w + range(0.6, 2.2)), world.heightAt(side * w, z), z + range(-1, 1), 3 + Math.floor(rand() * 4), range(0.8, 1.5));
      }
      for (const side of [-1, 1]) for (let z = 8; z > -100; z -= 12) {
        const w = lane(z);
        if (rand() < 0.75) column(side * (w + 0.9), z - range(0, 4), range(2.5, 6.5)); else column(side * (w + 1.5), z - 2, range(3, 5), true);
      }
      ruinArch(-30, 9.6, [7, 8, 11]); ruinArch(-52, 10.4, [3, 4, 9]); ruinArch(-84, 9.6, [6, 10, 11, 12]);
      // Rune circles at each segment centre.
      for (const z of [-12, -41, -70, -96]) {
        const y = world.heightAt(0, z);
        for (const radius of [2.4, 3.1]) put(new T.TorusGeometry(radius, 0.03, 4, 64), veins, 0, y + 0.03, z, 1, 1, 1, Math.PI / 2);
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; put(new T.PlaneGeometry(0.12, 0.5), veins, Math.cos(a) * 2.75, y + 0.03, z + Math.sin(a) * 2.75, 1, 1, 1, -Math.PI / 2, 0, -a); }
      }
      // Floating islands: noise-displaced rock, flat on top with a hanging spike, a few crystals each.
      // They bob in the vertex shader (one draw); missing arch stones drift with them.
      const islandParts = [];
      const addFloating = (g, x, y, z, ry, phase, amp) => {
        g.rotateY(ry); g.translate(x, y, z);
        const ng = g.index ? g.toNonIndexed() : g, n = ng.attributes.position.count, bob = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) bob.set([phase, amp], i * 2);
        for (const name of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(name)) ng.deleteAttribute(name);
        if (!ng.attributes.color) ng.setAttribute('color', new T.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
        ng.setAttribute('bob', new T.BufferAttribute(bob, 2)); islandParts.push(ng);
      };
      for (let i = 0; i < 26; i++) {
        const side = i % 2 ? 1 : -1, z = 16 - Math.floor(i / 2) * 9.5 + range(-3, 3), x = side * range(21, 44), y = range(3, 15), r = range(1.6, 4.6);
        const g = rock(r, 2, [1.25, 0.9, 1.1], 0.3), pos = g.attributes.position;
        for (let k = 0; k < pos.count; k++) { const vx = pos.getX(k), vy = pos.getY(k), vz = pos.getZ(k); pos.setY(k, vy > 0 ? vy * 0.62 + 0.25 * r * noise(vx * 1.3, 2, vz * 1.3) : vy * (2.3 + 1.6 * Math.max(0, -noise(vx * 1.7, 0, vz * 1.7)))); }
        g.computeVertexNormals(); shade(g, 0.2, r * 1.6); strata(g, 0x343e4e, 0x66748a, 0.9); metres(g, r * 0.6, r * 0.6);
        const phase = range(0, 6.28), amp = range(0.25, 0.7);
        addFloating(g, x, y, z, range(0, 6), phase, amp);
        for (let c = 0; c < 3; c++) {
          const h = r * range(0.4, 0.8), cg = new T.LatheGeometry([[0, -0.1], [h * 0.18, 0], [h * 0.15, h * 0.72], [0, h]].map(([a, b]) => new T.Vector2(a, b)), 6);
          cg.rotateX(range(-0.4, 0.4)); cg.rotateZ(range(-0.4, 0.4));
          const cc = new Float32Array(cg.attributes.position.count * 3).fill(-1);
          cg.setAttribute('color', new T.BufferAttribute(cc, 3)); // negative colour flags crystal emission in the shader
          addFloating(cg, x + range(-r, r) * 0.5, y + r * 0.3, z + range(-r, r) * 0.5, 0, phase, amp);
        }
      }
      for (const f of floaters) addFloating(f.geometry, f.x, f.y, f.z, f.spin, range(0, 6.28), 0.4);
      const islandMaterial = new T.MeshStandardMaterial({ color: 0xffffff, normalMap, normalScale: new T.Vector2(0.8, 0.8), roughness: 0.92, vertexColors: true });
      islandMaterial.onBeforeCompile = shader => {
        shader.uniforms.uTime = time;
        shader.vertexShader = 'attribute vec2 bob; uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sin(uTime * 0.55 + bob.x) * bob.y;');
        shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nfloat crystalMask = step(vColor.r, -0.5);\ndiffuseColor.rgb = mix(abs(diffuseColor.rgb), vec3(0.18,0.75,0.82), crystalMask);')
          .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += crystalMask * vec3(0.12,0.75,0.9) * 1.4;');
      };
      islandMaterial.customProgramCacheKey = () => 'chapter-rift-islands';
      owned.add(islandMaterial);
      const islands = new T.Mesh(mergeGeometries(islandParts), islandMaterial); islandParts.forEach(g => g.dispose());
      islands.name = 'rift-islands'; islands.frustumCulled = false; islands.matrixAutoUpdate = false; dynamic.push(islands);
      Object.assign(sky, { zenith: 0x03060f, horizon: 0x123444, tint: 0x5d4ab0 });
    }

    for (const [mat, pieces] of batches) { const merged = mergeGeometries(pieces), geometry = indexGeometry(merged); if (geometry !== merged) merged.dispose(); const mesh = new T.Mesh(geometry, mat); mesh.name = `${kind}-set`; mesh.matrixAutoUpdate = false; group.add(mesh); pieces.forEach(g => g.dispose()); }
    for (const mesh of dynamic) group.add(mesh);
    // Sky: the shared cloud image over a gradient, with a red moon (ember) or stars (rift).
    const skyMap = world.group.getObjectByName('march-sky')?.material.uniforms?.map?.value || null;
    const skyMat = new T.ShaderMaterial({ side: T.BackSide, depthWrite: false, fog: false,
      uniforms: { map: { value: skyMap }, zenith: { value: new T.Color(sky.zenith) }, horizon: { value: new T.Color(sky.horizon) }, tint: { value: new T.Color(sky.tint) }, uTime: time },
      vertexShader: 'varying vec3 direction; void main(){ direction=position; vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p; gl_Position.z=p.w*0.99999; }',
      fragmentShader: `uniform sampler2D map; uniform vec3 zenith,horizon,tint; uniform float uTime; varying vec3 direction;
        float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
        void main(){ vec3 d=normalize(direction); float h=max(0.0,d.y); vec2 uv=vec2(atan(d.x,-d.z)/6.2831853+0.5,clamp(h*2.5,0.002,0.998));
        vec3 sky=mix(horizon,zenith,smoothstep(0.0,0.7,h)); vec3 clouds=texture2D(map,uv).rgb;
        ${ember ? `vec3 moonDir=normalize(vec3(-0.32,0.36,-1.0)); float m=dot(d,moonDir);
        float disc=smoothstep(0.9935,0.9945,m); float halo=exp((m-1.0)*40.0)*0.55+exp((m-1.0)*8.0)*0.2;
        vec3 moon=mix(vec3(0.95,0.28,0.16),vec3(1.0,0.55,0.32),clouds.r)*disc;
        sky=sky*(1.0-disc)+moon+vec3(0.9,0.22,0.1)*halo;
        sky=mix(sky, sky*0.45, smoothstep(0.35,0.8,clouds.g)*(1.0-disc)*smoothstep(0.02,0.25,h));
        sky+=clouds*tint*0.22*(1.0-disc);` : `vec2 cell=floor(vec2(atan(d.x,-d.z),asin(d.y))*90.0); float star=step(0.996,hash(cell))*smoothstep(0.0,0.15,h);
        float twinkle=0.6+0.4*sin(uTime*2.0+hash(cell+3.1)*30.0);
        sky+=vec3(0.75,0.9,1.0)*star*twinkle; sky+=clouds*tint*0.42*smoothstep(0.05,0.5,h);
        vec3 axis=normalize(vec3(0.0,0.3,-1.0)); vec3 side=normalize(cross(axis,vec3(0.0,1.0,0.0))); vec3 up=cross(side,axis);
        float along=dot(d,axis); vec2 q=vec2(dot(d,side),dot(d,up))/max(along,0.05)/0.62; float r=length(q);
        if(along>0.0&&r<1.0){ float a=atan(q.y,q.x);
          float arms=0.5+0.5*sin(a*3.0+log(r+0.02)*7.0-uTime*0.9); float fine=0.5+0.5*sin(a*7.0+log(r+0.02)*13.0-uTime*1.7);
          float body=smoothstep(1.0,0.35,r)*smoothstep(0.06,0.28,r); float rim=exp(-pow((r-0.2)/0.045,2.0)); float core=smoothstep(0.2,0.0,r);
          sky=sky*(1.0-core*0.95)+(mix(vec3(0.35,0.12,0.75),vec3(0.15,0.85,0.95),arms)*body*(0.35+0.65*arms*fine)+vec3(0.7,1.0,1.0)*rim*1.2)*0.85; }`}
        gl_FragColor=vec4(sky,1.0);
        #include <colorspace_fragment>
        }` });
    owned.add(skyMat);
    const skyMesh = new T.Mesh(new T.SphereGeometry(1, 24, 12), skyMat); skyMesh.name = `${kind}-sky`; skyMesh.scale.setScalar(85); skyMesh.frustumCulled = false;
    skyMesh.onBeforeRender = (_, __, camera) => { skyMesh.position.copy(camera.position); skyMesh.updateMatrixWorld(); }; group.add(skyMesh);
    // Weather: rising embers (ember) or slow drifting motes (rift).
    const weather = new Float32Array(256 * 3);
    for (let i = 0; i < 256; i++) { weather[i * 3] = Math.sin(i * 17.3) * 25; weather[i * 3 + 1] = (i * 7.37) % 15; weather[i * 3 + 2] = 15 - (i * 11.17) % 130; }
    const particleGeometry = new T.BufferGeometry(); particleGeometry.setAttribute('position', new T.BufferAttribute(weather, 3));
    const particleMaterial = new T.PointsMaterial({ color: ember ? 0xff8a3c : 0x86f4ff, size: ember ? 0.07 : 0.055, transparent: true, opacity: 0.8, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true }); owned.add(particleMaterial);
    const particles = new T.Points(particleGeometry, particleMaterial); group.add(particles);
    let clock = 0;
    const animate = dt => { clock += dt; time.value = clock; };
    return { group, particles, weather, owned, frost: false, drift: ember ? 1.5 : 0.35, animate };
  }
  return {
    apply(chapter) {
      const kind = chapter.environment;
      if (kind && !sets.has(kind)) sets.set(kind, build(kind));
      active = sets.get(kind) || null;
      for (const [id, set] of sets) set.group.visible = id === kind;
      for (const mesh of originals) mesh.visible = !kind;
    },
    stats() {
      if (!active) return null;
      let triangles = 0, geometryBytes = 0, meshes = 0;
      active.group.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count || o.geometry.attributes.position.count) / 3; } if (o.geometry) { for (const a of Object.values(o.geometry.attributes)) geometryBytes += a.array.byteLength; geometryBytes += o.geometry.index?.array.byteLength || 0; } });
      return { meshes, triangles, geometryBytes, particles: active.weather.length / 3 };
    },
    update(dt) {
      if (!active) return;
      const { weather, frost, particles } = active, drift = active.drift ?? (frost ? -0.8 : 0.9);
      for (let i = 0; i < weather.length; i += 3) { weather[i + 1] += dt * drift; if (weather[i + 1] < 0) weather[i + 1] = 15; if (weather[i + 1] > 15) weather[i + 1] = 0; }
      particles.geometry.attributes.position.needsUpdate = true;
      active.animate?.(dt);
    },
    dispose() { for (const set of sets.values()) { scene.remove(set.group); set.group.traverse(o => o.geometry?.dispose()); for (const m of set.owned) m.dispose(); } },
  };
}
