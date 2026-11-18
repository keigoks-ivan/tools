// 少量實體幾何與兩張交叉光暈，沒有動態光源或額外後製通道。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export function createCampaignSaber() {
  const group = new THREE.Group(); group.name = '蒼焰光劍';
  const steel = [], grip = [];
  const part = (list, geometry, color, x = 0, y = 0, z = 0) => {
    geometry.translate(x, y, z);
    const c = new THREE.Color(color), colors = new Float32Array(geometry.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) colors.set([c.r, c.g, c.b], i);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3)); list.push(geometry);
  };
  const cylinder = (list, top, bottom, height, y, color, sides = 12) => part(list, new THREE.CylinderGeometry(top, bottom, height, sides), color, 0, y, 0);
  cylinder(steel, .225, .24, 1.62, -.02, 0x526773);
  cylinder(steel, .29, .25, .22, -.86, 0x73838b);
  cylinder(steel, .28, .30, .10, -.96, 0x303d47);
  cylinder(grip, .243, .243, .95, -.12, 0x171e23);
  for (const y of [-.57, -.38, -.19, 0, .19, .38]) cylinder(steel, .252, .252, .035, y, 0x47565d);
  cylinder(steel, .32, .25, .18, .61, 0x9aabb3);
  cylinder(steel, .36, .32, .14, .76, 0x303f4b);
  // Hollow emitter: an inner wall and beveled rim around the plasma aperture.
  part(steel, new THREE.LatheGeometry([
    new THREE.Vector2(.27, .81), new THREE.Vector2(.43, 1.02), new THREE.Vector2(.39, 1.30),
    new THREE.Vector2(.29, 1.40), new THREE.Vector2(.215, 1.40), new THREE.Vector2(.20, 1.05),
    new THREE.Vector2(.27, .81),
  ], 12), 0x73838d);
  cylinder(grip, .205, .205, .18, 1.16, 0x080c11);
  for (const sign of [-1, 1]) {
    const guard = new THREE.BoxGeometry(.15, .59, .28).rotateZ(sign * .22);
    part(steel, guard, 0x354b59, sign * .36, 1.05, 0);
    part(grip, new THREE.BoxGeometry(.12, .07, .18), 0x11191e, sign * .34, 1.12, .15);
  }
  part(steel, new THREE.BoxGeometry(.18, .30, .075), 0x253541, 0, .29, .245);
  part(steel, new THREE.BoxGeometry(.105, .11, .025), 0xc36436, 0, .32, .294);
  const merge = (parts, material) => {
    const geometry = mergeGeometries(parts); parts.forEach(p => p.dispose());
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const metal = merge(steel, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .78, roughness: .29 }));
  const rubber = merge(grip, new THREE.MeshStandardMaterial({ vertexColors: true, metalness: .08, roughness: .76 }));
  // The blade endpoints match Combat.blade: hand-local Z = 1.9 .. 12.1.
  const rows = [[1.42, .065], [1.70, .14], [3.0, .15], [8.8, .13], [10.7, .08], [11.75, .001]];
  const positions = [], indices = [], colors = [], sides = 10;
  for (const [y, radius] of rows) for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2;
    positions.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius * .66);
    colors.push(4.5, 3.2, 3.8);
  }
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < sides; i++) {
    const a = j * sides + i, b = j * sides + (i + 1) % sides;
    indices.push(a, b, b + sides, a, b + sides, a + sides);
  }
  const blade = new THREE.BufferGeometry();
  blade.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  blade.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));blade.setIndex(indices);blade.computeVertexNormals();
  const core = new THREE.Mesh(blade, new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  core.name = '白熱刀芯'; core.userData.noAO = true; group.add(core);
  const planes = [new THREE.PlaneGeometry(1.45, 10.52).translate(0, 6.58, 0), new THREE.PlaneGeometry(1.45, 10.52).rotateY(Math.PI / 2).translate(0, 6.58, 0)];
  const haloGeometry = mergeGeometries(planes); planes.forEach(p => p.dispose());
  const halo = new THREE.Mesh(haloGeometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `varying vec2 vUv; void main(){
      float y=vUv.y;
      float taper=sqrt(max(0.0,1.0-smoothstep(0.77,1.0,y)));
      float width=(0.62+0.38*smoothstep(0.0,0.10,y))*taper;
      float x=abs(vUv.x-0.5)/max(width,0.003);
      float sheath=1.0-smoothstep(0.05,0.27,x);
      float haze=pow(max(0.0,1.0-x*2.0),3.0);
      float base=smoothstep(0.0,0.025,y);
      float alpha=(sheath*0.48+haze*0.28)*base;
      vec3 color=mix(vec3(1.8,0.08,0.42),vec3(2.8,0.7,1.6),sheath);
      gl_FragColor=vec4(color,alpha);
      #include <colorspace_fragment>
    }`,
  }));
  halo.name = '漸淡電漿外光'; halo.userData.noAO = true; group.add(halo);
  group.position.set(0, -.9, .35); group.rotation.x = Math.PI / 2; group.visible = false;
  return { group, solid: [metal, rubber], glow: [core, halo] };
}
