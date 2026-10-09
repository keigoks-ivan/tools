import * as THREE from 'three';
import { CITY_ROAD_PROFILES } from './world-city-roadmarkings.js?v=city-drive-16';
import { installAsphaltWear } from './road-surface.mjs?v=city-drive-16';

// Mesh UVs are in metres. Repetition follows the photographed surface size.
const surfaces = {
  asphalt_track: { tileSize: 2, normal: .24, color: '#565852' },
  sparse_grass: { tileSize: 2, normal: .38, color: '#8c9076' },
  gravelly_sand: { tileSize: 2.5, normal: .32, color: '#b4a28a' },
  red_sand: { tileSize: 3, normal: .28, color: '#bb8764' },
  rock_boulder_dry: { tileSize: 1.8, normal: .46, color: '#aaa394' },
  concrete_wall_004: { tileSize: 2, normal: .22, color: '#c0b9aa' },
};

export async function createWorldMaterials(renderer, { mobile = false, theme = 'costa', roadWidth = 16, lanesPerDirection = 1, trackLength = 1800 } = {}) {
  const loader = new THREE.TextureLoader(), textures = new Set(), materials = new Set();
  const anisotropy = Math.min(mobile ? 4 : 8, renderer.capabilities.getMaxAnisotropy());
  function loadMap(id, channel) {
    return new Promise(resolve => {
      let texture, timer, finished = false;
      const finish = loaded => {
        if (finished) { if (loaded) loaded.dispose(); return; }
        finished = true; clearTimeout(timer);
        if (!loaded) { texture?.dispose(); resolve(null); return; }
        loaded.colorSpace = channel === 'diff' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        loaded.wrapS = loaded.wrapT = THREE.RepeatWrapping;
        loaded.repeat.setScalar(1 / surfaces[id].tileSize);
        loaded.anisotropy = anisotropy;
        textures.add(loaded); resolve(loaded);
      };
      const url = new URL(`./assets/surfaces/${id}_${channel}_1k.jpg`, import.meta.url).href;
      texture = loader.load(url, finish, undefined, () => finish(null));
      timer = setTimeout(() => finish(null), 12000);
    });
  }
  async function material(id, options = {}) {
    const surface = surfaces[id];
    const [map, normalMap, roughnessMap] = await Promise.all(['diff', 'nor_gl', 'rough'].map(channel => loadMap(id, channel)));
    const result = new THREE.MeshStandardMaterial({
      color: map ? '#ffffff' : surface.color,
      map, normalMap, roughnessMap,
      normalScale: new THREE.Vector2(surface.normal, surface.normal),
      roughness: 1, metalness: 0, envMapIntensity: .55,
      ...options,
    });
    result.userData.tileSize = surface.tileSize;
    result.userData.surface = id;
    materials.add(result);
    return result;
  }
  const terrainId = theme === 'canyon' ? 'red_sand' : 'sparse_grass';
  const [road, terrain, shoulder, rock, concrete] = await Promise.all([
    material('asphalt_track', { side: THREE.DoubleSide, envMapIntensity: .35 }),
    material(terrainId, { vertexColors: true }),
    material('gravelly_sand', { side: THREE.DoubleSide }),
    material('rock_boulder_dry'),
    material('concrete_wall_004'),
  ]);
  // Normalize the dark source scan to dry asphalt's low, neutral reflectance.
  if (road.map) road.color.setRGB(1.7, 2, 2.15);
  const city = Object.hasOwn(CITY_ROAD_PROFILES, theme);
  installAsphaltWear(road, { roadWidth, lanesPerDirection, trackLength, city });
  if (city) concrete.color.set('#b1b6b3');
  if (theme === 'canyon') rock.color.set('#d1a27b');
  if (theme === 'alpine' || theme === 'grandprix') terrain.color.set('#c2d3c0');
  let disposed = false;
  return {
    road, terrain, shoulder, rock, concrete, dryGrass: terrain,
    textures: [...textures], materials: [...materials],
    dispose() {
      if (disposed) return; disposed = true;
      materials.forEach(value => value.dispose()); textures.forEach(value => value.dispose());
    },
  };
}
