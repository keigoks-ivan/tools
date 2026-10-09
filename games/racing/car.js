import * as THREE from './vendor/three.module.js';
import { GLTFLoader } from './vendor/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/addons/loaders/DRACOLoader.js';
import { createExtraCar } from './cars-extra.js?v=city-drive-16';
import { createProductionCar } from './cars-production.js?v=city-drive-16';

const asset = name => new URL(`./assets/${name}`, import.meta.url).href;
const clamp = THREE.MathUtils.clamp;

// Ferrari 458 Italia geometry by vicent091036, CC BY 4.0. See assets/ATTRIBUTION.md.
export async function createCar({ renderer, mobile = false, vehicle = 'ferrari458' } = {}) {
  if (vehicle !== 'ferrari458') {
    if (vehicle === 'conceptGT' || vehicle === 'apexR') return createExtraCar({ renderer, mobile, vehicle });
    return createProductionCar({ mobile, vehicle });
  }
  const decoder = new DRACOLoader();
  decoder.setDecoderPath(new URL('./vendor/draco/', import.meta.url).href);
  decoder.setWorkerLimit(mobile ? 1 : 2);
  const loader = new GLTFLoader().setDRACOLoader(decoder);
  let gltf;
  try {
    gltf = await loader.loadAsync(asset('car-ferrari458.glb'));
  } finally {
    decoder.dispose();
  }

  const group = new THREE.Group();
  group.name = 'Ferrari 458 Italia';
  const native = gltf.scene.children[0];
  native.rotation.y = Math.PI;
  group.add(native);
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(native);
  native.position.y -= bounds.min.y;
  group.updateMatrixWorld(true);

  const textures = [];
  const materials = [];
  const originalMaterials = new Set();
  native.traverse(node => {
    if (!node.isMesh) return;
    for (const material of (Array.isArray(node.material) ? node.material : [node.material])) {
      originalMaterials.add(material);
    }
  });

  function material(Type, options) {
    const result = new Type(options);
    materials.push(result);
    return result;
  }

  function grainTexture(size, carbon = false) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const pixels = ctx.createImageData(size, size);
    let seed = 91234;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        const noise = (seed >>> 24) / 255;
        const weave = ((Math.floor(x / 4) + Math.floor(y / 4)) % 2) === 0;
        const level = carbon
          ? (weave ? 46 : 22) + noise * 12 + (weave ? x % 4 : y % 4) * 5
          : 145 + noise * 90;
        const i = (y * size + x) * 4;
        pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = level;
        pixels.data[i + 3] = 255;
      }
    }
    ctx.putImageData(pixels, 0, 0);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(carbon ? 22 : 30, carbon ? 22 : 30);
    texture.anisotropy = Math.min(4, renderer?.capabilities.getMaxAnisotropy() || 1);
    if (carbon) texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    return texture;
  }

  const grain = grainTexture(64);
  const carbon = grainTexture(64, true);
  const paint = material(THREE.MeshPhysicalMaterial, {
    color: '#cf382b', metalness: 0.16, roughness: 0.27,
    clearcoat: 1, clearcoatRoughness: 0.065, ior: 1.5,
    envMapIntensity: 1.16, bumpMap: grain, bumpScale: 0.00035,
  });
  const satinMetal = material(THREE.MeshStandardMaterial, {
    color: '#a8aaa9', metalness: 1, roughness: 0.25, envMapIntensity: 1,
  });
  const brightMetal = material(THREE.MeshStandardMaterial, {
    color: '#ced3d4', metalness: 1, roughness: 0.16, envMapIntensity: 1.15,
  });
  const darkMetal = material(THREE.MeshStandardMaterial, {
    color: '#292e31', metalness: 0.85, roughness: 0.28,
  });
  const rubber = material(THREE.MeshStandardMaterial, {
    color: '#131515', metalness: 0, roughness: 0.84,
    bumpMap: grain, bumpScale: 0.013,
  });
  const plastic = material(THREE.MeshStandardMaterial, {
    color: '#1c2021', metalness: 0.05, roughness: 0.55,
  });
  const leather = material(THREE.MeshStandardMaterial, {
    color: '#34312c', metalness: 0, roughness: 0.7,
    bumpMap: grain, bumpScale: 0.0035,
  });
  const seatLeather = material(THREE.MeshStandardMaterial, {
    color: '#6a3828', metalness: 0, roughness: 0.72,
    bumpMap: grain, bumpScale: 0.004,
  });
  const carbonMaterial = material(THREE.MeshPhysicalMaterial, {
    color: '#51565a', map: carbon, roughness: 0.36, metalness: 0.35,
    clearcoat: 0.5, clearcoatRoughness: 0.28,
  });
  const glass = material(THREE.MeshPhysicalMaterial, {
    color: '#657a83', metalness: 0, roughness: 0.055,
    transparent: true, opacity: mobile ? 0.37 : 0.57,
    transmission: 0, thickness: 0,
    ior: 1.52, clearcoat: 0.4, clearcoatRoughness: 0.025,
    envMapIntensity: 1.15, depthWrite: false,
  });
  const rearLights = material(THREE.MeshPhysicalMaterial, {
    color: '#8b0905', metalness: 0.14, roughness: 0.22,
    clearcoat: 1, clearcoatRoughness: 0.1,
    emissive: '#f42b15', emissiveIntensity: 0.24,
  });
  const frontLights = material(THREE.MeshPhysicalMaterial, {
    color: '#d9e4e5', metalness: 0.35, roughness: 0.16,
    emissive: '#c5dae9', emissiveIntensity: 0.18, clearcoat: 1,
  });
  const yellow = material(THREE.MeshStandardMaterial, {
    color: '#e5b629', metalness: 0.35, roughness: 0.32,
  });
  const materialByName = {
    Body_Color: paint, Glass_Gray: glass, Taillight_Glass: rearLights,
    Projector_Glass: frontLights, Turn_Signal_LED: frontLights,
    Tires: rubber, metal_gray: satinMetal, metal_chrome: brightMetal,
    Carbon_Fiber: carbonMaterial, plastic_gray: plastic,
    Leather: leather, Leather_red: seatLeather,
    Interior_dark: plastic, Interior_light: leather, Carpet: leather,
    Ferrari_Yellow: yellow,
  };
  let triangleCount = 0;
  native.traverse(node => {
    if (!node.isMesh) return;
    const convert = old => materialByName[old.name] || darkMetal;
    node.material = Array.isArray(node.material) ? node.material.map(convert) : convert(node.material);
    const transparent = (Array.isArray(node.material) ? node.material : [node.material]).some(m => m.transparent);
    node.castShadow = !transparent && (!mobile || /body|tire|wheel|rim/.test(node.name));
    node.receiveShadow = !transparent;
    if (/^brake(?:_\d+)?$/.test(node.name)) {
      node.material = satinMetal;
    }
    triangleCount += (node.geometry.index?.count || node.geometry.attributes.position.count) / 3;
  });
  originalMaterials.forEach(m => m.dispose());

  // Keep the tire contact patches fixed while the sprung body responds to load.
  const chassis = new THREE.Group();
  chassis.name = 'suspension-response';
  chassis.position.y = 0.45;
  native.add(chassis);
  native.updateMatrixWorld(true);
  for (const name of ['main', 'steering_wheel']) {
    const node = native.getObjectByName(name);
    if (node) chassis.attach(node);
  }

  const wheels = [];
  for (const name of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
    const wheel = native.getObjectByName(name);
    if (!wheel) continue;
    const pivot = new THREE.Group();
    pivot.name = `${name}-steer`;
    pivot.position.copy(wheel.position);
    native.add(pivot);
    native.updateMatrixWorld(true);
    pivot.attach(wheel);
    wheels.push({
      pivot, wheel, front: name.endsWith('fl') || name.endsWith('fr'),
      base: wheel.quaternion.clone(),
    });
  }

  // A small local contact shadow complements the moving sun shadow.
  const contactSource = await new THREE.TextureLoader().loadAsync(asset('car-ferrari458-ao.png'));
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = contactSource.image.width;
  shadowCanvas.height = contactSource.image.height;
  const shadowContext = shadowCanvas.getContext('2d');
  shadowContext.drawImage(contactSource.image, 0, 0);
  const shadowPixels = shadowContext.getImageData(0, 0, shadowCanvas.width, shadowCanvas.height);
  for (let i = 0; i < shadowPixels.data.length; i += 4) {
    const darkness = 1 - shadowPixels.data[i] / 255;
    shadowPixels.data[i] = shadowPixels.data[i + 1] = shadowPixels.data[i + 2] = 0;
    shadowPixels.data[i + 3] = Math.round(clamp((darkness - 0.035) / 0.965, 0, 1) * 255);
  }
  shadowContext.putImageData(shadowPixels, 0, 0);
  const contactTexture = new THREE.CanvasTexture(shadowCanvas);
  contactSource.dispose();
  textures.push(contactTexture);
  const contactMaterial = material(THREE.MeshBasicMaterial, {
    map: contactTexture, transparent: true, opacity: 0.84,
    depthWrite: false, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  });
  const contact = new THREE.Mesh(new THREE.PlaneGeometry(2.62, 5.2), contactMaterial);
  contact.name = 'contact-shadow';
  contact.rotation.x = -Math.PI / 2;
  contact.position.y = 0.045;
  contact.renderOrder = 2;
  group.add(contact);

  const spinRotation = new THREE.Quaternion();
  const spinAxis = new THREE.Vector3(1, 0, 0);
  let spin = 0;
  let smoothSteer = 0;
  let pitch = 0;
  let roll = 0;
  let disposed = false;
  group.userData.model = {
    name: 'Ferrari 458 Italia', author: 'vicent091036', license: 'CC BY 4.0',
    triangles: Math.round(triangleCount), length: 4.53, width: 2.25,
    wheelbase: 2.65, wheelRadius: 0.358,
  };

  return {
    group,
    dimensions: { length: 4.53, width: 2.25, height: 1.21, wheelbase: 2.65 },
    setPaint(color) {
      paint.color.set(color);
      const luminance = paint.color.r * 0.2126 + paint.color.g * 0.7152 + paint.color.b * 0.0722;
      paint.metalness = luminance > 0.5 ? 0.08 : 0.16;
      paint.roughness = luminance > 0.5 ? 0.30 : 0.27;
      paint.clearcoatRoughness = 0.065;
    },
    update(state = {}, dt = 1 / 60) {
      const step = Math.min(Math.max(dt, 0), 0.1);
      const speed = (Number.isFinite(state.speed) ? state.speed : 0) * (state.reverse ? -1 : 1);
      const targetSteer = Number.isFinite(state.steerAngle)
        ? clamp(state.steerAngle, -0.55, 0.55)
        : clamp(state.steering || 0, -1, 1) * 0.42;
      smoothSteer = THREE.MathUtils.damp(smoothSteer, targetSteer, 13, step);
      spin = (spin - speed * step / 0.358) % (Math.PI * 2);
      spinRotation.setFromAxisAngle(spinAxis, spin);
      for (const item of wheels) {
        item.pivot.rotation.y = item.front ? smoothSteer : 0;
        item.wheel.quaternion.copy(item.base).premultiply(spinRotation);
      }
      const longitudinal = Number.isFinite(state.longitudinalAccel) ? state.longitudinalAccel : (state.acceleration || 0);
      const lateral = Number.isFinite(state.lateralAccel) ? state.lateralAccel : 0;
      pitch = THREE.MathUtils.damp(pitch, clamp(-longitudinal * 0.0035, -0.045, 0.045), 7, step);
      roll = THREE.MathUtils.damp(roll, clamp(lateral * 0.0045, -0.052, 0.052), 7, step);
      chassis.rotation.x = pitch;
      chassis.rotation.z = roll;
      rearLights.emissiveIntensity = 0.24 + clamp(state.brake || 0, 0, 1) * 2.3;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set();
      group.traverse(node => { if (node.geometry) geometries.add(node.geometry); });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      textures.forEach(t => t.dispose());
    },
  };
}
