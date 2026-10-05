// Lighting and atmospheric visuals are independent of the airport and flight model.
export function createAtmosphere(THREE, scene, options = {}) {
  const root = new THREE.Group(); root.name = 'Daylight atmosphere'; scene.add(root);
  const previous = { fog: scene.fog, background: scene.background, environment: scene.environment, environmentIntensity: scene.environmentIntensity };
  const materials = new Set(), geometries = new Set(), textures = new Set();
  const sunDirection = new THREE.Vector3(-0.52, 0.54, -0.66).normalize();
  const uniforms = {
    sunDirection: { value: sunDirection }, sunColor: { value: new THREE.Color(1.0, 0.95, 0.83) },
    horizon: { value: new THREE.Color(0xc4d8e3) }, zenith: { value: new THREE.Color(0x437cba) },
    cloudiness: { value: 0 }, time: { value: 0 }, quality: { value: 1 },
  };
  const fog = new THREE.FogExp2(0xc1d5df, options.clearFog ?? 0.000013);
  scene.fog = fog; scene.background = new THREE.Color(0xc1d5df);
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true,
    uniforms,
    vertexShader: `varying vec3 vDirection;
      void main(){ vDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDirection;
      uniform vec3 sunDirection; uniform vec3 sunColor; uniform vec3 horizon; uniform vec3 zenith; uniform float cloudiness;
      void main(){
        vec3 d=normalize(vDirection); float height=max(d.y,0.0); float mu=clamp(dot(d,sunDirection),-1.0,1.0);
        float optical=exp(-height*8.0); float rayleigh=0.75*(1.0+mu*mu);
        vec3 col=mix(horizon,zenith,pow(height,0.33));
        col*=mix(0.93,1.04,rayleigh*0.55);
        float mie=pow(max(mu,0.0),8.0)*0.20+pow(max(mu,0.0),80.0)*0.42;
        col+=sunColor*mie*(1.0-cloudiness)*mix(0.3,1.0,optical);
        col=mix(col,horizon*0.92,1.0-smoothstep(-0.13,0.03,d.y));
        float disc=smoothstep(0.999987,0.999991,mu);
        col*=mix(0.50,0.72,cloudiness);
        col+=sunColor*disc*22.0*(1.0-cloudiness);
        gl_FragColor=vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  materials.add(skyMaterial);
  const skyGeometry = new THREE.SphereGeometry(150000, 32, 16); geometries.add(skyGeometry);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial); sky.renderOrder = -20; sky.frustumCulled = false; root.add(sky);
  const hemisphere = new THREE.HemisphereLight(0xcbdff6, 0x575b4a, 0.75); root.add(hemisphere);
  const sunlight = new THREE.DirectionalLight(0xfff1db, 2.6); sunlight.position.copy(sunDirection).multiplyScalar(2000); root.add(sunlight, sunlight.target);
  sunlight.shadow.camera.left = sunlight.shadow.camera.bottom = -300;
  sunlight.shadow.camera.right = sunlight.shadow.camera.top = 300;
  sunlight.shadow.camera.near = 50; sunlight.shadow.camera.far = 4200;
  sunlight.shadow.bias = -0.00012; sunlight.shadow.normalBias = 0.12; sunlight.shadow.radius = 2;

  // A small linear HDR panorama gives painted metal and glazing the same sky and sun as the scene.
  const envWidth = 256, envHeight = 128, envPixels = new Float32Array(envWidth * envHeight * 4);
  const environment = new THREE.DataTexture(envPixels, envWidth, envHeight, THREE.RGBAFormat, THREE.FloatType);
  environment.mapping = THREE.EquirectangularReflectionMapping; environment.colorSpace = THREE.LinearSRGBColorSpace;
  environment.minFilter = environment.magFilter = THREE.LinearFilter; textures.add(environment);
  scene.environment = environment;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.7;
  function updateEnvironment(overcast) {
    const direction = new THREE.Vector3(), color = new THREE.Color();
    for (let y = 0; y < envHeight; y++) for (let x = 0; x < envWidth; x++) {
      const latitude = ((y + 0.5) / envHeight - 0.5) * Math.PI, longitude = ((x + 0.5) / envWidth - 0.5) * Math.PI * 2;
      direction.set(Math.cos(latitude) * Math.cos(longitude), Math.sin(latitude), Math.cos(latitude) * Math.sin(longitude));
      if (direction.y >= 0) color.copy(uniforms.horizon.value).lerp(uniforms.zenith.value, Math.pow(direction.y, 0.33));
      else color.setRGB(0.14, 0.17, 0.12).lerp(uniforms.horizon.value, Math.exp(direction.y * 14) * 0.45);
      const alignment = Math.max(0, direction.dot(sunDirection));
      if (!overcast) { const glow = Math.pow(alignment, 32) * 0.28 + Math.pow(alignment, 1800) * 6; color.r += glow; color.g += glow * 0.93; color.b += glow * 0.77; }
      const i = (y * envWidth + x) * 4;
      envPixels[i] = color.r; envPixels[i + 1] = color.g; envPixels[i + 2] = color.b; envPixels[i + 3] = 1;
    }
    environment.needsUpdate = true;
  }

  function noise(x, y, seed) {
    const hash = (a, b) => { const n = Math.sin(a * 127.1 + b * 311.7 + seed * 73.3) * 43758.5453; return n - Math.floor(n); };
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    return (hash(ix, iy) * (1 - u) + hash(ix + 1, iy) * u) * (1 - v) + (hash(ix, iy + 1) * (1 - u) + hash(ix + 1, iy + 1) * u) * v;
  }
  // Four noise-shaped cloud silhouettes in one atlas: darker flat bases and sunlit, irregular tops.
  const cloudWidth = 512, cloudHeight = 256, atlasWidth = cloudWidth * 2, atlasHeight = cloudHeight * 2;
  const cloudPixels = new Uint8Array(atlasWidth * atlasHeight * 4);
  const densityFields = [];
  for (let variant = 0; variant < 4; variant++) {
    const density = new Float32Array(cloudWidth * cloudHeight); densityFields.push(density);
    for (let y = 0; y < cloudHeight; y++) for (let x = 0; x < cloudWidth; x++) {
      const u = x / cloudWidth, v = y / cloudHeight;
      const envelope = Math.exp(-Math.pow((u - 0.5) / 0.36, 4) - Math.pow((v - 0.49) / 0.29, 4));
      const billow = noise(u * 6, v * 4, variant) * 0.55 + noise(u * 14, v * 10, variant + 7) * 0.25 + noise(u * 31, v * 24, variant + 17) * 0.13 + noise(u * 70, v * 60, variant + 29) * 0.07;
      const base = Math.max(0, Math.min(1, (0.83 - v + (noise(u * 22, 1, variant) - 0.5) * 0.06) * 20));
      density[y * cloudWidth + x] = Math.max(0, Math.min(1, (envelope * (0.72 + billow * 0.64) - 0.62) * 6)) * base;
    }
    for (let y = 0; y < cloudHeight; y++) for (let x = 0; x < cloudWidth; x++) {
      const opacity = density[y * cloudWidth + x], up = density[Math.max(0, y - 7) * cloudWidth + x];
      const lit = Math.max(0, Math.min(1, 0.83 - y / cloudHeight * 0.33 + (opacity - up) * 0.23 + noise(x / 24, y / 24, variant) * 0.14));
      const index = ((Math.floor(variant / 2) * cloudHeight + cloudHeight - 1 - y) * atlasWidth + variant % 2 * cloudWidth + x) * 4;
      cloudPixels[index] = Math.round(205 + lit * 50); cloudPixels[index + 1] = Math.round(217 + lit * 38); cloudPixels[index + 2] = Math.round(227 + lit * 27); cloudPixels[index + 3] = Math.round(opacity * 235);
    }
  }
  const cloudTexture = new THREE.DataTexture(cloudPixels, atlasWidth, atlasHeight, THREE.RGBAFormat);
  cloudTexture.colorSpace = THREE.SRGBColorSpace; cloudTexture.minFilter = cloudTexture.magFilter = THREE.LinearFilter; cloudTexture.needsUpdate = true; textures.add(cloudTexture);
  const cloudGeometry = new THREE.PlaneGeometry(1, 1); geometries.add(cloudGeometry);
  const cloudMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), cloudMap: { value: cloudTexture }, wispyMap: { value: cloudTexture }, cloudiness: uniforms.cloudiness },
    vertexShader: `#include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      attribute vec2 cloudVariant; varying vec2 vUv; varying float vOpacity; varying float vWispy;
      void main(){
        float tile=mod(cloudVariant.x,4.0); vUv=uv*0.5+vec2(mod(tile,2.0),floor(tile/2.0))*0.5;
        vOpacity=cloudVariant.y; vWispy=step(4.0,cloudVariant.x);
        vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0);
        vec2 size=vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz)); mvPosition.xy+=position.xy*size;
        gl_Position=projectionMatrix*mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D cloudMap; uniform sampler2D wispyMap; uniform float cloudiness; varying vec2 vUv; varying float vOpacity; varying float vWispy;
      void main(){
        vec4 cloud=vWispy>0.5?texture2D(wispyMap,vUv):texture2D(cloudMap,vUv); if(cloud.a<0.01)discard;
        #include <logdepthbuf_fragment>
        float grey=dot(cloud.rgb,vec3(0.2126,0.7152,0.0722));
        vec3 cloudColor=mix(vec3(grey),cloud.rgb,0.25+smoothstep(0.15,0.8,cloud.a)*0.55);
        gl_FragColor=vec4(cloudColor*mix(1.08,0.68,cloudiness),cloud.a*vOpacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  }); materials.add(cloudMaterial);
  const cloudCount = 26, cloudData = [], variants = new Float32Array(cloudCount * 2);
  let seed = 29111;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const banks = [[-15000, -20000, 2900], [12500, -32000, 3600], [24000, 10000, 4100], [-27000, 20000, 2700]];
  for (let i = 0; i < cloudCount; i++) {
    const bank = banks[i % banks.length];
    cloudData.push({ x: bank[0] + (random() - 0.5) * 18000, z: bank[1] + (random() - 0.5) * 23000, altitude: bank[2] + (random() - 0.5) * 550, width: 1700 + random() * 2800, aspect: i < 20 ? 0.63 : 0.12, photoAspect: 0.85 + random() * 0.3, speed: 4 + random() * 5 });
    variants[i * 2] = i < 20 ? i % 4 : i % 4 + 4; variants[i * 2 + 1] = i < 20 ? 0.85 : 0.22;
  }
  cloudGeometry.setAttribute('cloudVariant', new THREE.InstancedBufferAttribute(variants, 2));
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, cloudCount); clouds.frustumCulled = false; clouds.renderOrder = 0; root.add(clouds);
  let disposed = false, photographicClouds = false;
  if (typeof document !== 'undefined' && typeof document.createElementNS === 'function') {
    const atlas = new THREE.TextureLoader().load(options.cloudAtlasUrl || './assets/cloud-atlas.png?v=20261005', texture => {
      if (disposed) { texture.dispose(); return; }
      texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter; cloudMaterial.uniforms.cloudMap.value = texture; photographicClouds = true;
    }, undefined, () => {});
    textures.add(atlas);
  }
  const dummy = new THREE.Object3D();
  let currentWeather = '', quality = 'medium';
  function setQuality(value) {
    quality = value === 'low' ? 'low' : value === 'high' ? 'high' : 'medium';
    uniforms.quality.value = quality === 'low' ? 0 : quality === 'high' ? 2 : 1;
    clouds.count = quality === 'low' ? 10 : cloudCount;
    sunlight.castShadow = quality !== 'low';
    const shadowSize = quality === 'high' ? 2048 : 1024;
    if (sunlight.shadow.mapSize.x !== shadowSize) {
      sunlight.shadow.map?.dispose(); sunlight.shadow.mapPass?.dispose();
      sunlight.shadow.map = null; sunlight.shadow.mapPass = null; sunlight.shadow.needsUpdate = true;
    }
    sunlight.shadow.mapSize.set(shadowSize, shadowSize);
  }
  function update(time, state, weather = 'clear') {
    const position = state?.position || state?.pos || { x: 0, y: 0, z: 0 }, seconds = Number.isFinite(time) ? time : 0;
    const type = typeof weather === 'string' ? weather : weather?.type || 'clear';
    sky.position.set(position.x || 0, position.y || 0, position.z || 0); uniforms.time.value = seconds;
    const overcast = type === 'overcast' || type === 'fog';
    if (type !== currentWeather) {
      currentWeather = type;
      const foggy = type === 'fog';
      uniforms.zenith.value.set(overcast ? 0x889ba8 : 0x437cba); uniforms.horizon.value.set(foggy ? 0xb7bfc1 : overcast ? 0xc1cbd0 : 0xc4d8e3);
      uniforms.cloudiness.value = overcast ? 0.96 : 0;
      fog.color.copy(uniforms.horizon.value); fog.density = foggy ? options.fogDensity ?? 0.0009 : overcast ? 0.00006 : options.clearFog ?? 0.000013;
      sunlight.intensity = overcast ? 0.45 : 2.6; hemisphere.intensity = overcast ? 0.95 : 0.75;
      updateEnvironment(overcast);
    }
    // The light direction stays fixed; its shadow volume follows the aircraft without precision loss.
    const targetX = Math.round((position.x || 0) / 5) * 5, targetZ = Math.round((position.z || 0) / 5) * 5;
    sunlight.target.position.set(targetX, Math.max(0, (position.y || 0) - 100), targetZ);
    sunlight.position.copy(sunlight.target.position).addScaledVector(sunDirection, 2000);
    for (let i = 0; i < cloudCount; i++) {
      const cloud = cloudData[i], drift = ((seconds * cloud.speed + 35000) % 70000) - 35000;
      dummy.position.set(cloud.x + drift, cloud.altitude * (overcast ? 0.64 : 1), cloud.z);
      const aspect = photographicClouds && i < 20 ? cloud.photoAspect : cloud.aspect;
      dummy.rotation.set(0, 0, 0); dummy.scale.set(cloud.width * (overcast ? 1.9 : 1), cloud.width * aspect, 1); dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
    }
    clouds.instanceMatrix.needsUpdate = true;
  }
  setQuality(options.quality || 'medium'); update(0, { position: { x: 0, y: 0, z: 0 } });
  return { uniforms, sunlight, environment, update, setQuality, dispose() {
    disposed = true;
    scene.remove(root);
    sunlight.dispose();
    if (scene.fog === fog) { scene.fog = previous.fog; scene.background = previous.background; }
    if (scene.environment === environment) { scene.environment = previous.environment; if ('environmentIntensity' in scene) scene.environmentIntensity = previous.environmentIntensity; }
    materials.forEach(value => value.dispose()); geometries.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
  } };
}
