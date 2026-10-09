import * as THREE from 'three';

// Street-view proportions, in metres. These are architectural families for the
// adapted circuit, not measured reproductions of individual addresses.
export const CITY_FACADE_DEPTH_PROFILES = Object.freeze({
  taipei: { bay: 3.8, floor: 3.5, opening: .49, windowHeight: 1.85, recess: .20, wall: 'tile', frame: 'metal' },
  kualalumpur: { bay: 3.7, floor: 3.65, opening: .58, windowHeight: 2.05, recess: .18, wall: 'render', frame: 'metal' },
  kobe: { bay: 3.5, floor: 3.5, opening: .46, windowHeight: 1.95, recess: .21, wall: 'stone', frame: 'metal' },
  london: { bay: 3.1, floor: 3.45, opening: .43, windowHeight: 2.05, recess: .27, wall: 'brick', frame: 'sash' },
  sydney: { bay: 3.25, floor: 3.5, opening: .47, windowHeight: 2.1, recess: .26, wall: 'stone', frame: 'sash' },
  goldcoast: { bay: 3.6, floor: 3.2, opening: .65, windowHeight: 2.1, recess: .18, wall: 'render', frame: 'metal' },
  melbourne: { bay: 3.2, floor: 3.45, opening: .46, windowHeight: 2.05, recess: .25, wall: 'brick', frame: 'sash' },
  paris: { bay: 3.3, floor: 3.6, opening: .44, windowHeight: 2.35, recess: .31, wall: 'stone', frame: 'sash' },
  prague: { bay: 3.25, floor: 3.45, opening: .41, windowHeight: 1.95, recess: .26, wall: 'render', frame: 'sash', shutters: true },
  newcastle: { bay: 3.25, floor: 3.55, opening: .43, windowHeight: 2.15, recess: .30, wall: 'brick', frame: 'sash' },
  bangkok: { bay: 3.1, floor: 3.2, opening: .58, windowHeight: 1.9, recess: .18, wall: 'render', frame: 'metal' },
  sanfrancisco: { bay: 3.2, floor: 3.3, opening: .48, windowHeight: 2.05, recess: .23, wall: 'clapboard', frame: 'sash' },
  newyork: { bay: 3.1, floor: 3.6, opening: .43, windowHeight: 2.05, recess: .26, wall: 'brick', frame: 'sash' },
  vancouver: { bay: 3.5, floor: 3.5, opening: .58, windowHeight: 2.1, recess: .20, wall: 'render', frame: 'metal' },
  hanoi: { bay: 2.8, floor: 3.2, opening: .54, windowHeight: 1.9, recess: .21, wall: 'render', frame: 'metal', shutters: true },
  lisbon: { bay: 3.1, floor: 3.4, opening: .44, windowHeight: 2.0, recess: .24, wall: 'azulejo', frame: 'sash', shutters: true },
  marseille: { bay: 3.25, floor: 3.4, opening: .42, windowHeight: 2.05, recess: .25, wall: 'render', frame: 'sash', shutters: true },
  nice: { bay: 3.4, floor: 3.5, opening: .44, windowHeight: 2.2, recess: .27, wall: 'render', frame: 'sash', shutters: true },
  warwick: { bay: 3.0, floor: 3.0, opening: .48, windowHeight: 1.6, recess: .16, wall: 'plaster', frame: 'timber' },
});

const palettes = {
  taipei: ['#c1b6a0', '#a7b6a8', '#bd9481', '#c6b17b', '#bec7c0', '#9caea6'],
  london: ['#8e7b64', '#c6bba4', '#aa7559', '#a48e74', '#d0c5ad', '#9b7c64'],
  paris: ['#d4cbb7', '#c9c0ac', '#ded5c1', '#c4b9a3', '#d6cdbb', '#d7cbb2'],
  newcastle: ['#906e59', '#c6b593', '#a37c62', '#b29679', '#caba9e', '#8d6956'],
  sanfrancisco: ['#bac8be', '#b3c9c6', '#d3b5a8', '#d9c58f', '#bebbc8', '#9eb9b4'],
  hanoi: ['#cfb982', '#c6b37d', '#d8c99e', '#bdaa79', '#cfc092', '#bcb58f'],
  lisbon: ['#dec57f', '#d5b2a1', '#d9ded6', '#e0e3d6', '#d2a387', '#d3dcd7'],
  prague: ['#dbc58e', '#d6b49f', '#e4c6a1', '#b3c6b5', '#c7a191', '#d6cbb0'],
  marseille: ['#d3c3a4', '#c9b89b', '#dfcfb0', '#c1bdaa', '#d2b69a', '#e0d4b9'],
  nice: ['#e3c8a4', '#d7ad9a', '#e8d2ad', '#c9cfb8', '#deb9a1', '#d7ba91'],
  warwick: ['#dbd3b9', '#ad8263', '#d8d2bc', '#cdbfa8', '#c8b699', '#ded7c0'],
};

export function paintCityDepthWall(c, width, height, city, palette) {
  const profile = CITY_FACADE_DEPTH_PROFILES[city], colors = palettes[city] || palette;
  const size = width / 3;
  for (let variant = 0; variant < 6; variant++) {
    c.save(); c.translate(variant % 3 * size, Math.floor(variant / 3) * height / 2); c.scale(size / 256, height / 2 / 256);
    c.fillStyle = colors[variant]; c.fillRect(0, 0, 256, 256);
    const brick = profile.wall === 'brick' && variant % 3 !== 1, stone = profile.wall === 'stone' || profile.wall === 'brick' && variant % 3 === 1;
    const tile = profile.wall === 'tile', azulejo = profile.wall === 'azulejo' && variant % 3 === 2;
    const stepY = brick ? 6 : stone ? 29 : tile ? 8 : azulejo ? 15 : profile.wall === 'clapboard' ? 8 : 0;
    const stepX = brick ? 18 : stone ? 70 : tile ? 10 : 15;
    if (stepY) for (let y = 0, row = 0; y < 256; y += stepY, row++) {
      c.fillStyle = profile.wall === 'clapboard' ? 'rgba(39,48,42,.18)' : 'rgba(54,45,33,.16)'; c.fillRect(0, y, 256, brick ? .8 : .6);
      if (profile.wall !== 'clapboard') for (let x = -stepX; x < 256; x += stepX) {
        const xx = x + (brick || stone ? row % 2 * stepX / 2 : 0);
        c.fillRect(xx, y, .65, stepY);
        if (azulejo) { c.strokeStyle = '#7193a0'; c.lineWidth = .6; c.strokeRect(xx + 3, y + 3, 9, 9); }
        if ((row * 13 + x * 7 + variant) % 9 === 0) { c.fillStyle = 'rgba(244,238,220,.055)'; c.fillRect(xx + 1, y + 1, stepX - 2, stepY - 2); }
      }
    }
    // Original fine weathering, rather than a new photographic download.
    for (let n = 0; n < 1400; n++) {
      const x = (n * 73 + variant * 19) % 256, y = (n * 151 + Math.floor(n / 7) * 17) % 256;
      c.fillStyle = n % 3 ? 'rgba(31,29,24,.024)' : 'rgba(252,249,234,.05)'; c.fillRect(x, y, .6, 1.3 + n % 7);
    }
    c.restore();
  }
}

function geometryBuilder() {
  const position = [], uv = [], indices = [], colors = [];
  return {
    quad(points, coords = [[0, 0], [0, 1], [1, 1], [1, 0]], tint = null) {
      const base = position.length / 3;
      points.forEach((p, i) => { position.push(...p); uv.push(...coords[i]); colors.push(...(tint?.[i] || [1, 1, 1])); });
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    },
    build(colored = false) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (colored) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices); geo.computeVertexNormals(); return geo;
    },
  };
}

export function createFacadeDepth({ city, index, width, height, depth, mobile = false, bottom = 0 }) {
  const profile = CITY_FACADE_DEPTH_PROFILES[city], variant = index % 6;
  const columns = Math.max(1, Math.round(width / profile.bay)), floors = Math.max(1, Math.round((height - bottom) / profile.floor));
  const floorHeight = (height - bottom) / floors, physicalFloors = mobile ? Math.min(2, floors) : floors;
  const top = bottom + physicalFloors * floorHeight, bayWidth = width / columns, front = -depth / 2;
  const builders = Object.fromEntries(['wall', 'glass', 'frame', 'sill', 'shutters', 'blinds'].map(role => [role, geometryBuilder()])), windows = [];
  // Canvas rows run downward; CanvasTexture's default flipY maps the first
  // painted row to the upper half of UV space.
  const tile = [variant % 3 / 3, (1 - Math.floor(variant / 3)) / 2];
  function wallRect(x0, x1, y0, y1, cellX, cellY) {
    const points = [[x0, y0, front], [x0, y1, front], [x1, y1, front], [x1, y0, front]];
    const coords = points.map(([x, y]) => [tile[0] + .001 + (x - cellX) / bayWidth * (.333333 - .002), tile[1] + .001 + (y - cellY) / floorHeight * (.5 - .002)]);
    builders.wall.quad(points, coords);
  }
  for (let floor = 0; floor < physicalFloors; floor++) for (let bay = 0; bay < columns; bay++) {
    const cellX = -width / 2 + bay * bayWidth, cellY = bottom + floor * floorHeight;
    const opening = city === 'taipei' && variant === 0 ? .74 : profile.opening;
    const taipeiHeight = city === 'taipei' ? variant === 2 ? 1.45 : variant === 3 ? 2.1 : profile.windowHeight : profile.windowHeight;
    const ww = Math.min(bayWidth - .55, bayWidth * opening), wh = Math.min(floorHeight - .65, taipeiHeight * (floor === floors - 1 && floors > 3 ? .82 : 1));
    const x0 = cellX + (bayWidth - ww) / 2, x1 = x0 + ww, y0 = cellY + Math.max(.37, (floorHeight - wh) * .44), y1 = y0 + wh;
    const back = front + profile.recess;
    wallRect(cellX, cellX + bayWidth, cellY, y0, cellX, cellY);
    wallRect(cellX, cellX + bayWidth, y1, cellY + floorHeight, cellX, cellY);
    wallRect(cellX, x0, y0, y1, cellX, cellY); wallRect(x1, cellX + bayWidth, y0, y1, cellX, cellY);
    const revealUv = [[tile[0] + .06, tile[1] + .04], [tile[0] + .06, tile[1] + .46], [tile[0] + .08, tile[1] + .46], [tile[0] + .08, tile[1] + .04]];
    builders.wall.quad([[x0, y0, front], [x0, y1, front], [x0, y1, back], [x0, y0, back]], revealUv);
    builders.wall.quad([[x1, y0, back], [x1, y1, back], [x1, y1, front], [x1, y0, front]], revealUv);
    builders.wall.quad([[x0, y0, front], [x0, y0, back], [x1, y0, back], [x1, y0, front]], revealUv);
    builders.wall.quad([[x0, y1, back], [x0, y1, front], [x1, y1, front], [x1, y1, back]], revealUv);
    const room = (index * 37 + floor * 11 + bay * 7 + city.length * 3) % 13;
    const glassTone = [[.72, .90, .85], [1.36, 1.39, 1.27], [.64, .72, .74], [1.19, 1.10, .91], [.94, 1.04, 1.03]][room % 5];
    const low = glassTone.map(value => value * .73), high = glassTone.map(value => value * 1.16);
    builders.glass.quad([[x0, y0, back], [x0, y1, back], [x1, y1, back], [x1, y0, back]], undefined, [low, high, high, low]);
    if (room < 5) {
      const blindHeight = wh * (.25 + room * .087), blindBottom = y1 - blindHeight;
      const tone = [[.72, .68, .57], [.82, .81, .73], [.69, .76, .72]][room % 3];
      const shade = tone.map(value => value * .81);
      builders.blinds.quad([[x0 + .07, blindBottom, back - .012], [x0 + .07, y1 - .045, back - .012], [x1 - .07, y1 - .045, back - .012], [x1 - .07, blindBottom, back - .012]], undefined, [shade, tone, tone, shade]);
    }
    function frameRect(a, b, c, d, z = back - .025) { builders.frame.quad([[a, c, z], [a, d, z], [b, d, z], [b, c, z]]); }
    const trim = profile.frame === 'metal' ? .055 : .075;
    frameRect(x0, x0 + trim, y0, y1); frameRect(x1 - trim, x1, y0, y1);
    frameRect((x0 + x1 - trim) / 2, (x0 + x1 + trim) / 2, y0, y1);
    frameRect(x0, x1, y0 + wh * .53 - trim / 2, y0 + wh * .53 + trim / 2);
    const sillX0 = x0 - .11, sillX1 = x1 + .11, sillZ = front - (profile.frame === 'metal' ? .10 : .18);
    builders.sill.quad([[sillX0, y0, sillZ], [sillX0, y0, back], [sillX1, y0, back], [sillX1, y0, sillZ]]);
    builders.sill.quad([[sillX0, y0 - .095, sillZ], [sillX0, y0, sillZ], [sillX1, y0, sillZ], [sillX1, y0 - .095, sillZ]]);
    if (profile.shutters && variant % 3 !== 0) for (const [a, b] of [[x0 - .32, x0 - .04], [x1 + .04, x1 + .32]]) builders.shutters.quad([[a, y0, front - .055], [a, y1, front - .055], [b, y1, front - .055], [b, y0, front - .055]]);
    windows.push({ x: (x0 + x1) / 2, y: (y0 + y1) / 2, x0, x1, y0, y1, front, back, floor, bay });
  }
  const geometries = Object.fromEntries(Object.entries(builders).map(([role, builder]) => [role, builder.build(role === 'glass' || role === 'blinds')]));
  if (mobile && physicalFloors < floors) {
    const upper = geometryBuilder();
    upper.quad([[-width / 2, top, front], [-width / 2, height, front], [width / 2, height, front], [width / 2, top, front]], [[0, physicalFloors], [0, floors], [columns, floors], [columns, physicalFloors]]);
    const geometry = upper.build(), opening = city === 'taipei' && variant === 0 ? .74 : profile.opening;
    const windowHeight = city === 'taipei' && variant === 2 ? 1.45 : city === 'taipei' && variant === 3 ? 2.1 : profile.windowHeight;
    const info = [], sizes = [];
    for (let v = 0; v < 4; v++) {
      info.push(tile[0], tile[1], index, floors);
      sizes.push(Math.min(1 - .55 / bayWidth, opening), Math.min(floorHeight - .65, windowHeight) / floorHeight, .37 / floorHeight, (profile.frame === 'metal' ? .055 : .075) / bayWidth);
    }
    geometry.setAttribute('cityFacadeInfo', new THREE.Float32BufferAttribute(info, 4));
    geometry.setAttribute('cityWindowSize', new THREE.Float32BufferAttribute(sizes, 4)); geometries.upper = geometry;
  }
  return { geometries, windows, columns, floors, physicalFloors, bottom, top, floorHeight, recess: profile.recess };
}

// A single cheap phone upper face uses the SAME wall tile, bay grid, opening
// dimensions and room seeds as the physical lower floors. Window colour and
// roughness are procedural; no extra downloaded/painted texture is allocated.
export function configureFacadeUpperMaterial(material, { city, glassColor, frameColor }) {
  material.userData.cityUpperFacade = true; material.metalness = 0;
  material.onBeforeCompile = shader => {
    shader.uniforms.cityWindowGlass = { value: glassColor.clone() };
    shader.uniforms.cityWindowFrame = { value: frameColor.clone() };
    shader.uniforms.cityRoomSeed = { value: city.length * 3 };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>
      attribute vec4 cityFacadeInfo;
      attribute vec4 cityWindowSize;
      varying vec4 vCityFacadeInfo;
      varying vec4 vCityWindowSize;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vCityFacadeInfo = cityFacadeInfo;
      vCityWindowSize = cityWindowSize;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      varying vec4 vCityFacadeInfo;
      varying vec4 vCityWindowSize;
      uniform vec3 cityWindowGlass;
      uniform vec3 cityWindowFrame;
      uniform float cityRoomSeed;
      float cityWindowEdge(float coordinate, float boundary) {
        float aa = max(fwidth(coordinate) * .65, .001);
        return smoothstep(boundary - aa, boundary + aa, coordinate);
      }`)
      .replace('#include <map_fragment>', `
      float cityGlassMask = 0.0;
      float cityFrameMask = 0.0;
      #ifdef USE_MAP
        vec2 cityCell = fract(vMapUv);
        vec2 cityTileUv = vCityFacadeInfo.xy + vec2(.001) + cityCell * vec2(.331333, .498);
        diffuseColor *= texture2D(map, cityTileUv);
        float cityWindowHeight = vCityWindowSize.y;
        if (floor(vMapUv.y) >= vCityFacadeInfo.w - 1.0 && vCityFacadeInfo.w > 3.0) cityWindowHeight *= .82;
        float cityLeft = (1.0 - vCityWindowSize.x) * .5;
        float cityRight = 1.0 - cityLeft;
        float cityBottom = max(vCityWindowSize.z, (1.0 - cityWindowHeight) * .44);
        float cityTop = cityBottom + cityWindowHeight;
        float cityOpening = cityWindowEdge(cityCell.x, cityLeft) * (1.0 - cityWindowEdge(cityCell.x, cityRight))
          * cityWindowEdge(cityCell.y, cityBottom) * (1.0 - cityWindowEdge(cityCell.y, cityTop));
        float cityRoom = mod(vCityFacadeInfo.z * 37.0 + floor(vMapUv.y) * 11.0 + floor(vMapUv.x) * 7.0 + cityRoomSeed, 13.0);
        float cityToneIndex = mod(cityRoom, 5.0);
        vec3 cityTone = cityToneIndex < .5 ? vec3(.72, .90, .85) : cityToneIndex < 1.5 ? vec3(1.36, 1.39, 1.27)
          : cityToneIndex < 2.5 ? vec3(.64, .72, .74) : cityToneIndex < 3.5 ? vec3(1.19, 1.10, .91) : vec3(.94, 1.04, 1.03);
        float cityWindowY = clamp((cityCell.y - cityBottom) / cityWindowHeight, 0.0, 1.0);
        vec3 cityGlazing = cityWindowGlass * cityTone * mix(.73, 1.16, cityWindowY);
        float cityBlind = 0.0;
        if (cityRoom < 5.0) {
          cityBlind = cityWindowEdge(cityCell.y, cityTop - cityWindowHeight * (.25 + cityRoom * .087));
          float cityBlindTone = mod(cityRoom, 3.0);
          vec3 cityCurtain = cityBlindTone < .5 ? vec3(.72, .68, .57) : cityBlindTone < 1.5 ? vec3(.82, .81, .73) : vec3(.69, .76, .72);
          cityGlazing = mix(cityGlazing, cityCurtain * .82, cityBlind);
        }
        vec2 cityTrim = max(vec2(vCityWindowSize.w), min(vec2(.04), fwidth(cityCell) * .7));
        float cityVertical = 1.0 - cityWindowEdge(cityCell.x, cityLeft + cityTrim.x);
        cityVertical = max(cityVertical, cityWindowEdge(cityCell.x, cityRight - cityTrim.x));
        cityVertical = max(cityVertical, 1.0 - cityWindowEdge(abs(cityCell.x - .5), cityTrim.x * .5));
        float citySash = 1.0 - cityWindowEdge(abs(cityCell.y - (cityBottom + cityWindowHeight * .53)), cityTrim.y * .5);
        cityFrameMask = max(cityVertical, citySash) * cityOpening;
        cityGlassMask = cityOpening * (1.0 - cityFrameMask) * (1.0 - cityBlind);
        diffuseColor.rgb = mix(diffuseColor.rgb, cityGlazing, cityOpening);
        diffuseColor.rgb = mix(diffuseColor.rgb, cityWindowFrame, cityFrameMask);
      #endif`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = mix(roughnessFactor, .22, cityGlassMask);
      roughnessFactor = mix(roughnessFactor, .55, cityFrameMask);`);
  };
  material.customProgramCacheKey = () => 'city-upper-facade-grid-1';
}

// Remove only the street-facing region occupied by the physical window skin.
// Retained upper/lower pieces keep their original UVs and all five other faces.
export function cutFacadeFront(geometry, width, height, depth, bottom, top) {
  const p = geometry.attributes.position, n = geometry.attributes.normal, uv = geometry.attributes.uv;
  const positions = [...p.array], normals = [...n.array], coords = [...uv.array], indices = [...geometry.index.array].slice(0, 30);
  const u0 = uv.getX(20), u1 = uv.getX(21), v0 = uv.getY(22), v1 = uv.getY(20);
  for (const [lo, hi] of [[0, bottom], [top, height]]) {
    if (hi - lo < .001) continue;
    const base = positions.length / 3;
    positions.push(-width / 2, lo - height / 2, -depth / 2, -width / 2, hi - height / 2, -depth / 2, width / 2, hi - height / 2, -depth / 2, width / 2, lo - height / 2, -depth / 2);
    for (let i = 0; i < 4; i++) normals.push(0, 0, -1);
    coords.push(u1, v0 + (v1 - v0) * lo / height, u1, v0 + (v1 - v0) * hi / height, u0, v0 + (v1 - v0) * hi / height, u0, v0 + (v1 - v0) * lo / height);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(coords, 2)); geometry.setIndex(indices); geometry.clearGroups(); return geometry;
}
