import * as THREE from 'three';

// Match the reflection to the pre-blended panorama used by the sky.
export const ridgeU='uv.x*2.+.82';

export function quarryPines(root,floor,bindTexture){
  const points=[],uv=[],colors=[],indices=[];
  let seed=3429;
  const rand=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  const groves=[[-430,290,133],[-290,420,100],[-146,433,115],[70,427,145],[246,402,108],[403,260,132],[445,46,116],[431,-150,105],[-428,-113,128]];
  for(const [cx,cz,spread] of groves){
    for(let i=0;i<38;i++){
      const x=cx+(rand()+rand()-1)*spread*1.35,z=cz+(rand()+rand()-1)*spread;
      const y=floor(x,z)-.35,h=8+rand()*13,w=h*(.79+rand()*.26),spin=rand()*Math.PI;
      const left=rand()>.48?.5:0,tint=.74+rand()*.22;
      for(const a of [spin,spin+Math.PI/2]){
        const dx=Math.cos(a)*w*.5,dz=Math.sin(a)*w*.5,k=points.length/3;
        points.push(x-dx,y,z-dz,x+dx,y,z+dz,x+dx,y+h,z+dz,x-dx,y+h,z-dz);
        uv.push(left,.006,left+.499,.006,left+.499,.998,left,.998);
        for(const shade of [.61,.61,1,1])colors.push(tint*shade*.88,tint*shade,tint*shade*.94);
        indices.push(k,k+1,k+2,k,k+2,k+3);
      }
    }
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);
  const mat=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,alphaTest:.28});
  const pines=new THREE.Mesh(g,mat);
  pines.name='採坑復育林';pines.visible=false;pines.userData.fieldGeometry=pines.userData.fieldMaterial=true;root.add(pines);
  bindTexture(mat,'./quarry-foliage.webp',false,t=>{mat.map=t;mat.needsUpdate=true;pines.visible=true;});
}

export function quarryWater(root,site,bindTexture,sun){
  const g=new THREE.PlaneGeometry(171,121,34,24);
  g.rotateX(-Math.PI/2);g.translate(108,.55,48);
  const pos=g.attributes.position,depth=[];
  for(let i=0;i<pos.count;i++)depth.push(.55-site.heightAt(pos.getX(i),pos.getZ(i)));
  g.setAttribute('siltDepth',new THREE.Float32BufferAttribute(depth,1));
  const uniforms={ridge:{value:null},hasRidge:{value:0},clock:{value:0},sunDir:{value:sun}};
  const mat=new THREE.ShaderMaterial({uniforms,vertexShader:`
    attribute float siltDepth;varying float depth;varying vec3 point;
    void main(){depth=siltDepth;point=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`
    uniform sampler2D ridge;uniform float hasRidge,clock;uniform vec3 sunDir;varying float depth;varying vec3 point;
    void main(){
      if(depth<0.)discard;
      vec2 p=point.xz;
      float t=clock*.85;
      float a=sin(dot(p,vec2(.33,.55))+t+.8*sin(p.y*.14))+.38*sin(dot(p,vec2(1.5,1.07))-t*.74);
      float b=sin(dot(p,vec2(.41,-.37))-.67*t+.6*a);
      vec3 normal=normalize(vec3(.012*a,1.,.016*b));
      vec3 V=normalize(cameraPosition-point),R=reflect(-V,normal);
      vec2 uv=vec2(atan(R.z,R.x)/6.2831853+.53,clamp((asin(clamp(R.y,-1.,1.))+.095)/.52,.014,.985));
      vec3 reflection=mix(vec3(.31,.43,.50),texture2D(ridge,vec2(${ridgeU},uv.y),3.).rgb,hasRidge);
      vec3 silt=mix(vec3(.24,.24,.18),vec3(.021,.125,.126),smoothstep(0.,1.95,depth));
      float fresnel=.14+.74*pow(1.-max(dot(V,normal),0.),3.);
      float glint=pow(max(dot(normal,normalize(sunDir+V)),0.),130.);
      gl_FragColor=vec4(mix(silt,reflection,fresnel)+vec3(.8,.70,.47)*glint*.45,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`});
  bindTexture(mat,'./quarry-ridge.webp',true,t=>{uniforms.ridge.value=t;uniforms.hasRidge.value=1;});
  const mesh=new THREE.Mesh(g,mat);mesh.name='沉澱池・含泥淺灘';mesh.userData.fieldGeometry=mesh.userData.fieldMaterial=true;root.add(mesh);
  site.ripple=time=>{uniforms.clock.value=time;};
}
