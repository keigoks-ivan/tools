// 每台機體兩個實例面；腳掌離地後淡出，所有機體共用一張 64 px 接觸遮罩。
import * as THREE from 'three';

let material;
function contactMaterial() {
  if (material) return material;
  const size = 64, data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = Math.abs((x + .5) / size * 2 - 1), v = Math.abs((y + .5) / size * 2 - 1);
    const edge = Math.hypot(Math.max(0, u - .48), Math.max(0, v - .57));
    data[(y * size + x) * 4 + 3] = Math.round(Math.exp(-edge * edge * 19) * Math.max(0, 1 - Math.max(u, v) ** 8) * 255);
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.minFilter = texture.magFilter = THREE.LinearFilter; texture.needsUpdate = true;
  material = new THREE.ShaderMaterial({
    uniforms: { contactMap: { value: texture } }, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    vertexShader: `attribute float contactOpacity; varying vec2 vUv; varying float vOpacity;
      void main(){vUv=uv;vOpacity=contactOpacity;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform sampler2D contactMap; varying vec2 vUv; varying float vOpacity;
      void main(){gl_FragColor=vec4(0.0,0.0,0.0,texture2D(contactMap,vUv).a*vOpacity);}`,
  });
  return material;
}

export function createFootContactShadows(root, feet) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3(), part = new THREE.Box3(), inverse = new THREE.Matrix4(), transform = new THREE.Matrix4();
  const soles = feet.map(foot => {
    box.makeEmpty(); inverse.copy(foot.matrixWorld).invert();
    foot.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.geometry.computeBoundingBox();
      transform.multiplyMatrices(inverse, mesh.matrixWorld);
      box.union(part.copy(mesh.geometry.boundingBox).applyMatrix4(transform));
    });
    const center = box.getCenter(new THREE.Vector3()); center.y = box.min.y;
    return { foot, center, width: box.max.x - box.min.x, length: box.max.z - box.min.z };
  });
  const geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const opacity = new THREE.InstancedBufferAttribute(new Float32Array(feet.length), 1).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('contactOpacity', opacity);
  const mesh = new THREE.InstancedMesh(geometry, contactMaterial(), feet.length);
  mesh.name = '腳底接觸陰影'; mesh.frustumCulled = false; mesh.userData.noAO = true; mesh.renderOrder = 1;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); root.add(mesh);
  const marker = new THREE.Object3D(), position = new THREE.Vector3(), forward = new THREE.Vector3();
  const scale = new THREE.Vector3(), rotation = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3(), slope = new THREE.Quaternion();
  let floor = root.position.y;
  function update(state = {}) {
    root.updateMatrixWorld(true); inverse.copy(root.matrixWorld).invert(); root.getWorldScale(scale);
    if (state.grounded) floor = root.position.y;
    let visible = false;
    for (const [i, sole] of soles.entries()) {
      const { foot, center, width, length } = sole;
      position.copy(center).applyMatrix4(foot.matrixWorld);
      const ground = state.groundAt ? state.groundAt(position.x, position.z) : floor;
      const gap = Number.isFinite(ground) ? Math.max(0, position.y - ground) : Infinity;
      const alpha = .62 * Math.exp(-gap * 2.8 / scale.y) * (1 - THREE.MathUtils.smoothstep(gap / scale.y, .8, 2.2));
      opacity.setX(i, alpha); visible ||= alpha > .003;
      if (alpha <= .003) continue;
      foot.getWorldQuaternion(rotation); forward.set(0, 0, 1).applyQuaternion(rotation);
      marker.position.set(position.x, ground + .012, position.z);
      marker.quaternion.setFromAxisAngle(up, Math.atan2(forward.x, forward.z));
      if (state.groundAt) {
        const dx = state.groundAt(position.x + .35, position.z) - ground;
        const dz = state.groundAt(position.x, position.z + .35) - ground;
        // 只貼合連續坡面，不把屋頂邊緣或階梯拉成一道黑牆。
        if (Number.isFinite(dx + dz) && Math.abs(dx) < .25 && Math.abs(dz) < .25) {
          normal.set(-dx / .35, 1, -dz / .35).normalize();
          slope.setFromUnitVectors(up, normal); marker.quaternion.premultiply(slope);
        }
      }
      const spread = 1.25 + gap / scale.y * .3;
      marker.scale.set(width * scale.x * spread, 1, length * scale.z * spread); marker.updateMatrix();
      mesh.setMatrixAt(i, transform.multiplyMatrices(inverse, marker.matrix));
    }
    mesh.visible = visible; opacity.needsUpdate = true; mesh.instanceMatrix.needsUpdate = true;
  }
  return { mesh, update };
}
