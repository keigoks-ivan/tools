import * as THREE from '../../lib/three.module.js';

const box = new THREE.BoxGeometry();
const cylinder = new THREE.CylinderGeometry(.5, .5, 1, 10);
const direction = new THREE.Vector3(0, 1, 0);

export function beveledProfile(points, depth, bevel) {
  const outline = new THREE.Shape();
  outline.moveTo(...points[0]);
  for (const p of points.slice(1)) outline.lineTo(...p);
  outline.closePath();
  return new THREE.ExtrudeGeometry(outline, {
    depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, steps: 1,
  }).translate(0, 0, -depth / 2);
}

export class MeshBatch {
  constructor() {
    this.position = []; this.normal = []; this.color = []; this.index = [];
    this.matrix = new THREE.Matrix4(); this.normalMatrix = new THREE.Matrix3();
    this.p = new THREE.Vector3(); this.n = new THREE.Vector3(); this.s = new THREE.Vector3();
    this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.tint = new THREE.Color();
  }
  shape(geometry, color, x, y, z, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
    this.q.setFromEuler(this.e.set(rx, ry, rz));
    this._append(geometry, color, this.p.set(x, y, z), this.s.set(sx, sy, sz), this.q);
  }
  box(x, y, z, w, h, d, color, rx = 0, ry = 0, rz = 0) {
    this.shape(box, color, x, y, z, w, h, d, rx, ry, rz);
  }
  cylinder(x, y, z, width, height, color, rx = 0, ry = 0, rz = 0) {
    this.shape(cylinder, color, x, y, z, width, height, width, rx, ry, rz);
  }
  beam(a, b, thickness, color, round = false) {
    this.n.set(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
    const length = this.n.length();
    if (!length) return;
    this.q.setFromUnitVectors(direction, this.n.divideScalar(length));
    this.p.set((a[0]+b[0])/2, (a[1]+b[1])/2, (a[2]+b[2])/2);
    this._append(round ? cylinder : box, color, this.p, this.s.set(thickness, length, thickness), this.q);
  }
  _append(geometry, color, position, scale, rotation) {
    this.matrix.compose(position, rotation, scale);
    this.normalMatrix.getNormalMatrix(this.matrix);
    this.tint.set(color);
    const vertex = geometry.getAttribute('position'), normal = geometry.getAttribute('normal'), index = geometry.getIndex();
    const offset = this.position.length / 3;
    for (let i = 0; i < vertex.count; i++) {
      this.p.fromBufferAttribute(vertex, i).applyMatrix4(this.matrix);
      this.n.fromBufferAttribute(normal, i).applyNormalMatrix(this.normalMatrix);
      this.position.push(this.p.x, this.p.y, this.p.z);
      this.normal.push(this.n.x, this.n.y, this.n.z);
      this.color.push(this.tint.r, this.tint.g, this.tint.b);
    }
    if (index) for (let i = 0; i < index.count; i++) this.index.push(offset + index.getX(i));
    else for (let i = 0; i < vertex.count; i++) this.index.push(offset + i);
  }
  mesh(material) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.position, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normal, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.color, 3));
    geometry.setIndex(this.index);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    return mesh;
  }
}
