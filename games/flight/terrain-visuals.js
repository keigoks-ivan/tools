// The photographs and surveyed DEM remain the source of every terrain colour and height.
// These shader additions give their slopes a little light response and their photographed water a moving reflection.
export function terrainAtmosphere(THREE, source = {}) {
  return {
    uTerrainSun: source.sunDirection || { value: new THREE.Vector3(-0.52, 0.54, -0.66).normalize() },
    uTerrainHorizon: source.horizon || { value: new THREE.Color(0xc4d8e3) },
    uTerrainZenith: source.zenith || { value: new THREE.Color(0x437cba) },
    uTerrainCloud: source.cloudiness || { value: 0 },
    uTerrainTime: source.time || { value: 0 },
    uTerrainQuality: source.quality || { value: 1 },
  };
}

export function addTerrainLighting(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vGeoWorld;')
    .replace('#include <project_vertex>', '#include <project_vertex>\nvGeoWorld=(modelMatrix*vec4(transformed,1.0)).xyz;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>
      varying vec3 vGeoWorld; uniform vec3 uTerrainSun; uniform vec3 uTerrainHorizon; uniform vec3 uTerrainZenith;
      uniform float uTerrainCloud; uniform float uTerrainTime; uniform float uTerrainQuality;`)
    .replace('#include <tonemapping_fragment>', `
      vec3 geoNormal=normalize(cross(dFdx(vGeoWorld),dFdy(vGeoWorld)));
      if(geoNormal.y<0.0)geoNormal=-geoNormal;
      float geoLight=max(dot(geoNormal,uTerrainSun),0.0);
      float relief=clamp(1.0+(geoLight-uTerrainSun.y)*0.18*(1.0-uTerrainCloud),0.90,1.08);
      gl_FragColor.rgb*=relief;
      if(uTerrainQuality>0.5){
        vec3 photograph=diffuseColor.rgb;
        float blue=(photograph.b-photograph.r)/(photograph.b+photograph.r+0.001);
        float green=(photograph.g-photograph.r)/(photograph.g+photograph.r+0.001);
        float luminance=dot(photograph,vec3(0.2126,0.7152,0.0722));
        float water=smoothstep(0.10,0.32,blue)*smoothstep(0.04,0.26,green);
        water*=smoothstep(0.65,0.90,photograph.b/(photograph.g+0.001))*(1.0-smoothstep(0.25,0.42,luminance));
        water*=smoothstep(0.994,0.999,geoNormal.y)*smoothstep(3200.0,5000.0,length(vGeoWorld.xz));
        float waterPixel=max(length(dFdx(vGeoWorld)),length(dFdy(vGeoWorld)));
        float rippleDetail=1.0-smoothstep(2.0,12.0,waterPixel);
        float rippleA=sin(vGeoWorld.x*0.63+vGeoWorld.z*0.47+uTerrainTime*0.9);
        float rippleB=sin(vGeoWorld.x*0.29-vGeoWorld.z*0.81-uTerrainTime*0.7+sin(vGeoWorld.z*0.12)*1.7);
        vec3 waveNormal=normalize(vec3((rippleA+rippleB*0.55)*0.009*rippleDetail,1.0,(rippleB-rippleA*0.37)*0.009*rippleDetail));
        vec3 viewDirection=normalize(cameraPosition-vGeoWorld);
        vec3 reflected=reflect(-viewDirection,waveNormal);
        float fresnel=0.035+0.48*pow(1.0-max(dot(viewDirection,waveNormal),0.0),4.0);
        vec3 reflection=mix(uTerrainHorizon,uTerrainZenith,pow(max(reflected.y,0.0),0.4));
        float sunGlint=pow(max(dot(reflect(-uTerrainSun,waveNormal),viewDirection),0.0),320.0)*2.5*(1.0-uTerrainCloud);
        vec3 waterColor=mix(gl_FragColor.rgb,reflection,fresnel*0.55)+vec3(1.0,0.95,0.82)*sunGlint;
        gl_FragColor.rgb=mix(gl_FragColor.rgb,waterColor,water*0.8);
      }
      #include <tonemapping_fragment>`);
}

// Planting locations are sampled from dark wooded pixels in the existing aerial photograph.
// Neighbour agreement rejects isolated shadows and rooftops; no forest is added to roads or the airfield.
export function createImageVegetation(THREE, image, meta, config) {
  const samplerSize = 384, canvas = document.createElement('canvas'); canvas.width = canvas.height = samplerSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0, samplerSize, samplerSize);
  const pixels = ctx.getImageData(0, 0, samplerSize, samplerSize).data;
  function wooded(x, y) {
    const i = (Math.max(0, Math.min(samplerSize - 1, y)) * samplerSize + Math.max(0, Math.min(samplerSize - 1, x))) * 4;
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
    return g >= r * 0.93 && g > b * 1.16 && r < 99 && g < 105 && b < 90 && g > 24;
  }
  const trees = [], colors = [], scale = config.groundScale, originX = config.originX, originY = config.originY;
  const cosine = config.cosine, sine = config.sine, w = meta.maxX - meta.minX, h = meta.maxY - meta.minY;
  let seed = 47862;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const zone = config.airport.flatZone;
  for (let row = 2; row < samplerSize - 2; row++) for (let column = 2; column < samplerSize - 2; column++) {
    if (trees.length >= 6500 || random() > 0.17 || !wooded(column, row)) continue;
    let agreement = 0;
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (wooded(column + x, row + y)) agreement++;
    if (agreement < 7) continue;
    const mx = meta.minX + (column + random()) / samplerSize * w, my = meta.maxY - (row + random()) / samplerSize * h;
    const east = (mx - originX) * scale, north = (my - originY) * scale;
    const x = cosine * east - sine * north, z = -sine * east - cosine * north;
    if (x > zone.minX - 120 && x < zone.maxX + 120 && z > zone.minZ - 120 && z < zone.maxZ + 120) continue;
    const height = 10 + random() * 11;
    trees.push({ x, y: config.groundHeight(x, z), z, height, width: height * (0.38 + random() * 0.12), rotation: random() * Math.PI });
    const color = new THREE.Color().setRGB(0.62 + random() * 0.14, 0.63 + random() * 0.12, 0.48 + random() * 0.12); colors.push(color);
  }
  if (!trees.length) return null;
  for (let i = trees.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1)); [trees[i], trees[j]] = [trees[j], trees[i]]; [colors[i], colors[j]] = [colors[j], colors[i]];
  }
  const treeCanvas = document.createElement('canvas'); treeCanvas.width = 256; treeCanvas.height = 512;
  const painter = treeCanvas.getContext('2d');
  painter.strokeStyle = '#6d6558'; painter.lineWidth = 9; painter.beginPath(); painter.moveTo(128, 502); painter.lineTo(124, 84); painter.stroke();
  for (let layer = 0; layer < 15; layer++) {
    const y = 430 - layer * 24, span = (1 - layer / 18) * 108;
    painter.strokeStyle = '#68695a'; painter.lineWidth = 3;
    for (const side of [-1, 1]) { painter.beginPath(); painter.moveTo(125, y + 9); painter.lineTo(128 + side * span * 0.82, y - 28); painter.stroke(); }
    for (let i = 0; i < 150; i++) {
      const x = 128 + (random() * 2 - 1) * span, ly = y - random() * 33;
      painter.fillStyle = ['#767b62', '#5c6554', '#86836c', '#6c705b'][Math.floor(random() * 4)];
      painter.fillRect(x, ly, 2 + random() * 6, 2 + random() * 6);
    }
  }
  const texture = new THREE.CanvasTexture(treeCanvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 2;
  const positions = [], uv = [], indices = [];
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3, x = Math.cos(a) * 0.5, z = Math.sin(a) * 0.5, start = positions.length / 3;
    positions.push(-x, 0, -z, x, 0, z, x, 1, z, -x, 1, -z); uv.push(0, 0, 1, 0, 1, 1, 0, 1); indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ map: texture, color: 0xffffff, alphaTest: 0.48, side: THREE.DoubleSide, emissive: 0x303329, emissiveIntensity: 0.4 });
  const mesh = new THREE.InstancedMesh(geometry, material, trees.length); mesh.name = 'Aerial-image forest detail';
  const dummy = new THREE.Object3D();
  trees.forEach((tree, i) => { dummy.position.set(tree.x, tree.y, tree.z); dummy.rotation.y = tree.rotation; dummy.scale.set(tree.width, tree.height, tree.width); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); mesh.setColorAt(i, colors[i]); });
  mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = false; mesh.receiveShadow = false;
  const group = new THREE.Group(); group.name = 'Surveyed ground vegetation'; group.add(mesh);
  return { group, setQuality(value) { group.visible = value !== 'low'; mesh.count = value === 'high' ? trees.length : Math.ceil(trees.length * 0.65); }, dispose() { group.remove(mesh); geometry.dispose(); material.dispose(); texture.dispose(); } };
}
