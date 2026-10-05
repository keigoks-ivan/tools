// SKYGLAZE v2 mockups — shared globe renderer + 2D overlay helpers.
// Textures: NASA Blue Marble NG / Black Marble (NASA Earth Observatory), Natural Earth 50m (public domain).
import * as THREE from '/game/lib/three.module.js';

const D2R = Math.PI / 180;
export function ll(lat, lon, r = 1) {
  const c = Math.cos(lat * D2R);
  return new THREE.Vector3(r * c * Math.cos(lon * D2R), r * Math.sin(lat * D2R), -r * c * Math.sin(lon * D2R));
}
const load = url => new Promise((res, rej) => new THREE.TextureLoader().load(url, t => res(t), undefined, rej));

const VERT = `
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){ vUv=uv; vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;

const FRAG_PAPER = `
uniform sampler2D bm; uniform sampler2D mask; uniform vec3 sun; uniform vec3 camPos;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
vec3 srgb(vec3 c){ return c; }
void main(){
  vec3 m = texture2D(mask, vUv).rgb; vec3 c = texture2D(bm, vUv).rgb;
  float lum = dot(c, vec3(.3,.59,.11));
  // ocean: pale sky blue, deeper water slightly stronger blue
  float shallow = smoothstep(0.10, 0.36, lum);
  vec3 deep = vec3(0.640, 0.776, 0.906);   // ~ #A3C6E7
  vec3 shelf = vec3(0.835, 0.902, 0.960);  // ~ #D5E6F5
  vec3 ocean = mix(deep, shelf, shallow);
  // graticule every 10 deg
  vec2 g = vec2(vUv.x*36.0, vUv.y*18.0);
  vec2 gf = abs(fract(g)-0.5); float gl = 1.0 - smoothstep(0.0, 0.006, min(gf.x*0.5, gf.y));
  ocean = mix(ocean, vec3(0.93,0.96,0.99), gl*0.16);
  // land: warm paper with a hint of real colour and relief
  vec3 paper = vec3(0.975, 0.958, 0.915);
  vec3 tint = mix(vec3(lum), c, 0.85);
  vec3 landc = mix(paper, tint*0.9 + 0.38, 0.22);
  landc *= 0.965 + 0.22*(lum-0.30);
  float landA = smoothstep(0.35, 0.65, m.r);
  vec3 col = mix(ocean, landc, landA);
  col = mix(col, vec3(0.50,0.66,0.82), m.g*0.55);          // coastline
  col = mix(col, vec3(0.70,0.74,0.80), m.b*0.45*landA);     // borders
  // soft daylight shading
  vec3 n = normalize(vN); float ndl = dot(n, normalize(sun));
  col *= 0.80 + 0.22*smoothstep(-0.4, 1.0, ndl);
  // haze toward the limb
  vec3 v = normalize(camPos - vW); float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  col = mix(col, vec3(0.92,0.955,0.99), fr*0.6);
  gl_FragColor = vec4(col, 1.0);
}`;

const FRAG_PHOTO = `
uniform sampler2D bm; uniform sampler2D mask; uniform sampler2D night; uniform vec3 sun; uniform vec3 camPos;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 m = texture2D(mask, vUv).rgb; vec3 day = texture2D(bm, vUv).rgb; vec3 nt = texture2D(night, vUv).rgb;
  vec3 n = normalize(vN); vec3 L = normalize(sun); vec3 v = normalize(camPos - vW);
  float ndl = dot(n, L);
  float dayAmt = smoothstep(-0.12, 0.22, ndl);
  day = pow(day, vec3(0.92)) * 1.12;
  vec3 dcol = day * (0.25 + 0.95*max(ndl, 0.0));
  // ocean glint
  float ocean = 1.0 - smoothstep(0.3, 0.7, m.r);
  vec3 h = normalize(L + v); float spec = pow(max(dot(n, h), 0.0), 400.0) * ocean * 0.18;
  dcol += vec3(1.0,0.93,0.80) * spec;
  // night lights, warm
  float lights = dot(nt, vec3(.3,.59,.11));
  vec3 ncol = vec3(0.012,0.025,0.055) + vec3(1.0,0.78,0.45) * pow(lights, 1.6) * 1.7;
  ncol += vec3(0.20,0.30,0.45) * m.g * 0.18;   // faint coastline on the dark side
  vec3 col = mix(ncol, dcol, dayAmt);
  // twilight band
  float tw = exp(-pow(ndl*7.0, 2.0)); col += vec3(0.55,0.28,0.10)*tw*0.12;
  // atmosphere on the disc
  float fr = pow(1.0 - max(dot(n, v), 0.0), 2.5);
  col = mix(col, vec3(0.45,0.68,1.0)*(0.15+0.8*max(ndl+0.2,0.0)), fr*0.45);
  gl_FragColor = vec4(col, 1.0);
}`;

const ATM_FRAG = `
uniform vec3 color; uniform vec3 camPos; uniform vec3 sun; uniform float power; uniform float strength; uniform float sunDep; uniform float ratm;
varying vec2 vUv; varying vec3 vN; varying vec3 vW;
void main(){
  vec3 n = normalize(vN); vec3 d = normalize(vW - camPos);
  float b = length(cross(camPos, d));               // closest approach of the view ray to the centre
  float k = clamp((ratm - b) / (ratm - 1.0), 0.0, 1.0);
  float rim = pow(k, power);
  float lit = mix(1.0, 0.15 + 1.0*max(dot(n, normalize(sun))+0.35, 0.0), sunDep);
  gl_FragColor = vec4(color, rim*strength*lit);
}`;

export async function makeGlobe({ canvas, width, height, dpr = 1, style = 'paper', camPos, lookAt, fov = 30, sun = [20, 150], up = null, bg = null, shift = [0, 0] }) {
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(dpr); r.setSize(width, height, false); r.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(fov, width / height, 0.01, 100);
  cam.position.copy(ll(camPos[0], camPos[1], camPos[2]));
  if (up) cam.up.copy(up);
  cam.lookAt(ll(lookAt[0], lookAt[1], lookAt[2] ?? 1));
  if (shift[0] || shift[1]) cam.setViewOffset(width, height, -shift[0], -shift[1], width, height);
  cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const [bm, mask] = await Promise.all([load('./tex/bm_4k.jpg'), load(style === 'paper' ? './tex/mask_8k.png' : './tex/mask_4k.png')]);
  for (const t of [bm, mask]) { t.anisotropy = 8; t.minFilter = THREE.LinearMipmapLinearFilter; }
  const sunV = ll(sun[0], sun[1], 1);
  const uni = { bm: { value: bm }, mask: { value: mask }, sun: { value: sunV }, camPos: { value: cam.position.clone() } };
  if (style === 'photo') { const nt = await load('./tex/blackmarble.jpg'); nt.anisotropy = 8; uni.night = { value: nt }; }
  const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: style === 'paper' ? FRAG_PAPER : FRAG_PHOTO, uniforms: uni });
  const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 128), mat);
  scene.add(globe);
  const ratm = style === 'paper' ? 1.07 : 1.05;
  const atm = new THREE.Mesh(new THREE.SphereGeometry(ratm, 128, 64), new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: ATM_FRAG, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.NormalBlending,
    uniforms: { color: { value: new THREE.Color(style === 'paper' ? 0xf4f9ff : 0x5aa0ff) }, camPos: uni.camPos, sun: { value: sunV }, power: { value: style === 'paper' ? 2.2 : 2.6 }, strength: { value: style === 'paper' ? 0.9 : 0.85 }, sunDep: { value: style === 'paper' ? 0.0 : 1.0 }, ratm: { value: ratm } }
  }));
  scene.add(atm);
  r.render(scene, cam);

  function project(lat, lon, alt = 0) {
    const p = ll(lat, lon, 1 + alt);
    // occlusion: ray from camera to p hits sphere first?
    const c = cam.position, d = p.clone().sub(c);
    const a = d.dot(d), b = 2 * c.dot(d), cc = c.dot(c) - 1, disc = b * b - 4 * a * cc;
    let visible = true;
    if (disc > 0) { const t = (-b - Math.sqrt(disc)) / (2 * a); if (t > 0 && t < 0.999) visible = false; }
    const q = p.clone().project(cam);
    return { x: (q.x + 1) / 2 * width, y: (1 - q.y) / 2 * height, visible: visible && q.z < 1, depth: p.distanceTo(c) };
  }
  return { renderer: r, scene, camera: cam, project, THREE };
}

// ---------- great-circle helpers ----------
export function gcPoints(a, b, n = 96, hScale = 0.12) {
  const va = ll(a.lat, a.lon), vb = ll(b.lat, b.lon);
  const ang = va.angleTo(vb), out = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, s = Math.sin(ang);
    const v = va.clone().multiplyScalar(Math.sin((1 - t) * ang) / s).add(vb.clone().multiplyScalar(Math.sin(t * ang) / s)).normalize();
    const lat = Math.asin(v.y) / D2R, lon = Math.atan2(-v.z, v.x) / D2R;
    out.push({ lat, lon, alt: hScale * ang * Math.sin(Math.PI * t), t });
  }
  return out;
}

// top-down aircraft sprite rendered from the flight-sim model
export async function aircraftSprite({ size = 256, light = false } = {}) {
  const mod = light ? await import('/games/flight/aircraft.light.js') : await import('/games/flight/aircraft.js');
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setClearColor(0, 0); r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xeaf3ff, 0x9aa8b8, 2.2));
  const sunL = new THREE.DirectionalLight(0xfff2dd, 2.2); sunL.position.set(-20, 60, -15); scene.add(sunL);
  const jet = light ? mod.createLightAircraft(THREE) : mod.createAircraft(THREE);
  scene.add(jet.group);
  const st = { gear: false, gearPosition: 0, flaps: 0, flapPosition: 0, throttle: .6, engine: .6, lights: false };
  try { for (let i = 0; i < 5; i++) jet.update({ ...st, dt: 1 / 30 }, { gear: false, gearPosition: 0, flaps: 0, flapPosition: 0, dt: 1 / 30, onGround: false, groundSpeed: 0, lights: false }); } catch (e) { }
  const box = new THREE.Box3().setFromObject(jet.group); const sz = box.getSize(new THREE.Vector3()); const ctr = box.getCenter(new THREE.Vector3());
  const span = Math.max(sz.x, sz.z) * 1.04;
  const cam = new THREE.OrthographicCamera(-span / 2, span / 2, span / 2, -span / 2, 0.1, 400);
  cam.position.set(ctr.x, ctr.y + 150, ctr.z); cam.up.set(0, 0, -1); cam.lookAt(ctr.x, ctr.y, ctr.z);
  r.render(scene, cam);
  return cv;
}

// ---------- 2D drawing helpers ----------
export function drawPath(ctx, pts) { ctx.beginPath(); let pen = false; for (const p of pts) { if (!p.visible) { pen = false; continue; } if (!pen) { ctx.moveTo(p.x, p.y); pen = true; } else ctx.lineTo(p.x, p.y); } }
export function fmtUSD(v) {
  const a = Math.abs(v), s = v < 0 ? '−' : '+';
  if (a >= 1e8) return `${s}US$ ${(a / 1e8).toFixed(2)} 億`;
  if (a >= 1e4) return `${s}US$ ${(a / 1e4).toFixed(a >= 1e5 ? 0 : 1)} 萬`;
  return `${s}US$ ${Math.round(a).toLocaleString('en-US')}`;
}
