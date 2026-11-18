import * as THREE from 'three';

const shell = new THREE.SphereGeometry(1, 32, 20);
const center = new THREE.Vector3();

export function createShieldField() {
  const uniforms = {
    age: { value: 0 }, integrity: { value: 1 },
    pulse: { value: 0 }, strike: { value: new THREE.Vector3(0, 0, 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, side: THREE.DoubleSide, forceSinglePass: true, transparent: true, depthWrite: false,
    vertexShader: `
      varying vec3 fieldPoint, viewNormal, viewDirection;
      void main() {
        fieldPoint = position;
        viewNormal = normalMatrix * normal;
        vec4 viewPoint = modelViewMatrix * vec4(position, 1.0);
        viewDirection = -viewPoint.xyz;
        gl_Position = projectionMatrix * viewPoint;
      }`,
    fragmentShader: `
      uniform float age, integrity, pulse;
      uniform vec3 strike;
      varying vec3 fieldPoint, viewNormal, viewDirection;
      void main() {
        vec3 point = normalize(fieldPoint);
        float rim = pow(1.0 - clamp(abs(dot(normalize(viewNormal), normalize(viewDirection))), 0.0, 1.0), 3.0);
        float bands = point.y * 8.0 - age * 0.75;
        float lines = 1.0 - smoothstep(0.025, max(0.065, fwidth(bands)), abs(fract(bands) - 0.5));
        float crack = 1.0 - smoothstep(0.0, 0.45, integrity);
        float wavefront = length(point - strike) - (1.0 - pulse) * 1.65;
        float wave = exp(-60.0 * wavefront * wavefront) * pulse;
        float deploy = smoothstep(0.0, 0.15, age);
        vec3 tint = mix(vec3(0.13, 0.78, 1.0), vec3(1.0, 0.42, 0.12), crack * 0.85);
        float opacity = deploy * (0.03 + rim * 0.32 + lines * (0.025 + rim * 0.13) + wave * 0.46);
        gl_FragColor = vec4(tint * (0.8 + rim * 0.55) + vec3(wave * 0.65), opacity);
      }`,
  });
  const mesh = new THREE.Mesh(shell, material);
  mesh.name = '蒼焰防護罩';
  mesh.position.y = 8.9;
  mesh.scale.set(11.2, 10.5, 12.5);
  mesh.userData.noAO = true;
  mesh.visible = false;
  function update(dt, active, integrity) {
    mesh.visible = active;
    if (!active) {
      uniforms.age.value = uniforms.pulse.value = 0;
      return;
    }
    uniforms.age.value += dt;
    uniforms.integrity.value = integrity;
    uniforms.pulse.value = Math.max(0, uniforms.pulse.value - dt * 3.2);
  }
  function hit(from) {
    mesh.getWorldPosition(center);
    if (center.distanceToSquared(from) > 1e-6) mesh.worldToLocal(uniforms.strike.value.copy(from)).normalize();
    uniforms.pulse.value = 1;
  }
  return { mesh, update, hit };
}
