import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
      const { weather, frost, particles } = active;
      for (let i = 0; i < weather.length; i += 3) { weather[i + 1] += dt * (frost ? -0.8 : 0.9); if (weather[i + 1] < 0) weather[i + 1] = 15; if (weather[i + 1] > 15) weather[i + 1] = 0; }
      particles.geometry.attributes.position.needsUpdate = true;
    },
    dispose() { for (const set of sets.values()) { scene.remove(set.group); set.group.traverse(o => o.geometry?.dispose()); for (const m of set.owned) m.dispose(); } },
  };
}
