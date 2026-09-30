// 後製：HDR MSAA → 世界 → 駕駛艙 → Bloom → 最後一趟（光暈＋ACES＋鏡頭效果：暗角、色差、顆粒、中彈震盪、衝刺模糊）
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const MonitorShader = {
  uniforms: {
    tDiffuse: { value: null },
    tBloom: { value: null },   // 光暈（在這裡直接加，不再另外疊一遍）
    bloomK: { value: 1 },
    toneMappingExposure: { value: 1 },
    time: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) },
    vignette: { value: 0.32 },
    aberration: { value: 0.00045 },
    grain: { value: 0.014 },
    damage: { value: 0 },      // 受擊雜訊 0..1
    boot: { value: 1 },        // 開機 0..1
    overdrive: { value: 0 },   // 覺醒色調
    danger: { value: 0 },      // 低耐久紅邊
    speed: { value: 0 },       // 衝刺徑向模糊
    flash: { value: 0 },       // 爆炸白閃
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse, tBloom; uniform float time, vignette, aberration, grain, damage, boot, overdrive, danger, speed, flash, bloomK;
    uniform vec2 res; varying vec2 vUv;
    #include <tonemapping_pars_fragment>
    // 取一點：畫面＋光暈 → ACES 色調 → sRGB（原本各自整張重畫一遍，合在這裡做）
    vec3 hdr(vec2 u){ vec4 b = texture2D(tBloom, u); return sRGBTransferOETF(vec4(ACESFilmicToneMapping(texture2D(tDiffuse, u).rgb + b.rgb * b.a * bloomK), 1.0)).rgb; }
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 c = uv - 0.5;
      float r2 = dot(c, c);
      // 衝刺徑向模糊
      vec3 col = vec3(0.0);
      float ab = aberration * (1.0 + damage * 6.0) + speed * 0.002;
      if (speed > 0.01) {
        for (int i = 0; i < 6; i++) {
          float k = float(i) / 5.0;
          vec2 u = 0.5 + c * (1.0 - speed * 0.035 * k * (0.3 + r2 * 3.0));
          col.r += hdr(0.5 + (u - 0.5) * (1.0 + ab)).r;
          col.g += hdr(u).g;
          col.b += hdr(0.5 + (u - 0.5) * (1.0 - ab)).b;
        }
        col /= 6.0;
      } else {
        col.r = hdr(0.5 + c * (1.0 + ab * r2 * 4.0)).r;
        col.g = hdr(uv).g;
        col.b = hdr(0.5 + c * (1.0 - ab * r2 * 4.0)).b;
      }
      // 調色：陰影偏青、亮部偏暖
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, col * vec3(0.93, 1.0, 1.06), (1.0 - smoothstep(0.0, 0.45, l)) * 0.5);
      col = mix(col, col * vec3(1.05, 1.0, 0.94), smoothstep(0.5, 1.0, l) * 0.4);
      col = mix(vec3(l), col, 1.06);
      // 覺醒：紅色調
      col = mix(col, vec3(l * 1.25, l * 0.35, l * 0.4) + col * 0.35, overdrive * 0.45);
      // 暗角
      col *= 1.0 - smoothstep(0.18, 0.95, r2 * 1.6) * vignette;
      // 危險：紅邊
      col = mix(col, vec3(0.8, 0.02, 0.02), smoothstep(0.12, 0.5, r2) * danger * (0.55 + 0.45 * sin(time * 7.0)));
      // 中彈：一瞬間變灰、變暗（像被震了一下）
      col = mix(col, vec3(l) * 0.8, damage * 0.5);
      // 顆粒
      float g = h(uv * res + fract(time * 13.7) * 91.0) - 0.5;
      col += g * grain * (0.6 + damage * 3.0);
      col += flash;
      // 開機：一開始全黑（之後由駕駛艙的擋板負責）
      col *= smoothstep(0.0, 0.06, boot);
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class Post {
  constructor(renderer, worldScene, camera, cockpitScene, cockpitCam) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(1);
    this.world = new RenderPass(worldScene, camera);
    // 環境光遮蔽（半解析度）：透明的煙、只投影不顯示的機身不算
    this.gtao = new GTAOPass(worldScene, camera, size.x / 2, size.y / 2, undefined,
      { radius: 7, distanceExponent: 1.4, thickness: 6, scale: 1.25, samples: 12, distanceFallOff: 0.6, screenSpaceRadius: false },
      { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    const ov = this.gtao.overrideVisibility.bind(this.gtao);
    this.gtao.overrideVisibility = function () {
      ov();
      this.scene.traverse((o) => {
        const m = o.material;
        if (o.userData.noAO || (m && (m.transparent || m.colorWrite === false || m.isShaderMaterial))) o.visible = false;
      });
    };
    // 環境光遮蔽要重畫一次整座城（只要深度＋法線），這時太陽影子不必再算一遍——剛剛畫城市時已經算好了
    // 算好的 AO 直接乘到畫面上；內建做法會先把整張畫面複製一遍再乘，白花一趟
    this.gtao.output = GTAOPass.OUTPUT.Off;
    this.gtao.needsSwap = false;
    const gr = this.gtao.render.bind(this.gtao);
    this.gtao.render = (r, wb, rb, dt, mask) => {
      const au = r.shadowMap.autoUpdate;
      r.shadowMap.autoUpdate = false;
      try { gr(r, wb, rb, dt, mask); } finally { r.shadowMap.autoUpdate = au; }
      const g = this.gtao, m = g.blendMaterial;
      m.uniforms.intensity.value = g.blendIntensity;
      m.uniforms.tDiffuse.value = g.pdRenderTarget.texture;
      g.renderPass(r, m, rb);
    };
    const gs = this.gtao.setSize.bind(this.gtao);
    this.gtao.setSize = (w, h) => gs(Math.round(w / 2), Math.round(h / 2));
    this.gtao.blendIntensity = 1.0;
    // AO 隨距離淡出（遠處被霧蓋住，不該再被壓暗）
    const bm = this.gtao.blendMaterial;
    bm.uniforms.tDepth = { value: this.gtao.depthTexture };
    bm.uniforms.cNear = { value: camera.near };
    bm.uniforms.cFar = { value: camera.far };
    bm.fragmentShader = `
      #include <packing>
      uniform float intensity, cNear, cFar; uniform sampler2D tDiffuse, tDepth; varying vec2 vUv;
      void main() {
        vec4 texel = texture2D(tDiffuse, vUv);
        float d = texture2D(tDepth, vUv).x;
        float z = -perspectiveDepthToViewZ(d, cNear, cFar);
        float k = intensity * (1.0 - smoothstep(250.0, 900.0, z));
        gl_FragColor = vec4(mix(vec3(1.0), texel.rgb, k), texel.a);
      }`;
    bm.needsUpdate = true;
    this.cockpit = new RenderPass(cockpitScene, cockpitCam);
    this.cockpit.clear = false;
    this.cockpit.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.55, 0.55, 1.4);
    // 保險：畫面上只要有一顆壞掉的像素（NaN），光暈會把它糊成一大塊黑；在光暈入口把壞值換成 0
    const hp = this.bloom.materialHighPassFilter, hpA = 'vec4 texel = texture2D( tDiffuse, vUv );';
    if (hp.fragmentShader.includes(hpA)) hp.fragmentShader = hp.fragmentShader.replace(hpA, hpA + ' if ( any( isnan( texel ) ) || !( dot( abs( texel ), vec4( 1.0 ) ) < 1e20 ) ) texel = vec4( 0.0 );');
    // 光暈算好後不疊回畫面（那要整張重畫一遍），留給最後一趟直接加
    const bq = this.bloom.fsQuad, bqr = bq.render.bind(bq);
    bq.render = (r) => { if (bq.material !== this.bloom.blendMaterial) bqr(r); };
    this.monitor = new ShaderPass(MonitorShader);
    this.monitor.material.toneMapped = false;   // 色調在 shader 裡自己做
    this.composer.addPass(this.world);
    this.composer.addPass(this.gtao);
    this.composer.addPass(this.cockpit);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.monitor);
    this.u = this.monitor.uniforms;
    this.u.tBloom.value = this.bloom.renderTargetsHorizontal[0].texture;
  }
  setSize(w, h) {
    const s = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.composer.setSize(s.x, s.y);
    this.u.res.value.set(s.x, s.y);
  }
  setQuality(q) {
    const samples = [0, 2, 4][q];
    for (const rt of [this.composer.renderTarget1, this.composer.renderTarget2]) {
      if (rt.samples !== samples) { rt.samples = samples; rt.dispose(); }
    }
  }
  render(t) {
    this.gtao.blendMaterial.uniforms.cNear.value = this.world.camera.near;
    this.gtao.blendMaterial.uniforms.cFar.value = this.world.camera.far;
    this.u.time.value = t;
    this.u.bloomK.value = this.bloom.enabled ? 1 : 0;
    this.u.toneMappingExposure.value = this.renderer.toneMappingExposure;
    this.composer.render();
  }
}
