import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRACKS } from './track.mjs';
import { CITY_THEMES, CITY_STREET_PROFILES, cityGroundLevel, addCityScenery } from './world-cities.js';
import { cityDistrictForPoint } from './world-city-districts.mjs';

const context = new Proxy({
  font: '16px Arial',
  measureText(text) { return { width: text.length * (parseFloat(this.font.match(/[\d.]+px/)?.[0]) || 16) * .55 }; },
  createLinearGradient: () => ({ addColorStop() {} }),
  createImageData: (width, height) => ({ data: new Uint8ClampedArray(width * height * 4) }),
}, { get: (target, key) => target[key] || (() => {}) });
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

test('city terrain opens coast and river channels without lowering the driving corridor', () => {
  assert.equal(cityGroundLevel('london', 220, 0), -4);
  assert.equal(cityGroundLevel('kobe', 0, -500), -4);
  assert.equal(cityGroundLevel('sydney', -500, 0), -4);
  assert.equal(cityGroundLevel('goldcoast', -500, 0), -4);
  assert.equal(cityGroundLevel('goldcoast', -370, 0), 1.15);
  assert.equal(cityGroundLevel('melbourne', 0, -420), -4);
  for (const city of CITY_THEMES) assert.equal(cityGroundLevel(city, TRACKS[city].spawn.x, TRACKS[city].spawn.z), 4.65);
});

test('all nineteen cities have independently authored street families and appropriate local scale', () => {
  assert.deepEqual(Object.keys(CITY_STREET_PROFILES), CITY_THEMES);
  assert.equal(new Set(Object.values(CITY_STREET_PROFILES).map(profile => profile.family)).size, 19);
  assert.ok(CITY_STREET_PROFILES.hanoi.widths[1] <= 8 && CITY_STREET_PROFILES.hanoi.heights[1] <= 17, 'Old Quarter tube houses stay narrow and low');
  assert.ok(CITY_STREET_PROFILES.warwick.heights[1] <= 11 && CITY_STREET_PROFILES.warwick.skyline[1] <= 13, 'Warwick stays a small historic town');
  for (const city of ['paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice']) assert.ok(CITY_STREET_PROFILES[city].skyline[1] <= 30, `${city}: the historic district has no generic high-rise grid`);
  assert.equal(CITY_STREET_PROFILES.paris.roof, 'mansard');
  assert.equal(CITY_STREET_PROFILES.goldcoast.family, 'surfers-balconies');
  assert.equal(CITY_STREET_PROFILES.vancouver.family, 'coalharbor-ribbons');
  assert.equal(CITY_STREET_PROFILES.newyork.family, 'manhattan-setbacks');
});

for (const city of CITY_THEMES) for (const mobile of [false, true]) {
  test(`${city} ${mobile ? 'mobile' : 'desktop'}: recognizable landmark geometry is finite and street structures clear the racing surface`, () => {
    const scene = new THREE.Scene(), track = TRACKS[city];
    const concrete = new THREE.MeshStandardMaterial(), shoulder = new THREE.MeshStandardMaterial(), rock = new THREE.MeshStandardMaterial();
    const built = addCityScenery({ scene, track, mobile, groundHeight: () => 4.65, materials: { concrete, shoulder, rock } });
    scene.traverse(object => {
      const local = object.userData.localStreets;
      if (!local) return;
      for (const block of local.blocks) if (!block.heritage) assert.ok(cityDistrictForPoint(track, block.x, block.z).density > 0, 'special street rows respect open parks and waterfronts');
      for (const block of local.backstreets) assert.ok(cityDistrictForPoint(track, block.x, block.z).density > 0, 'rear streets do not refill open districts');
    });
    if (city === 'bangkok') {
      const precinct = built.group.userData.landmarks.includes('Wat Arun temple precinct');
      assert.ok(precinct);
      let ceramicVertices = 0;
      scene.traverse(object => {
        if (!object.geometry || object.material.map?.repeat.x !== 16 || object.material.map?.repeat.y !== 4) return;
        const positions = object.geometry.attributes.position;
        for (let i = 0; i < positions.count; i++) {
          assert.equal(cityGroundLevel(city, positions.getX(i), positions.getZ(i)), 4.65, 'Wat Arun prangs stand on the dry opposite river bank');
          assert.ok(positions.getZ(i) < -630, 'Wat Arun stands beyond the existing channel'); ceramicVertices++;
        }
      });
      assert.ok(ceramicVertices > 1000, 'the actual porcelain prang geometry is inspected');
    }
    assert.ok(built.group.userData.landmarks.length >= 2);
    assert.ok(built.group.userData.buildings.filter(building => building.near).length >= 15, 'street districts retain occupied local frontage');
    assert.ok(new Set(built.group.userData.buildings.map(building => building.district)).size >= 2, 'multiple districts appear in the built scene');
    const profile = CITY_STREET_PROFILES[city];
    for (const building of built.group.userData.buildings) {
      assert.equal(building.family, profile.family);
      const heights = building.near ? building.districtHeights || profile.heights : profile.skyline;
      assert.ok(building.h >= heights[0] && building.h <= heights[1], 'every foreground and skyline building follows its city scale');
      if (building.near) {
        assert.ok(building.districtDensity > 0, 'open districts contain no newly generated street buildings');
        const at = cityDistrictForPoint(track, building.x, building.z);
        assert.ok(at.density > 0, 'actual street footprints do not close an open shore or park segment');
      }
    }
    assert.ok(built.group.children.length <= 40, 'street detail, district ground and the cheap phone upper face are batched by material');
    let height = 0, vertices = 0, meshes = 0, triangles = 0;
    scene.traverse(object => {
      if (!object.geometry) return;
      meshes++; triangles += object.geometry.index.count / 3;
      for (const attribute of Object.values(object.geometry.attributes)) assert.ok(attribute.array.every(Number.isFinite), `${object.name}: finite vertex attributes`);
      const positions = object.geometry.attributes.position;
      if (object.material.name === 'city-foliage') {
        assert.ok(object.geometry.attributes.color, 'broadleaf clusters carry subtle diffuse colour variation');
        for (let i = 0; i < positions.count; i += 4) {
          const corner = new THREE.Vector3().fromBufferAttribute(positions, i);
          for (const vertex of [i + 1, i + 2]) assert.ok(corner.distanceTo(new THREE.Vector3().fromBufferAttribute(positions, vertex)) < 3.5, 'no entire crown is represented by a giant paper panel');
        }
      }
      if (object.material.name === 'city-facade-masonry') {
        assert.equal(object.material.metalness, 0, 'brick, tile and stone remain dielectric materials');
        assert.ok(object.material.roughness >= .8);
        assert.equal(object.material.map.image.width, mobile ? 384 : 768, 'only a small selected-city wall atlas is allocated');
      }
      if (object.material.userData.cityUpperFacade) {
        assert.equal(mobile, true, 'only phones allocate the cheaper upper facade batch');
        assert.equal(object.material.metalness, 0);
        assert.equal(object.material.map, built.group.children.find(mesh => mesh.material.name === 'city-facade-masonry').material.map, 'upper and lower masonry reuse the exact selected-city wall map');
        assert.ok(object.geometry.attributes.cityFacadeInfo && object.geometry.attributes.cityWindowSize, 'upper panes retain the correct bay, floor and opening attributes');
      }
      if (object.material.userData.cityDistrictGround) {
        const normals = object.geometry.attributes.normal;
        assert.equal(object.material.side, THREE.FrontSide, 'district ground does not hide reversed triangles with DoubleSide');
        for (let i = 0; i < normals.count; i++) assert.ok(normals.getY(i) > 0, 'ground triangles face upward on both route sides');
      }
      assert.ok(object.geometry.index.array.every(index => index < positions.count), `${object.name}: valid triangle indices`);
      for (let i = 0; i < positions.count; i++) {
        const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
        assert.ok(Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z));
        height = Math.max(height, y); vertices++;
        if (object.material.userData.cityRoadPaint) assert.ok(Math.abs(y - track.nearest(x, z).y) < .7, 'markings follow the local elevated road surface');
        else if (y > 7 && y < 30 && !object.material.userData.cityWater) assert.ok(track.nearest(x, z).distance > track.width / 2 + .5, `${object.name}: structure intrudes on road at ${x}, ${y}, ${z}`);
      }
    });
    assert.ok(vertices > 15000);
    assert.ok(meshes < 82, `complete city draw batches: ${meshes}`);
    if (mobile) assert.ok(triangles <= 300000, `${city}: complete mobile architecture stays below 300k triangles (${triangles})`);
    if (['taipei', 'london', 'newcastle', 'paris'].includes(city)) {
      const detailed = built.group.userData.buildings.filter(building => building.physicalWindows);
      assert.ok(detailed.length >= 15, 'the ordinary street scene contains actual physical windows');
      for (const building of detailed) {
        assert.ok(building.windowRecess >= .19 && building.windowRecess <= .32);
        if (mobile) assert.ok(building.physicalWindowFloors <= 2, 'phone detail ends on a complete floor');
      }
    }
    const requiredHeight = { taipei: 510, kualalumpur: 455, kobe: 110, london: 135 }[city];
    if (requiredHeight) assert.ok(height >= requiredHeight && height < 520, `landmark height ${height}`);
    else assert.ok(height > (city === 'hanoi' ? 30 : 40) && height < 550, `bounded recognizable skyline: ${height}`);
    built.setQuality('medium');
    assert.ok(built.group.children.some(mesh => mesh.castShadow), 'mobile quality retains architectural shadows');
    for (const mesh of built.group.children) if (mesh.material.userData.cityRoadPaint || mesh.material.userData.cityWater || mesh.material.name === 'city-foliage') assert.equal(mesh.castShadow, false, 'paint, water and mobile foliage do not cast');
    built.setQuality('high');
    for (const mesh of built.group.children) if (mesh.material.name === 'city-foliage') assert.equal(mesh.castShadow, true, 'high quality adds foliage shadows');
    built.setQuality('low');
    assert.ok(built.group.children.every(mesh => !mesh.castShadow), 'low quality preserves the shadow draw budget');
    let disposed = 0;
    const resources = new Set([concrete, shoulder, rock]);
    scene.traverse(object => {
      if (!object.geometry) return;
      object.geometry.addEventListener('dispose', () => disposed++); resources.add(object.geometry); resources.add(object.material);
      for (const value of Object.values(object.material)) if (value?.isTexture) resources.add(value);
    });
    resources.forEach(resource => resource.dispose());
    assert.equal(disposed, meshes);
  });
}
