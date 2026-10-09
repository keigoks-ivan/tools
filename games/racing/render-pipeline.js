import * as THREE from 'three';

const vertexShader = `varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`;
// Half-resolution, depth-aware ambient occlusion. No additional world draw or
// normal buffer is required; low quality retains the direct rendering path.
const occlusionShader = `
  varying vec2 vUv; uniform sampler2D depthMap; uniform mat4 inverseProjection;
  uniform vec2 resolution; uniform float projectionScale; uniform vec3 viewUp; uniform mat4 viewToWorld; uniform float roadLevel;
  vec3 positionAt(vec2 uv){float d=texture2D(depthMap,uv).r;vec4 p=inverseProjection*vec4(uv*2.-1.,d*2.-1.,1.);return p.xyz/p.w;}
  void main(){
    float depth=texture2D(depthMap,vUv).r;
    if(depth>.99999){gl_FragColor=vec4(1.);return;}
    vec3 p=positionAt(vUv);
    // Large road planes use their authored contact shadows. Depth precision
    // over kilometres is insufficient for stable floor occlusion at .05m near.
    if((viewToWorld*vec4(p,1.)).y<roadLevel+1.2){gl_FragColor=vec4(1.,1.,1.,clamp(-p.z/2500.,0.,1.));return;}
    vec2 px=1./resolution;
    vec3 dxA=positionAt(vUv+vec2(px.x,0.))-p,dxB=p-positionAt(vUv-vec2(px.x,0.));
    vec3 dyA=positionAt(vUv+vec2(0.,px.y))-p,dyB=p-positionAt(vUv-vec2(0.,px.y));
    vec3 n=cross(abs(dxA.z)<abs(dxB.z)?dxA:dxB,abs(dyA.z)<abs(dyB.z)?dyA:dyB); n/=max(length(n),.00000001);
    if(dot(n,-p)<0.)n=-n;
    if(abs(dot(n,viewUp))>.65){gl_FragColor=vec4(1.,1.,1.,clamp(-p.z/2500.,0.,1.));return;}
    float radius=2.4, total=0., angle=6.2831853*fract(dot(floor(vUv*resolution),vec2(.06711,.005837)));
    vec2 screenRadius=vec2(projectionScale/resolution.x,projectionScale/resolution.y)*radius/max(2.,-p.z);
    screenRadius=min(screenRadius,vec2(.055));
    for(int i=0;i<12;i++){
      float t=(float(i)+.5)/12.,a=angle+float(i)*2.399963;
      vec2 uv=vUv+vec2(cos(a),sin(a))*screenRadius*sqrt(t);
      if(uv.x<0.||uv.x>1.||uv.y<0.||uv.y>1.)continue;
      vec3 delta=positionAt(uv)-p;float distanceToPoint=length(delta);
      float facing=max(0.,dot(n,delta/max(distanceToPoint,.001))-.12);
      total+=facing*(1.-smoothstep(.1,radius,distanceToPoint));
    }
    float ao=clamp(1.-total*.18*(1.-smoothstep(60.,140.,-p.z)),.72,1.);
    gl_FragColor=vec4(ao,ao,ao,clamp(-p.z/2500.,0.,1.));
  }`;
const compositeShader = `
  varying vec2 vUv; uniform sampler2D colorMap; uniform sampler2D depthMap; uniform sampler2D aoMap;
  uniform vec2 texel; uniform vec2 aoTexel; uniform float useAO; uniform vec2 cameraRange;
  float luma(vec3 c){return dot(c,vec3(.2126,.7152,.0722));}
  void main(){
    vec3 center=texture2D(colorMap,vUv).rgb;
    vec3 n=texture2D(colorMap,vUv+vec2(0.,texel.y)).rgb,s=texture2D(colorMap,vUv-vec2(0.,texel.y)).rgb;
    vec3 e=texture2D(colorMap,vUv+vec2(texel.x,0.)).rgb,w=texture2D(colorMap,vUv-vec2(texel.x,0.)).rgb;
    float low=min(luma(center),min(min(luma(n),luma(s)),min(luma(e),luma(w))));
    float high=max(luma(center),max(max(luma(n),luma(s)),max(luma(e),luma(w))));
    float edge=smoothstep(.04,.18,(high-low)/max(.15,high));
    vec3 color=mix(center,(center*4.+n+s+e+w)/8.,edge*.42);
    float depth=texture2D(depthMap,vUv).r,ao=1.;
    float linearDepth=cameraRange.x*cameraRange.y/(cameraRange.y-depth*(cameraRange.y-cameraRange.x))/2500.;
    if(useAO>.5 && depth<.99999){
      float weight=0.,sum=0.;
      for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++){
        vec4 sampleAO=texture2D(aoMap,vUv+vec2(float(x),float(y))*aoTexel);
        float valid=exp(-abs(sampleAO.a-linearDepth)*900.);
        sum+=sampleAO.r*valid;weight+=valid;
      }
      ao=weight>1e-5?sum/weight:1.;
    }
    color*=mix(1.,ao,.88);
    float luminance=luma(color);
    color=mix(vec3(luminance),color,1.04);
    // Gentle warm highlights, cooler shadow fill and optical edge falloff.
    color*=mix(vec3(.97,1.002,1.025),vec3(1.025,1.01,.985),smoothstep(.12,.8,luminance));
    vec2 lens=(vUv-.5)*vec2(1.,.8);color*=1.-dot(lens,lens)*.11;
    gl_FragColor=vec4(color,1.);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;

export function createRenderPipeline(renderer, { mobile = false } = {}) {
  const target = new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthBuffer:true});
  target.samples = Math.min(mobile ? 2 : 4, renderer.capabilities.maxSamples);
  target.depthTexture = new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  target.depthTexture.minFilter=target.depthTexture.magFilter=THREE.NearestFilter;
  const aoTarget=new THREE.WebGLRenderTarget(1,1,{depthBuffer:false,type:THREE.HalfFloatType});
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1),geometry=new THREE.PlaneGeometry(2,2);
  const aoMaterial=new THREE.ShaderMaterial({uniforms:{depthMap:{value:target.depthTexture},inverseProjection:{value:new THREE.Matrix4()},resolution:{value:new THREE.Vector2(1,1)},projectionScale:{value:1},viewUp:{value:new THREE.Vector3(0,1,0)},viewToWorld:{value:new THREE.Matrix4()},roadLevel:{value:0}},vertexShader,fragmentShader:occlusionShader,depthTest:false,depthWrite:false,toneMapped:false});
  const finalMaterial=new THREE.ShaderMaterial({uniforms:{colorMap:{value:target.texture},depthMap:{value:target.depthTexture},aoMap:{value:aoTarget.texture},texel:{value:new THREE.Vector2(1,1)},aoTexel:{value:new THREE.Vector2(1,1)},useAO:{value:0},cameraRange:{value:new THREE.Vector2(.05,4200)}},vertexShader,fragmentShader:compositeShader,depthTest:false,depthWrite:false});
  const quad=new THREE.Mesh(geometry,finalMaterial);quad.frustumCulled=false;scene.add(quad);
  let quality=mobile?'medium':'high',width=1,height=1,disposed=false;
  function resize(w,h){
    width=Math.max(1,Math.floor(w));height=Math.max(1,Math.floor(h));target.setSize(width,height);
    const aoWidth=Math.max(1,Math.ceil(width/2)),aoHeight=Math.max(1,Math.ceil(height/2));aoTarget.setSize(aoWidth,aoHeight);
    aoMaterial.uniforms.resolution.value.set(width,height);finalMaterial.uniforms.texel.value.set(1/width,1/height);finalMaterial.uniforms.aoTexel.value.set(1/aoWidth,1/aoHeight);
  }
  return {
    resize,
    setQuality(level){quality=level;finalMaterial.uniforms.useAO.value=level==='high'&&!mobile?1:0;},
    render(world,camera3d,roadLevel=0){
      if(disposed)return;
      if(quality==='low'){renderer.render(world,camera3d);return;}
      finalMaterial.uniforms.cameraRange.value.set(camera3d.near,camera3d.far);
      const previous=renderer.getRenderTarget();renderer.setRenderTarget(target);renderer.render(world,camera3d);
      if(finalMaterial.uniforms.useAO.value){
        aoMaterial.uniforms.viewToWorld.value.copy(camera3d.matrixWorld);
        aoMaterial.uniforms.roadLevel.value=roadLevel;
        aoMaterial.uniforms.viewUp.value.set(0,1,0).transformDirection(camera3d.matrixWorldInverse);
        aoMaterial.uniforms.inverseProjection.value.copy(camera3d.projectionMatrixInverse);
        aoMaterial.uniforms.projectionScale.value=camera3d.projectionMatrix.elements[5]*height*.5;
        quad.material=aoMaterial;renderer.setRenderTarget(aoTarget);renderer.render(scene,camera);
      }
      quad.material=finalMaterial;renderer.setRenderTarget(previous);renderer.render(scene,camera);
    },
    dispose(){if(disposed)return;disposed=true;target.dispose();aoTarget.dispose();target.depthTexture.dispose();geometry.dispose();aoMaterial.dispose();finalMaterial.dispose();},
  };
}
