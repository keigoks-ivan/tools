import * as THREE from 'three';

const atlasURL = new URL('./fuji-skyline.webp?v=2', import.meta.url).href;
const radians = THREE.MathUtils.degToRad;

// The centre of the atlas has more pixels per degree for the snowy eastern face.
// Endpoints are bearings from Wakasu, with east along +X and south along +Z.
const spans = [[216,245,0,1/6],[245,261,1/6,5/6],[261,293,5/6,1]];
function horizonArc() {
  const radius = 7400, positions = [], uvs = [], indices = [];
  for (const [start,end,u0,u1] of spans) {
    const segments = Math.ceil(end-start);
    for (let i = 0; i <= segments; i++) {
      const t = i/segments, azimuth = radians(start+(end-start)*t);
      const index = positions.length/3;
      for (const v of [0,1]) {
        positions.push(radius*Math.sin(azimuth),radius*Math.tan(radians(-.45+2.7*v)),-radius*Math.cos(azimuth));
        uvs.push(u0+(u1-u0)*t,v);
      }
      if (i < segments) indices.push(index,index+2,index+1,index+1,index+2,index+3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));
  geometry.setIndex(indices);
  return geometry;
}

export function buildFuji(world,group) {
  // The texture includes photographic mountain detail, the DEM skyline mask
  // and the bay haze. See the Tokyo title credits for both photo licences.
  const material = new THREE.ShaderMaterial({
    uniforms: {panorama:{value:null}},
    vertexShader: `
      varying vec2 terrainUV;
      void main() {
        terrainUV = uv;
        vec3 point = (modelMatrix * vec4(position,1.0)).xyz;
        // The real summit is about 100 km away. Keep its parallax small as the pilot moves.
        gl_Position = projectionMatrix * viewMatrix * vec4(point + cameraPosition * .926,1.0);
      }`,
    fragmentShader: `
      uniform sampler2D panorama;
      varying vec2 terrainUV;
      void main() {
        gl_FragColor = texture2D(panorama,terrainUV);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent:true,depthWrite:false,
  });
  const mesh = new THREE.Mesh(horizonArc(),material);
  mesh.name = '東京湾からの富士山と丹沢山地';
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.userData.noAO = mesh.userData.fieldGeometry = mesh.userData.fieldMaterial = true;
  const atlas = new THREE.TextureLoader().load(atlasURL,() => { mesh.visible=true; });
  atlas.colorSpace = THREE.SRGBColorSpace;
  material.uniforms.panorama.value = atlas;
  material.addEventListener('dispose',() => atlas.dispose());
  group.add(mesh);
  return mesh;
}

// The Wakasu embarkation starts at (480, 60). Track a little along the
// waterfront so the near truss moves against the far, almost stationary peak.
export function frameFuji(camera, player, progress) {
  const t = THREE.MathUtils.smootherstep(progress, 0, 1);
  const x = player.pos.x + 150 - 12 * t, z = player.pos.z + 77 + 4 * t;
  const portrait = 1 - THREE.MathUtils.smoothstep(camera.aspect,.55,1);
  const y = 62 + 2*t;
  const bearing = radians(254.4-2.8*t + portrait*(.3+1.4*t));
  camera.position.set(x,y,z);
  camera.lookAt(x+Math.sin(bearing)*500,y+8-7*t,z-Math.cos(bearing)*500);
  // Open tight on the snow gullies, then widen to reveal the truss and harbour.
  camera.fov = THREE.MathUtils.lerp(6.2,14.5,t)/Math.min(1,Math.max(.72,camera.aspect));
  camera.updateProjectionMatrix();
}
