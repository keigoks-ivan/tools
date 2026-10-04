import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

test('北野保存漆面一張512atlas可重現，雨痕保留乾淨底色且接縫可循環',async t=>{
  const old=globalThis.document;delete globalThis.document;
  t.after(()=>{if(old!==undefined)globalThis.document=old;});
  const a=await import('../kobe-heritage.mjs?node-a'),b=await import('../kobe-heritage.mjs?node-b');
  const texture=a.kitanoHeritageAtlas(),image=texture.image,data=image.data;
  assert(texture.isDataTexture);assert.equal(image.width,512);assert.equal(image.height,512);
  assert.equal(data.byteLength,1024*1024);assert.equal(texture,a.kitanoHeritageAtlas());
  assert.deepEqual(data,b.kitanoHeritageAtlas().image.data);
  let min=255,max=0,sum=0;
  for(let y=2;y<254;y++)for(let x=2;x<254;x++) {
    const k=(y*512+x)*4,r=data[k];min=Math.min(min,r);max=Math.max(max,r);sum+=r;
    assert(data[k+1]>=220&&data[k+2]>=110&&data[k+2]<=145);
  }
  assert(min>=225&&max-min>=20&&sum/(252*252)>242,'漆面過度髒污或沒有老化細節');
  const pixel=(x,y)=>data.slice((y*512+x)*4,(y*512+x)*4+4);
  for(let tile=0;tile<4;tile++) {
    const ox=tile%2*256,oy=Math.floor(tile/2)*256;
    for(let q=0;q<256;q++) {
      assert.deepEqual(pixel(ox,q+oy),pixel(ox+252,q+oy));
      assert.deepEqual(pixel(ox+254,q+oy),pixel(ox+2,q+oy));
      assert.deepEqual(pixel(ox+q,oy),pixel(ox+q,oy+252));
      assert.deepEqual(pixel(ox+q,oy+254),pixel(ox+q,oy+2));
    }
  }
});

test('Canvas與無2D mock共用確定的atlas內容，材質不新增貼圖或非PBR發光',async t=>{
  const old=globalThis.document;let drawn;
  t.after(()=>{if(old===undefined)delete globalThis.document;else globalThis.document=old;});
  globalThis.document={createElement:()=>({getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:d=>{drawn=d.data;}})})};
  const canvas=await import('../kobe-heritage.mjs?canvas'),atlas=canvas.kitanoHeritageAtlas();
  assert(atlas.isCanvasTexture);assert.equal(atlas.image.width,512);assert.equal(drawn.length,512*512*4);
  globalThis.document={createElement:()=>({getContext:()=>null})};
  const fallback=await import('../kobe-heritage.mjs?null-canvas');
  assert.deepEqual(new Uint8Array(drawn),fallback.kitanoHeritageAtlas().image.data);
  for(const kind of ['paint','stone','brick','roof']) {
    const m=canvas.kitanoHeritageMaterial(kind);
    assert(m.isMeshStandardMaterial&&m.vertexColors);assert.equal(m.map,atlas);assert.equal(m,canvas.kitanoHeritageMaterial(kind));
    assert.equal(m.metalness,0);assert.equal(m.emissive.getHex(),0);assert.equal(m.color.getHex(),0xffffff);
    assert.equal(m.normalMap,null);assert.equal(m.bumpMap,null);assert.equal(m.roughnessMap,null);
    assert.equal(m.side,THREE.FrontSide);assert.equal(m.transparent,false);
  }
  assert.throws(()=>canvas.kitanoHeritageMaterial('ruin'),RangeError);
});

test('Three r166 Standard shader保留自然光陰影和霧，合併與實例漆面使用世界尺度',async()=>{
  const {kitanoHeritageMaterial}=await import('../kobe-heritage.mjs?shader'),m=kitanoHeritageMaterial();
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader};
  m.onBeforeCompile(shader);
  assert(shader.vertexShader.includes('instanceMatrix*heritagePosition'));
  assert(shader.vertexShader.includes('vHeritageWorld=(modelMatrix*heritagePosition).xyz'));
  for(const chunk of ['lights_fragment_begin','lights_fragment_maps','shadowmap_pars_fragment','fog_fragment','color_fragment'])assert(shader.fragmentShader.includes('#include <'+chunk+'>'));
  assert(shader.fragmentShader.indexOf('heritageSample=')<shader.fragmentShader.indexOf('float heritageH='));
  assert(shader.fragmentShader.includes('texture2D(map,heritageUV(heritagePlane+heritageDx)).b'));
  assert.deepEqual(shader.uniforms.heritageScale.value.toArray(),[2.4,2.4]);
  assert(shader.uniforms.heritageRelief.value<=.025);
  assert(!shader.fragmentShader.includes('uniform float time'));assert(!shader.fragmentShader.includes('discard;'));
  assert.notEqual(m.customProgramCacheKey(),kitanoHeritageMaterial('stone').customProgramCacheKey());
});
