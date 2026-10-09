import * as THREE from 'three';
import { configureCityGlazing, configureCurtainWall } from './world-city-surfaces.js?v=city-drive-16';
import { addCityUrbanDetails, urbanJunctionAt } from './world-city-urban-details.js?v=city-drive-16';
import { streetMassing } from './world-city-massing.mjs?v=city-drive-16';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addExtraCityLandmarks } from './world-cities-extra.js?v=city-drive-16';
import { createCityWaterMaterial } from './world-city-australia.js?v=city-drive-16';
import { paintTaipeiFacade, paintTaipeiStorefront, paintTaipeiPaving } from './world-city-taipei-facades.js?v=city-drive-16';
import { getTaipeiJunctions, taipeiJunctionAt, taipeiStreetAt, addTaipeiStreetDetails, paintTaipeiCornerFacade, paintTaipeiJunctionPaving } from './world-city-taipei-streets.js?v=city-drive-16';
import { CITY_ROAD_PROFILES, addCityRoadMarkings } from './world-city-roadmarkings.js?v=city-drive-16';
import { CITY_STREETFRONT_CITIES, HERITAGE_SHOP_CITIES, paintCityStreetfront, paintHeritageShopfront, paintCityPaving } from './world-city-streetfronts.js?v=city-drive-16';
import { CITY_DISTRICT_PLANS, cityDistrictAt, cityDistrictForPoint } from './world-city-districts.mjs?v=city-drive-16';
import { clipGroundTriangle } from './world-city-ground.mjs?v=city-drive-16';
import { CITY_FACADE_DEPTH_PROFILES, paintCityDepthWall, createFacadeDepth, cutFacadeFront, configureFacadeUpperMaterial } from './world-city-facade-depth.js?v=city-drive-16';

export const CITY_THEMES = Object.freeze(['taipei', 'kualalumpur', 'kobe', 'london', 'sydney', 'goldcoast', 'melbourne', 'paris', 'prague', 'newcastle', 'bangkok', 'sanfrancisco', 'newyork', 'vancouver', 'hanoi', 'lisbon', 'marseille', 'nice', 'warwick']);
// Street-scale architecture is authored per location, not a shared tower grid.
// Ranges are metres; the skyline sectors leave the photographed waterfront open.
export const CITY_STREET_PROFILES = Object.freeze({
  taipei: { family: 'xinyi-arcades', roof: 'flat', widths: [10, 25], heights: [13, 46], depths: [17, 25], spacing: 22, skyline: [45, 145], grid: [82, 105], sector: 'east', lamps: 'twin', trees: 'broadleaf', treeHeight: [9, 15], treeEvery: 2, palette: ['#aaa79b', '#bac0b7', '#c7b9a2', '#979d97', '#b6b39f', '#a1aaa5'] },
  kualalumpur: { family: 'klcc-rounded', roof: 'flat', widths: [19, 30], heights: [23, 48], depths: [19, 28], spacing: 51, skyline: [80, 245], grid: [100, 112], sector: 'east', lamps: 'modern', trees: 'tropical', treeHeight: [11, 17], treeEvery: 2, palette: ['#aab7b4', '#8ba0a1', '#b9c1b5', '#b2bbb8', '#8d9b9d', '#c7c4b7'] },
  kobe: { family: 'harbor-office', roof: 'flat', widths: [23, 37], heights: [16, 32], depths: [20, 28], spacing: 59, skyline: [29, 84], grid: [100, 92], sector: 'north', lamps: 'harbor', trees: 'broadleaf', treeHeight: [7, 11], treeEvery: 4, palette: ['#dadbd0', '#b9c6c5', '#cdd3cb', '#c0c4bb', '#adc4c8', '#d5cbb9'] },
  london: { family: 'westminster-brick', roof: 'slate', widths: [16, 27], heights: [16, 26], depths: [18, 26], spacing: 43, skyline: [20, 43], grid: [71, 89], sector: 'west', lamps: 'lantern', trees: 'plane', treeHeight: [9, 15], treeEvery: 3, palette: ['#baa98d', '#bfaa8e', '#b8987f', '#a77963', '#d0c4a9', '#aa8c76'] },
  sydney: { family: 'rocks-sandstone', roof: 'slate', widths: [16, 27], heights: [12, 24], depths: [17, 25], spacing: 46, skyline: [65, 182], grid: [92, 106], sector: 'east', lamps: 'harbor', trees: 'gum', treeHeight: [10, 16], treeEvery: 3, palette: ['#c8b58e', '#bfa585', '#d3c3a3', '#a69580', '#c3b99d', '#ab997d'] },
  goldcoast: { family: 'surfers-balconies', roof: 'flat', widths: [20, 32], heights: [34, 92], depths: [18, 26], spacing: 68, skyline: [62, 183], grid: [110, 125], sector: 'east', lamps: 'resort', trees: 'palm', treeHeight: [11, 17], treeEvery: 2, palette: ['#e1d8c0', '#e4e3d7', '#c4d2d2', '#d2d3c6', '#d4c7b0', '#cbd9da'] },
  melbourne: { family: 'victorian-laneways', roof: 'parapet', widths: [11, 23], heights: [11, 23], depths: [19, 28], spacing: 36, skyline: [63, 205], grid: [92, 104], sector: 'east', lamps: 'tram', trees: 'plane', treeHeight: [8, 13], treeEvery: 3, palette: ['#bd9a7c', '#bcaa90', '#bd866f', '#d1c5ac', '#a77863', '#bca48c'] },
  paris: { family: 'haussmann', roof: 'mansard', widths: [18, 31], heights: [21, 27], depths: [20, 29], spacing: 41, skyline: [22, 29], grid: [65, 74], sector: 'blocks', lamps: 'lantern', trees: 'plane', treeHeight: [10, 15], treeEvery: 2, palette: ['#d8ccae', '#c9bfa8', '#d8d3c0', '#b9ad98', '#cec3aa', '#dbd1b6'] },
  prague: { family: 'bohemian-pastel', roof: 'tile', widths: [11, 22], heights: [13, 22], depths: [17, 25], spacing: 32, skyline: [14, 25], grid: [64, 78], sector: 'blocks', lamps: 'lantern', trees: 'broadleaf', treeHeight: [7, 11], treeEvery: 4, palette: ['#e0cb96', '#d3b29b', '#e4c6a3', '#b6c6b2', '#c6a399', '#d6cdb4'] },
  newcastle: { family: 'tyne-warehouses', roof: 'slate', widths: [13, 24], heights: [15, 25], depths: [20, 29], spacing: 38, skyline: [17, 29], grid: [78, 85], sector: 'south', lamps: 'quayside', trees: 'broadleaf', treeHeight: [8, 12], treeEvery: 5, palette: ['#a17e65', '#bcac8e', '#8e6a58', '#aa8c70', '#c5b492', '#99705c'] },
  bangkok: { family: 'thai-shophouse', roof: 'parapet', widths: [6, 11], heights: [11, 20], depths: [18, 27], spacing: 24, skyline: [44, 125], grid: [105, 107], sector: 'north', lamps: 'modern', trees: 'tropical', treeHeight: [8, 14], treeEvery: 3, palette: ['#d2c4a5', '#d6bd98', '#c5d0be', '#dfcdac', '#c6b195', '#c6c7b2'] },
  sanfrancisco: { family: 'victorian-bays', roof: 'gable', widths: [8, 15], heights: [10, 17], depths: [19, 28], spacing: 27, skyline: [13, 30], grid: [67, 79], sector: 'south', lamps: 'lantern', trees: 'cypress', treeHeight: [9, 13], treeEvery: 4, palette: ['#bfc3ba', '#b7c8c6', '#d0b7a8', '#dac897', '#b7b7c8', '#a1b9b6'] },
  newyork: { family: 'manhattan-setbacks', roof: 'flat', widths: [15, 26], heights: [24, 50], depths: [22, 33], spacing: 40, skyline: [75, 225], grid: [67, 84], sector: 'blocks', lamps: 'newyork', trees: 'plane', treeHeight: [8, 13], treeEvery: 4, palette: ['#aa927a', '#c9bca1', '#ad826e', '#b8aca0', '#aa9a86', '#d0c7b2'] },
  vancouver: { family: 'coalharbor-ribbons', roof: 'flat', widths: [15, 25], heights: [36, 88], depths: [17, 24], spacing: 64, skyline: [72, 165], grid: [88, 110], sector: 'east', lamps: 'harbor', trees: 'cedar', treeHeight: [11, 18], treeEvery: 3, palette: ['#b8cccb', '#a0b9b8', '#d0d9d0', '#adc6c4', '#becfcb', '#b1c3c1'] },
  hanoi: { family: 'oldquarter-tubes', roof: 'parapet', widths: [5, 8], heights: [10, 17], depths: [19, 28], spacing: 18, skyline: [11, 20], grid: [43, 69], sector: 'blocks', lamps: 'oldquarter', trees: 'banyan', treeHeight: [10, 16], treeEvery: 2, palette: ['#d2b371', '#c8b278', '#d8c18a', '#bba66d', '#d1bc8b', '#b9b38d'] },
  lisbon: { family: 'alfama-tiles', roof: 'tile', widths: [9, 17], heights: [11, 21], depths: [16, 23], spacing: 29, skyline: [13, 24], grid: [57, 73], sector: 'north', lamps: 'lantern', trees: 'olive', treeHeight: [6, 10], treeEvery: 5, palette: ['#e0c47c', '#d9b3a1', '#b5cacb', '#d4dfd5', '#d3a68d', '#c3d4d9'] },
  marseille: { family: 'provencal-port', roof: 'tile', widths: [12, 22], heights: [16, 24], depths: [17, 25], spacing: 36, skyline: [17, 27], grid: [69, 88], sector: 'north', lamps: 'quayside', trees: 'plane', treeHeight: [8, 13], treeEvery: 4, palette: ['#d5c5a6', '#c8b697', '#e1d3b7', '#bcb7a5', '#cfae92', '#ded4b9'] },
  nice: { family: 'riviera-balconies', roof: 'tile', widths: [15, 26], heights: [18, 26], depths: [18, 26], spacing: 41, skyline: [18, 29], grid: [73, 91], sector: 'east', lamps: 'resort', trees: 'palm', treeHeight: [10, 15], treeEvery: 2, palette: ['#e5c9a6', '#d9ad98', '#e9d4ae', '#c7cbb6', '#ddbaa0', '#d5b78f'] },
  warwick: { family: 'tudor-sandstone', roof: 'gable', widths: [9, 17], heights: [6, 11], depths: [14, 21], spacing: 34, skyline: [7, 13], grid: [85, 112], sector: 'village', lamps: 'lantern', trees: 'oak', treeHeight: [10, 17], treeEvery: 2, palette: ['#ddd4bb', '#cbbca5', '#d5d2bb', '#bba88c', '#c5bda5', '#e1d6bc'] },
});
const TAU = Math.PI * 2;
const up = new THREE.Vector3(0, 1, 0);
export function cityGroundLevel(city, x, z) {
  if ((city === 'london' && x > 101 && x < 357) || (city === 'kobe' && z < -380)
    || (city === 'sydney' && (x < -390 || z > 390)) || (city === 'goldcoast' && x < -415)
    || (city === 'melbourne' && z < -380 && z > -505)) return -4;
  if ((city === 'sanfrancisco' && z > 390) || (city === 'newyork' && z > 390)
    || (city === 'vancouver' && (x < -390 || z > 390))
    || (city === 'paris' && z < -390 && z > -550)
    || (city === 'prague' && z < -390 && z > -650) || (city === 'newcastle' && z > 390 && z < 650)
    || (city === 'lisbon' && z < -385) || (city === 'marseille' && z < -390)
    || (city === 'nice' && x < -405) || (city === 'warwick' && z < -355 && z > -490)
    || (city === 'bangkok' && z < -385 && z > -630)
    || (city === 'hanoi' && (x / 145) ** 2 + (z / 185) ** 2 < 1)) return -4;
  if (city === 'goldcoast' && x < -335) return 1.15;
  if (city === 'nice' && x < -350) return 1.4;
  return 4.65;
}
function random(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}
function canvasMap(width, height, paint) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  paint(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping; return map;
}
function facadeMap(city, index, mobile) {
  return canvasMap(mobile ? 256 : 512, mobile ? 512 : 1024, (c, width, height) => {
    if (city === 'taipei') { paintTaipeiFacade(c, width, height, index); return; }
    if (paintCityStreetfront(c, width, height, city, index)) return;
    c.scale(width / 512, height / 1024); const w = 512, h = 1024;
    const profile = CITY_STREET_PROFILES[city], modern = index >= 3 && ['sydney', 'melbourne', 'bangkok', 'newyork'].includes(city);
    const rand = random(7621 + index * 721), concreteFrontage = city === 'taipei' && index < 4;
    const historic = concreteFrontage || !modern && !['taipei', 'kualalumpur', 'goldcoast', 'vancouver', 'kobe'].includes(city);
    const colors = historic ? ['#94735c', '#b9ad97', '#b2a58c', '#725b4c', '#d0c7b4', '#988a77']
      : ['#8b9998', '#7b8e90', '#b2b5aa', '#aaa79c', '#7a8382', '#a4b3b2'];
    const regional = {
      paris: ['#d8ccae', '#c9bfa8', '#d8d3c0', '#b9ad98', '#cec3aa', '#dbd1b6'],
      prague: ['#d9c893', '#ceb79f', '#e2c6a6', '#a3b9aa', '#bf9d8b', '#d4cdaa'],
      lisbon: ['#d9c886', '#dcc2b3', '#bfd0cd', '#d1e0dc', '#cda789', '#b8c9cf'],
      marseille: ['#d5c5a6', '#c8b697', '#e1d3b7', '#bcb7a5', '#cfae92', '#ded4b9'],
      nice: ['#dbc5a5', '#d7b4a2', '#e7d6b3', '#bdc4b5', '#dabfa9', '#c9b798'],
      warwick: ['#d6cdb7', '#cebfaa', '#d5d2bb', '#b99881', '#c0ad96', '#e1d6bc'],
      sanfrancisco: ['#bfc3ba', '#b7c8c6', '#d0b7a8', '#dac897', '#b7b7c8', '#a1b9b6'],
      hanoi: ['#d2b371', '#c8b278', '#d8c18a', '#bba66d', '#d1bc8b', '#b9b38d'],
    }[city];
    c.fillStyle = modern ? ['#7b959b', '#82999b', '#94a5a3'][index % 3] : (profile.palette || regional || colors)[index % colors.length]; c.fillRect(0, 0, w, h);
    if (historic && city !== 'hanoi' && !concreteFrontage) {
      for (let row = 0; row < 128; row++) for (let col = -1; col < 18; col++) {
        c.fillStyle = `rgba(38,25,15,${.05 + rand() * .14})`;
        c.fillRect(col * 31 + (row % 2) * 15.5, row * 8, 29, 6.5);
      }
    } else {
      for (let i = 0; i < 1800; i++) {
        c.fillStyle = `rgba(39,48,44,${rand() * .045})`; c.fillRect(rand() * w, rand() * h, .7 + rand() * 2, 15 + rand() * 70);
      }
    }
    // Irregular rain streaks and mortar discoloration break the repeated grid.
    for (let mark = 0; mark < 1200; mark++) {
      c.fillStyle = `rgba(36,31,23,${.018 + rand() * (historic ? .035 : .016)})`;
      c.fillRect(rand() * w, rand() * h, 1 + rand() * 3, 2 + rand() * (historic ? 24 : 70));
    }
    if (['paris', 'marseille', 'nice', 'prague'].includes(city)) for (let floor = 0; floor < 8; floor++) {
      c.fillStyle = 'rgba(77,67,49,.16)'; c.fillRect(0, floor * 128 + 117, w, 5);
      c.fillStyle = 'rgba(255,246,219,.29)'; c.fillRect(0, floor * 128 + 112, w, 4);
    }
    if (city === 'warwick') {
      c.fillStyle = '#453d34';
      for (let row = 0; row < 3; row++) c.fillRect(0, row * h / 3, w, 11);
      for (let col = 0; col <= 3; col++) c.fillRect(col * w / 3 - 6, 0, 12, h);
      c.strokeStyle = '#453d34'; c.lineWidth = 9;
      for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) { c.beginPath(); c.moveTo(col * w / 3 + 9, row * h / 3 + 12); c.lineTo((col + 1) * w / 3 - 9, (row + 1) * h / 3 - 12); c.stroke(); }
    }
    const rows = modern ? 8 : ({ taipei: 6, hanoi: 4, warwick: 3, paris: 6, prague: 5, london: 5, newcastle: 5, lisbon: 5, marseille: 6, nice: 6, sanfrancisco: 4, bangkok: 4, sydney: 4, melbourne: 4, newyork: 6 })[city] || 8;
    const cols = historic ? ({ hanoi: 2, warwick: 3, prague: 3, lisbon: 3, sanfrancisco: 3, bangkok: 2 })[city] || 4 : [6, 8, 10][index % 3], cw = w / cols, ch = h / rows;
    for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
      const opening = ({ taipei: .44, hanoi: .48, warwick: .42, paris: .36, prague: .29, london: .30, newcastle: .28, lisbon: .34, marseille: .32, nice: .30, sydney: .36, melbourne: .32, newyork: .30, sanfrancisco: .33, bangkok: .50 })[city] || .38;
      const inset = historic ? cw * (1 - opening) / 2 : index % 3 === 2 ? 11 : 6;
      const x = col * cw + inset, y = row * ch + (historic ? ch * .18 : 10);
      const ww = cw - inset * 2, hh = historic ? ch * .61 : ch - 23;
      c.fillStyle = historic ? '#ded5bf' : index % 2 ? '#819594' : '#b7beb5'; c.fillRect(x - 4, y - 5, ww + 8, hh + 11);
      c.fillStyle = 'rgba(10,19,21,.44)'; c.fillRect(x - 1, y - 2, ww + 2, hh + 5);
      const gradient = c.createLinearGradient(x, y, x + ww, y + hh);
      gradient.addColorStop(0, historic ? '#56696a' : ['#536f77', '#77959b', '#638088', '#869994'][Math.floor(rand() * 4)]);
      gradient.addColorStop(.46, historic ? '#83908a' : '#9eafb0'); gradient.addColorStop(.49, historic ? '#52645f' : '#667f84'); gradient.addColorStop(1, historic ? '#253a36' : '#29414b');
      c.fillStyle = gradient; c.fillRect(x, y, ww, hh);
      if (rand() > .5) { c.fillStyle = 'rgba(210,204,177,.51)'; c.fillRect(x + 2, y + 2, ww - 4, hh * (.2 + rand() * .56)); }
      c.fillStyle = historic ? '#e6dfcd' : '#b9c2bf'; c.fillRect(x + ww / 2 - 1, y, 2, hh);
      c.fillRect(x, y + hh * .55, ww, historic ? 2.5 : 1.5);
      c.fillStyle = 'rgba(30,43,42,.3)'; c.fillRect(x - 3, y + hh + 4, ww + 6, 3);
      if (historic && ['nice', 'marseille', 'prague', 'hanoi', 'lisbon'].includes(city)) {
        c.fillStyle = ['#7b8773', '#77847d', '#8a7665'][index % 3]; c.fillRect(x - 15, y, 10, hh); c.fillRect(x + ww + 5, y, 10, hh);
        c.fillStyle = 'rgba(23,38,28,.25)'; for (let slat = 0; slat < 12; slat++) { c.fillRect(x - 15, y + slat * hh / 12, 10, 1); c.fillRect(x + ww + 5, y + slat * hh / 12, 10, 1); }
      }
      if (city === 'lisbon') {
        c.strokeStyle = 'rgba(51,96,121,.4)'; c.lineWidth = 1.5;
        for (let tile = 0; tile < 4; tile++) { c.strokeRect(col * cw + 4 + tile * 13, row * ch + 112, 11, 11); }
      }
      if (!historic && index % 2) for (let i = 0; i < 4; i++) { c.fillStyle = 'rgba(225,224,212,.23)'; c.fillRect(x, y + 15 + i * 7, ww, 2); }
    }
  });
}
function signMap(title, subtitle, color = '#164c43', ink = '#f4f4e7', resolution = 1) {
  return canvasMap(1024 * resolution, 256 * resolution, c => {
    c.scale(resolution, resolution); const w = 1024, h = 256;
    c.fillStyle = color; c.fillRect(0, 0, w, h); c.strokeStyle = ink; c.lineWidth = 8; c.strokeRect(10, 10, w - 20, h - 20);
    c.fillStyle = ink; c.textAlign = 'center'; c.font = '700 69px Arial, sans-serif';
    let size = 69; while (c.measureText(title).width > w - 95) { size -= 2; c.font = `700 ${size}px Arial, sans-serif`; }
    c.fillText(title, w / 2, 116); c.font = '34px Arial, sans-serif'; c.fillText(subtitle, w / 2, 187);
  });
}
function clockMap() {
  return canvasMap(512, 512, (c, n) => {
    c.fillStyle = '#d8d6c3'; c.fillRect(0, 0, n, n); const mid = n / 2;
    c.beginPath(); c.arc(mid, mid, 242, 0, TAU); c.fillStyle = '#b99845'; c.fill();
    c.beginPath(); c.arc(mid, mid, 223, 0, TAU); c.fillStyle = '#f1eee1'; c.fill();
    c.strokeStyle = '#224f68'; c.lineWidth = 5;
    for (let i = 0; i < 60; i++) {
      const angle = i / 60 * TAU, radius = i % 5 ? 209 : 192;
      c.beginPath(); c.moveTo(mid + Math.sin(angle) * radius, mid - Math.cos(angle) * radius);
      c.lineTo(mid + Math.sin(angle) * 216, mid - Math.cos(angle) * 216); c.stroke();
    }
    const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
    c.fillStyle = '#194561'; c.font = 'bold 39px Georgia'; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < 12; i++) { const angle = i / 12 * TAU; c.fillText(numerals[i], mid + Math.sin(angle) * 174, mid - Math.cos(angle) * 174); }
    for (let ring = 0; ring < 5; ring++) { c.beginPath(); c.arc(mid, mid, 51 + ring * 23, 0, TAU); c.strokeStyle = 'rgba(35,67,75,.3)'; c.lineWidth = 1.5; c.stroke(); }
    c.strokeStyle = '#1e4964'; c.lineCap = 'round'; c.lineWidth = 13;
    c.beginPath(); c.moveTo(mid, mid); c.lineTo(mid + 90, mid - 42); c.stroke();
    c.lineWidth = 8; c.beginPath(); c.moveTo(mid, mid); c.lineTo(mid - 127, mid - 99); c.stroke();
    c.fillStyle = '#b99742'; c.beginPath(); c.arc(mid, mid, 15, 0, TAU); c.fill();
  });
}

// Landmark heights follow official references. Street layouts are closed-course adaptations.
// Static architectural parts share material batches, including all window mullions and trusses.
export function addCityScenery({ scene, track, mobile = false, groundHeight, groundSurfaceHeight = groundHeight, materials }) {
  const city = track.theme, rand = random(8053 + CITY_THEMES.indexOf(city) * 331);
  const street = CITY_STREET_PROFILES[city], range = values => values[0] + rand() * (values[1] - values[0]);
  const batches = new Map(), ownedMaterials = new Set(), reserved = [], footprints = [], shadowMeshes = [];
  const group = new THREE.Group(); group.name = `${city}-city`; scene.add(group);
  let cityWater;
  let frame = new THREE.Matrix4();
  const scale = new THREE.Vector3(1, 1, 1), position = new THREE.Vector3(), rotation = new THREE.Quaternion();
  function material(color, options = {}) {
    const value = new THREE.MeshStandardMaterial({ color, roughness: .8, ...options }); ownedMaterials.add(value); return value;
  }
  function surface(base, color, options = {}) {
    const value = base.clone(); value.color.set(color); Object.assign(value, options); ownedMaterials.add(value); return value;
  }
  const stone = surface(materials.concrete, city === 'london' ? '#d4c6a9' : '#d8d9cd');
  const paving = surface(materials.concrete, '#c6c5b8', { roughness: .96 });
  paving.userData.seasonGround = true;
  if (city === 'taipei') { paving.color.set('#c4c6bb'); paving.map = canvasMap(mobile ? 128 : 256, mobile ? 128 : 256, paintTaipeiPaving); }
  else if (CITY_STREETFRONT_CITIES.includes(city)) { paving.color.set('#ffffff'); paving.map = canvasMap(mobile ? 128 : 256, mobile ? 128 : 256, (c, w, h) => paintCityPaving(c, w, h, city)); }
  const charcoal = material('#404b4c', { metalness: .35, roughness: .5 });
  const steel = material('#bec7c5', { metalness: .78, roughness: .35 });
  const glass = material(city === 'taipei' ? '#4c8987' : city === 'kualalumpur' ? '#728087' : '#678a96', { metalness: 0, roughness: .18 });
  const darkGlass = material('#52676b', { metalness: 0, roughness: .22, vertexColors: true });
  configureCityGlazing(darkGlass);
  const white = material('#eeeee0', { roughness: .55, vertexColors: true });
  const gold = material('#bfa15a', { metalness: .7, roughness: .45 });
  const red = material('#b23229', { roughness: .5, metalness: .18 });
  const roof = material('#535d60', { roughness: .7 });
  const bark = material('#625646', { roughness: 1 });
  if (street.trees === 'gum') bark.color.set('#a39b86');
  const foliageMap = canvasMap(256, 256, (c, size) => {
    const paint = random(7409);
    for (let i = 0; i < 1700; i++) {
      const x = paint() * 2 - 1, y = paint() * 2 - 1;
      if (x * x + y * y > .88 || paint() > .82) continue;
      const light = paint() * 44; c.fillStyle = ['taipei', 'kualalumpur'].includes(city) ? `rgb(${60 + light * .9},${102 + light * 1.2},${49 + light * .7})` : `rgb(${53 + light * .8},${76 + light},${44 + light * .65})`;
      c.beginPath(); c.ellipse((x * .47 + .5) * size, (y * .47 + .5) * size, ['cedar', 'cypress'].includes(street.trees) ? .9 : 2.3 + paint() * 1.3, ['cedar', 'cypress'].includes(street.trees) ? 4.8 : 4 + paint() * 3, paint() * Math.PI, 0, TAU); c.fill();
    }
  });
  const leaf = material('#c0cead', { map: foliageMap, alphaTest: .28, side: THREE.DoubleSide, roughness: .96, vertexColors: true });
  if (['taipei', 'kualalumpur'].includes(city)) { leaf.emissive.set('#31531f'); leaf.emissiveIntensity = .1; }
  leaf.name = ['cedar', 'cypress'].includes(street.trees) ? 'city-evergreen-foliage' : 'city-foliage';
  const signalGreen = material('#4b9d70', { emissive: '#287349', emissiveIntensity: .5 });
  const palmLeaf = material('#657a42', { roughness: .93, side: THREE.DoubleSide });
  palmLeaf.name = 'city-evergreen-palm';
  const roadPaint = material(city === 'taipei' ? '#d7bf60' : '#ecebdc', { roughness: .96, side: THREE.DoubleSide });
  roadPaint.name = 'city-road-markings'; roadPaint.userData.cityRoadPaint = true;
  const roadProfile = CITY_ROAD_PROFILES[city], yellowRoadPaint = city !== 'taipei' && (roadProfile.centre.includes('yellow') || roadProfile.edge?.includes('yellow')) ? material('#d8bf5b', { roughness: .96, side: THREE.DoubleSide }) : null;
  if (yellowRoadPaint) yellowRoadPaint.userData.cityRoadPaint = true;
  const historic = !['taipei', 'kualalumpur', 'goldcoast', 'vancouver', 'kobe'].includes(city);
  if (historic) {
    const slate = ['mansard', 'slate'].includes(street.roof) || city === 'sanfrancisco';
    roof.color.set(slate ? '#6b6c66' : '#bb7754'); roof.roughness = .94;
    roof.map = canvasMap(256, 256, (c, size) => {
      const noise = random(92031), colors = slate ? ['#9b9e97', '#959990', '#a2a59b', '#8d938c'] : ['#d9b08a', '#c89b75', '#d2a079', '#c3926d'];
      c.fillStyle = colors[0]; c.fillRect(0, 0, size, size);
      for (let row = 0; row < 16; row++) for (let col = -1; col < 17; col++) {
        const x = col * 16 + row % 2 * 8, y = row * 16;
        c.fillStyle = colors[Math.floor(noise() * colors.length)]; c.fillRect(x, y, 15.5, 15.5);
        c.fillStyle = 'rgba(40,30,20,.18)'; c.fillRect(x, y + 14, 16, 2);
        c.fillStyle = 'rgba(255,239,207,.17)'; c.fillRect(x + 1, y, 1.5, 15);
      }
    });
  }
  const windowMaterials = Array.from({ length: 6 }, (_, i) => material('#ffffff', { map: facadeMap(city, i, mobile), metalness: 0, roughness: city === 'taipei' ? i < 4 ? .91 : .30 : historic ? .86 : .5 }));
  windowMaterials.forEach((mat, index) => {
    if (['kualalumpur', 'vancouver', 'goldcoast'].includes(city) || index >= 4 && city === 'taipei' || index >= 3 && ['sydney', 'melbourne', 'bangkok', 'newyork'].includes(city)) configureCurtainWall(mat, index);
  });
  const depthWall = material('#ffffff', { map: canvasMap(mobile ? 384 : 768, mobile ? 256 : 512, (c, w, h) => paintCityDepthWall(c, w, h, city, street.palette)), metalness: 0, roughness: .94 });
  depthWall.name = 'city-facade-masonry'; depthWall.map.anisotropy = mobile ? 2 : 4;
  let upperFacade;
  const taipeiStorefront = city === 'taipei' ? material('#ffffff', { map: canvasMap(mobile ? 256 : 512, mobile ? 128 : 256, paintTaipeiStorefront), roughness: .32, metalness: 0 }) : null;
  const heritageStorefront = HERITAGE_SHOP_CITIES.includes(city) ? material('#ffffff', { map: canvasMap(mobile ? 512 : 1024, mobile ? 256 : 512, (c, w, h) => paintHeritageShopfront(c, w, h, city)), roughness: .63 }) : null;
  const taipeiWhitePaint = city === 'taipei' ? material('#e9e8df', { roughness: .97, side: THREE.DoubleSide }) : null;
  if (taipeiWhitePaint) taipeiWhitePaint.userData.cityRoadPaint = true;
  const taipeiAsphalt = city === 'taipei' ? surface(materials.road || materials.concrete, '#555a56', { roughness: .96, vertexColors: true }) : null;
  if (taipeiAsphalt) { taipeiAsphalt.userData.cityRoadSurface = true; if (materials.road) taipeiAsphalt.color.copy(materials.road.color); }
  const taipeiTaxiBody = city === 'taipei' ? material('#e9bf35', { roughness: .42, metalness: .12 }) : null;
  const taipeiCornerFacade = city === 'taipei' ? material('#ffffff', { map: canvasMap(mobile ? 256 : 512, mobile ? 512 : 1024, paintTaipeiCornerFacade), roughness: .91, metalness: .03 }) : null;
  if (taipeiCornerFacade) { taipeiCornerFacade.userData.taipeiCorner = true; taipeiCornerFacade.map.anisotropy = mobile ? 2 : 4; }
  const taipeiJunctionPaving = city === 'taipei' ? material('#ffffff', { map: canvasMap(mobile ? 128 : 256, mobile ? 128 : 256, paintTaipeiJunctionPaving), roughness: .96 }) : null;
  if (taipeiJunctionPaving) taipeiJunctionPaving.userData.seasonGround = true;
  for (const value of windowMaterials) value.map.anisotropy = mobile ? 2 : 4;
  function bake(geometry, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, metric = false, tint = null) {
    if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, i) => i));
    if (mat.vertexColors && !geometry.attributes.color) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(1), 3));
    rotation.setFromEuler(new THREE.Euler(rx, ry, rz)); position.set(x, y, z);
    geometry.applyMatrix4(new THREE.Matrix4().compose(position, rotation, scale)); geometry.applyMatrix4(frame);
    if (metric && geometry.attributes.uv) {
      const p = geometry.attributes.position, normal = geometry.attributes.normal, uv = geometry.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const nx = Math.abs(normal.getX(i)), ny = Math.abs(normal.getY(i)), nz = Math.abs(normal.getZ(i));
        if (ny > nx && ny > nz) uv.setXY(i, p.getX(i) / (mat.userData.cityRoadSurface ? 1 : 3), p.getZ(i) / (mat.userData.cityRoadSurface ? 1 : 3));
        else if (nx > nz) uv.setXY(i, p.getZ(i) / 3, p.getY(i) / 3);
        else uv.setXY(i, p.getX(i) / 3, p.getY(i) / 3);
      }
    }
    if (mat.userData.cityRoadSurface) geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count * 3).fill(tint ?? 1), 3));
    if (!batches.has(mat)) batches.set(mat, []); batches.get(mat).push(geometry);
  }
  function box(w, h, d, mat, x, y, z, rx = 0, ry = 0, rz = 0, tint = null) { bake(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz, !!mat.map && !windowMaterials.includes(mat), tint); }
  function cylinder(top, bottom, h, mat, x, y, z, segments = 16, rx = 0, ry = 0, rz = 0) { bake(new THREE.CylinderGeometry(top, bottom, h, mobile && Math.max(top, bottom) < .6 ? Math.min(segments, 6) : segments), mat, x, y, z, rx, ry, rz); }
  function beam(a, b, width, mat = steel) {
    const start = new THREE.Vector3(...a), end = new THREE.Vector3(...b), direction = end.clone().sub(start), middle = start.clone().add(end).multiplyScalar(.5);
    const geo = new THREE.CylinderGeometry(width / 2, width / 2, direction.length(), mobile ? 5 : 8);
    geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, direction.normalize())); bake(geo, mat, middle.x, middle.y, middle.z);
  }
  function setFrame(x, z, yaw = 0, y = groundHeight(x, z)) {
    frame = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), scale);
  }
  function roadFrame(s, side, offset) {
    const p = track.sample(s), x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
    setFrame(x, z, p.heading + (side > 0 ? 0 : Math.PI), p.y - .25); return p;
  }
  function clearFootprint(x, z, width, depth, yaw, extra = 1) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    for (const u of [-.5, 0, .5]) for (const v of [-.5, 0, .5]) {
      const px = x + u * width * c + v * depth * s, pz = z - u * width * s + v * depth * c;
      if (cityGroundLevel(city, px, pz) < 4 || track.nearest(px, pz).distance < track.wallOffset + extra) return false;
      if (city === 'taipei' && taipeiStreetAt(track, px, pz, 2)) return false;
    }
    return !reserved.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + Math.hypot(width, depth) * .5);
  }
  function reserve(x, z, radius, name) { reserved.push({ x, z, radius, name }); }
  function panel(w, h, mat, x, y, z, ry = 0) { bake(new THREE.PlaneGeometry(w, h), mat, x, y, z, 0, ry); }
  function sign(title, subtitle, x, y, z, w = 8, color) {
    const mat = material('#ffffff', { map: signMap(title, subtitle, color, undefined, mobile ? .5 : 1), roughness: .78 });
    panel(w, w / 4, mat, x, y, z + .003); panel(w, w / 4, mat, x, y, z - .003, Math.PI); return mat;
  }
  function cornice(w, d, y, mat = stone, depth = .35, x = 0, z = 0) {
    for (const side of [-1, 1]) { box(w + depth * 2, .35, depth, mat, x, y, z + side * (d + depth) / 2); box(depth, .35, d, mat, x + side * (w + depth) / 2, y, z); }
  }
  function facade(w, h, d, mat, x = 0, y = h / 2, z = 0, physical = null) {
    const geo = new THREE.BoxGeometry(w, h, d), uv = geo.attributes.uv;
    const values = [d, d, w, w, w, w];
    for (let face = 0; face < 6; face++) for (let vertex = 0; vertex < 4; vertex++) {
      const id = face * 4 + vertex, frontage = city === 'hanoi' ? 6.5 : city === 'warwick' ? 12 : city === 'sanfrancisco' ? 11 : city === 'bangkok' ? 8 : 16;
      uv.setXY(id, uv.getX(id) * values[face] / frontage, uv.getY(id) * (face === 2 || face === 3 ? d / 22 : h / (mat.userData.taipeiCorner ? 33 : city === 'taipei' ? 21 : city === 'warwick' ? 10 : city === 'hanoi' || city === 'bangkok' ? 15 : 25)));
    }
    if (physical) {
      const detail = createFacadeDepth({ city, index: physical.index, width: w, height: h, depth: d, mobile, bottom: physical.bottom || 0 });
      cutFacadeFront(geo, w, h, d, detail.bottom, mobile ? h : detail.top);
      const profile = CITY_FACADE_DEPTH_PROFILES[city], frameMat = profile.frame === 'metal' ? steel : profile.frame === 'timber' ? bark : white;
      for (const [role, geometry] of Object.entries(detail.geometries)) {
        if (!geometry.index.count) { geometry.dispose(); continue; }
        if (role === 'upper' && !upperFacade) {
          upperFacade = surface(depthWall, '#ffffff'); upperFacade.name = 'city-upper-facade';
          configureFacadeUpperMaterial(upperFacade, { city, glassColor: darkGlass.color, frameColor: frameMat.color });
        }
        const value = role === 'wall' ? depthWall : role === 'glass' ? darkGlass : role === 'frame' ? frameMat : role === 'shutters' ? roof : role === 'blinds' ? white : role === 'upper' ? upperFacade : stone;
        bake(geometry, value, x, y - h / 2, z);
      }
      const record = physical.record;
      record.physicalWindows = (record.physicalWindows || 0) + detail.windows.length;
      record.physicalWindowFloors = detail.physicalFloors; record.windowRecess = detail.recess; record.windowBayWidth = w / detail.columns;
      record.windowFloorHeight = detail.floorHeight;
    }
    bake(geo, mat, x, y, z);
  }
  function pitchedRoof(w, d, y, rise, mansard = false, frontGable = false, wall = null) {
    if (frontGable) {
      const shape = new THREE.Shape(); shape.moveTo(-w / 2 - .35, 0); shape.lineTo(0, rise); shape.lineTo(w / 2 + .35, 0); shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape, { depth: d + .7, bevelEnabled: false, curveSegments: 1 }); geo.translate(0, y, -(d + .7) / 2); bake(geo, roof, 0, 0, 0, 0, 0, 0, true);
      for (const side of [-1, 1]) {
        const gable = new THREE.BufferGeometry();
        gable.setAttribute('position', new THREE.Float32BufferAttribute([-w / 2, y + .01, side * (d / 2 + .37), 0, y + rise - .12, side * (d / 2 + .37), w / 2, y + .01, side * (d / 2 + .37)], 3));
        gable.setAttribute('uv', new THREE.Float32BufferAttribute([.017, .017, .017, .017, .017, .017], 2)); gable.setIndex(side < 0 ? [0, 1, 2] : [2, 1, 0]); gable.computeVertexNormals(); bake(gable, wall);
        box(.82, .95, .06, darkGlass, 0, y + rise * .45, side * (d / 2 + .42));
        beam([-w / 2 - .38, y, side * (d / 2 + .44)], [0, y + rise + .09, side * (d / 2 + .44)], .14, stone);
        beam([0, y + rise + .09, side * (d / 2 + .44)], [w / 2 + .38, y, side * (d / 2 + .44)], .14, stone);
      }
      return;
    }
    const shape = new THREE.Shape(); shape.moveTo(-d / 2 - .5, 0);
    if (mansard) { shape.lineTo(-d * .3, rise * .9); shape.lineTo(-d * .23, rise); shape.lineTo(d * .23, rise); shape.lineTo(d * .3, rise * .9); }
    else shape.lineTo(0, rise);
    shape.lineTo(d / 2 + .5, 0); shape.closePath();
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: w + 1, bevelEnabled: false, curveSegments: 1 });
    geometry.rotateY(Math.PI / 2); geometry.translate(-(w + 1) / 2, y, 0); bake(geometry, roof, 0, 0, 0, 0, 0, 0, true);
  }
  function tree(x, z, height = 9, palm = false, inGround = false) {
    setFrame(x, z); cylinder(.16, .29, height * (palm ? .89 : .69), bark, 0, height * (palm ? .445 : .345), 0, 7);
    if (palm) {
      const vertices = [], uvs = [], crown = height * .91;
      function blade(a, b, width, tangent) {
        const m = a.map((v, axis) => (v + b[axis]) / 2 + (axis === 1 ? .07 : 0));
        const left = m.map((v, axis) => v + tangent[axis] * width), right = m.map((v, axis) => v - tangent[axis] * width);
        vertices.push(...a, ...left, ...b, ...a, ...b, ...right); uvs.push(0, 0, 0, .5, 1, 1, 0, 0, 1, 1, 1, .5);
      }
      for (let i = 0; i < (mobile ? 9 : 12); i++) {
        const angle = i / (mobile ? 9 : 12) * TAU + .11, length = 3.6 + rand() * 1.5, sine = Math.sin(angle), cosine = Math.cos(angle), drop = 1.5 + rand() * .8;
        const point = t => [sine * length * t, crown + Math.sin(t * Math.PI) * 1.12 - drop * t * t, cosine * length * t];
        for (let j = 0; j < 7; j++) {
          const t = (j + .3) / 7, a = point(t), b = point((j + 1) / 7);
          blade(a, b, .035, [cosine, 0, -sine]);
          for (const side of [-1, 1]) {
            const reach = (.85 - t * .4) * (1 - t * .45);
            const tip = [a[0] + cosine * side * reach - sine * .30, a[1] - .38 - t * .5, a[2] - sine * side * reach - cosine * .30];
            blade(a, tip, .16 * (1 - t * .5), [sine, .1, cosine]);
          }
        }
      }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.computeVertexNormals(); bake(geo, palmLeaf);
    } else if (['cedar', 'cypress'].includes(street.trees)) {
      for (let tier = 0; tier < 5; tier++) {
        const level = height * (.30 + tier * .135), radius = height * (street.trees === 'cedar' ? .235 - tier * .038 : .115 - tier * .014);
        for (let branch = 0; branch < (mobile ? 4 : 6); branch++) {
          const angle = branch / (mobile ? 4 : 6) * TAU + tier * .71, x = Math.cos(angle) * radius * .57, z = Math.sin(angle) * radius * .57;
          beam([0, level + .3, 0], [x * 1.6, level - .18, z * 1.6], .07, bark);
          for (let card = 0; card < 2; card++) bake(new THREE.PlaneGeometry(radius * 1.75, radius * 1.2), leaf, x, level, z, -.38 + card * .65, angle + card * Math.PI / 2, -.13);
        }
      }
      bake(new THREE.PlaneGeometry(height * .18, height * .22), leaf, 0, height * .96, 0);
    } else {
      // Preserve the surrounding plot/ground random sequence: the old canopy
      // consumed 15 samples per branch, including its three large paper faces.
      for (let sample = 0; sample < (mobile ? 7 : 10) * 15; sample++) rand();
      const canopy = random(Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663) ^ Math.round(height * 100));
      const crownScale = Math.max(.72, Math.min(1.3, height / 12)), broad = ['banyan', 'oak', 'plane'].includes(street.trees), gum = street.trees === 'gum';
      for (let branch = 0; branch < (mobile ? 5 : 7); branch++) {
        const angle = branch / (mobile ? 5 : 7) * TAU + canopy() * .75, radius = (.9 + canopy() * 1.6) * crownScale * (broad ? 1.18 : .94);
        const xx = Math.cos(angle) * radius, zz = Math.sin(angle) * radius, y = height * (.63 + canopy() * .24);
        beam([0, height * .43, 0], [xx, y - .25, zz], .15, bark);
        for (let card = 0; card < (mobile ? 6 : 8); card++) {
          const width = (1.45 + canopy() * .8) * crownScale * (gum ? .8 : 1), h = (1.3 + canopy() * .85) * crownScale * (gum ? 1.18 : 1);
          const geometry = new THREE.PlaneGeometry(width, h), p = geometry.attributes.position, normals = geometry.attributes.normal, colors = [];
          const tone = .71 + canopy() * .20;
          for (let vertex = 0; vertex < p.count; vertex++) {
            // Small non-coplanar leaf clusters have depth; curved normals avoid
            // lighting an entire spherical paper segment as one bright panel.
            p.setZ(vertex, (canopy() - .5) * width * .20);
            const normal = new THREE.Vector3(p.getX(vertex) / width * .8, p.getY(vertex) / h * .45, 1).normalize();
            normals.setXYZ(vertex, normal.x, normal.y, normal.z);
            const shade = tone * (vertex < 2 ? 1 : .9); colors.push(shade * .95, shade, shade * .93);
          }
          geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
          bake(geometry, leaf, xx + (canopy() - .5) * width * .9, y + (canopy() - .5) * h * .8, zz + (canopy() - .5) * width * .9,
            (canopy() - .5) * 1.7, canopy() * TAU, (canopy() - .5) * .9);
        }
      }
    }
    if (!inGround && !['oak', 'cypress', 'gum'].includes(street.trees)) box(2.2, .45, 2.2, stone, 0, .225, 0);
  }

  if (city === 'taipei') {
    const x = -55, z = 90; reserve(x, z, 91, 'Taipei 101'); setFrame(x, z);
    box(126, 18, 94, stone, 0, 9, 0); facade(112, 12, 86, windowMaterials[4], 0, 18, 0);
    box(132, .8, 100, steel, 0, 24.5, 0);
    cylinder(43, 49, 68, glass, 0, 58, 0, 4, 0, Math.PI / 4);
    for (let tier = 0; tier < 8; tier++) {
      const base = 92 + tier * 36;
      cylinder(39, 33, 34.5, glass, 0, base + 17.25, 0, 4, 0, Math.PI / 4);
      cylinder(40, 40, 1.5, steel, 0, base + 35, 0, 4, 0, Math.PI / 4);
      for (let floor = 0; floor < 8; floor++) {
        const y = base + 2 + floor * 4.1, side = (33 + (y - base) / 34.5 * 6) * Math.SQRT2;
        cornice(side, side, y, steel, .16);
      }
      for (const side of [-1, 1]) for (const axis of [-1, 1]) {
        beam([side * 23.3, base, axis * 23.3], [side * 27.6, base + 34, axis * 27.6], .8, steel);
        cylinder(2.3, 2.3, 1.2, gold, side * 28, base + 32, axis * 28, 12, Math.PI / 2);
      }
    }
    cylinder(22.5, 26, 54, glass, 0, 407, 0, 4, 0, Math.PI / 4);
    cylinder(16, 22.5, 30, steel, 0, 449, 0, 4, 0, Math.PI / 4);
    cylinder(2.2, 16, 24, glass, 0, 476, 0, 4, 0, Math.PI / 4);
    cylinder(.6, 2.1, 20, steel, 0, 498, 0, 12);
    for (let y = 28; y < 89; y += 4.1) cornice(66, 66, y, steel, .13);
    sign('TAIPEI 101', '台北 101・信義商圈', 0, 12, -47.1, 30, '#164c43');
    // TICC's pink stone bands and deep upper loggia replace the anonymous
    // glass podium; this is an authored landmark on the adapted street circuit.
    const civicStone = surface(materials.concrete, '#b8a0a3', { roughness: .9 });
    setFrame(-147, -80); box(142, .16, 112, paving, 0, .01, 0);
    box(82, 23, 70, civicStone, 0, 11.5, 0);
    box(82, 10, 54, civicStone, 0, 28, 8);
    box(82, 3, 16, civicStone, 0, 31.5, -27);
    for (const xx of [-37, -10, 17, 37]) box(6, 7, 16, civicStone, xx, 26.5, -27);
    box(58, 7, 42, civicStone, 9, 36.5, 12);
    for (const level of [6, 14, 22]) box(82.1, 2.2, 70.1, stone, 0, level, 0);
    for (const xx of [-29, -21, 21, 29]) {
      box(2, 17, .12, darkGlass, xx, 12, -35.1);
      for (let level = 5; level < 20; level += 3) box(2.1, .13, .15, steel, xx, level, -35.2);
    }
    box(22, 3.8, .12, glass, 0, 8, -35.1); box(22, 3.8, .12, glass, 0, 17, -35.1);
    sign('台北國際會議中心', 'TAIPEI INTERNATIONAL CONVENTION CENTER', 0, 3.4, -35.3, 27, '#685652');
    reserve(-147, -80, 60, 'Taipei International Convention Center');
    for (const xx of [-205, -185, -107, -87]) if (clearFootprint(xx, -133, 7, 7, 0, 3)) tree(xx, -133, 12);
  } else if (city === 'kualalumpur') {
    const x = -55, z = 95; reserve(x, z, 120, 'Petronas KLCC'); setFrame(x, z);
    box(154, 25, 118, stone, 0, 12.5, 0); facade(147, 19, 113, windowMaterials[0], 0, 26.5, 0);
    for (const center of [-48, 48]) {
      let bottom = 31;
      for (const [h, radius] of [[147, 27], [92, 24], [58, 20], [40, 16], [26, 12]]) {
        const shape = new THREE.Shape();
        for (let i = 0; i < 16; i++) { const angle = i / 16 * TAU, r = radius * (i % 2 ? .78 : 1); if (i) shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r); else shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r); }
        shape.closePath(); const geo = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, steps: 1 }); geo.rotateX(-Math.PI / 2);
        bake(geo, glass, center, bottom, 0);
        for (let y = bottom; y < bottom + h; y += 4.1) cylinder(radius + .22, radius + .22, .5, steel, center, y, 0, 16);
        for (let i = 0; i < 8; i++) { const angle = i / 8 * TAU; beam([center + Math.cos(angle) * radius, bottom, Math.sin(angle) * radius], [center + Math.cos(angle) * radius, bottom + h, Math.sin(angle) * radius], .45, steel); }
        bottom += h;
      }
      cylinder(6, 12, 18, steel, center, 403, 0, 16); cylinder(2.5, 6, 15, steel, center, 419.5, 0, 16);
      cylinder(.3, 2.5, 25, steel, center, 439.5, 0, 12);
    }
    box(58.4, 7.5, 7, glass, 0, 173.75, 0); box(61, .7, 8.3, steel, 0, 178, 0); box(61, .7, 8.3, steel, 0, 170, 0);
    for (const side of [-1, 1]) { beam([side * 38, 132, 0], [side * 14, 170, 0], 1.5); beam([side * 38, 132, 0], [side * 15, 170, 0], .55); }
    for (let i = -27; i <= 27; i += 3.5) box(.15, 7, 7.1, steel, i, 174, 0);
    sign('SURIA KLCC', 'KUALA LUMPUR CITY CENTRE', 0, 18, -59.2, 33, '#355449');
    setFrame(100, -20); cylinder(21, 24, 1.2, stone, 0, .6, 0, 48);
    cylinder(20, 20, .15, material('#77aaa9', { metalness: .22, roughness: .24 }), 0, 1.25, 0, 48);
    for (let i = 0; i < 15; i++) { const angle = i / 15 * TAU; cylinder(.08, .11, 2.2 + Math.sin(angle * 3) * .4, white, Math.cos(angle) * 11, 2, Math.sin(angle) * 11, 5); }
    reserve(100, -20, 27, 'KLCC fountain');
    setFrame(-515, 145); cylinder(3.8, 5, 275, stone, 0, 137.5, 0, 16);
    cylinder(24, 28, 23, glass, 0, 290, 0, 32); cylinder(12, 24, 24, steel, 0, 313.5, 0, 24);
    cylinder(.7, 8, 65, steel, 0, 358, 0, 16); cylinder(.3, .7, 30, steel, 0, 406, 0, 10);
    reserve(-515, 145, 40, 'KL Tower');
  } else if (city === 'kobe') {
    const x = -60, z = -110; reserve(x, z, 33, 'Kobe Port Tower'); setFrame(x, z);
    cylinder(13, 14, 6, stone, 0, 3, 0, 24);
    const levels = 14, sides = 16;
    for (let row = 0; row < levels; row++) for (let side = 0; side < sides; side++) {
      const angle = side / sides * TAU, next = (side + 1) / sides * TAU;
      const y = 6 + row * 6, yy = 6 + (row + 1) * 6;
      const radius = 7.7 + Math.pow((row - 7) / 7, 2) * 6.3, rr = 7.7 + Math.pow((row + 1 - 7) / 7, 2) * 6.3;
      beam([Math.cos(angle) * radius, y, Math.sin(angle) * radius], [Math.cos(next) * rr, yy, Math.sin(next) * rr], .48, red);
      beam([Math.cos(next) * radius, y, Math.sin(next) * radius], [Math.cos(angle) * rr, yy, Math.sin(angle) * rr], .48, red);
      beam([Math.cos(angle) * radius, y, Math.sin(angle) * radius], [Math.cos(next) * radius, y, Math.sin(next) * radius], .3, red);
    }
    cylinder(13, 15, 14, glass, 0, 97, 0, 32); cylinder(15.6, 15.6, 1, red, 0, 90, 0, 32);
    for (let i = 0; i < 32; i++) { const angle = i / 32 * TAU; beam([Math.cos(angle) * 14, 90, Math.sin(angle) * 14], [Math.cos(angle) * 13, 104, Math.sin(angle) * 13], .3, red); }
    cylinder(14, 15.4, 2, red, 0, 105, 0, 32); cylinder(13.5, 14, 2, white, 0, 107, 0, 32);
    sign('KOBE', 'PORT TOWER', 0, 101.5, -14.2, 16, '#af322b');
    setFrame(68, -140); reserve(68, -140, 64, 'Kobe Maritime Museum');
    box(94, 8, 64, white, 0, 4, 0); facade(91, 6, 62, windowMaterials[1], 0, 6, 0);
    for (let rib = 0; rib <= 12; rib++) {
      const z = -29 + rib * 4.8;
      for (let step = 0; step < 13; step++) {
        const u = step / 13, v = (step + 1) / 13;
        const roofY = t => 9 + 26 * (t - rib / 12) ** 2 + t * 5;
        const y = roofY(u), yy = roofY(v);
        beam([-46 + u * 92, y, z], [-46 + v * 92, yy, z], .32, white);
        if (rib < 12) { beam([-46 + u * 92, y, z], [-46 + v * 92, yy, z + 4.8], .18, white); beam([-46 + u * 92, y, z], [-46 + u * 92, y, z + 4.8], .22, white); }
      }
    }
    sign('神戸海洋博物館', 'KOBE MARITIME MUSEUM', 0, 5, -32.2, 31, '#56747c');
    setFrame(180, -130); reserve(180, -130, 62, 'Harbor hotel');
    for (let level = 0; level < 19; level++) { const length = 94 - Math.pow(level / 18, 1.65) * 58; box(36, 3, length, white, 0, 2 + level * 3.3, 0); box(36.5, .35, length + .7, steel, 0, 3.6 + level * 3.3, 0); facade(34, 2.7, length - 1, windowMaterials[1], 0, 2 + level * 3.3, 0); }
  } else if (city === 'london') {
    const x = -150, z = -50; reserve(x, z, 124, 'Palace of Westminster'); setFrame(x, z);
    box(46, 29, 182, stone, 0, 14.5, 35); box(49, 1.3, 187, stone, 0, 29.5, 35);
    box(48, 8, 179, roof, 0, 33.5, 35);
    for (let i = 0; i < 29; i++) {
      const zz = -52 + i * 6.25;
      for (const side of [-1, 1]) {
        box(.6, 30.5, .8, stone, side * 23.5, 16, zz);
        for (const y of [9, 18.2, 26]) box(.12, 5.7, 2.7, darkGlass, side * 23.62, y, zz + 2.4);
        cylinder(0, .8, 4.5, stone, side * 24, 33.4, zz, 4, 0, Math.PI / 4);
      }
    }
    box(14, 60, 14, stone, 0, 30, -62);
    for (let level = 0; level < 10; level++) cornice(14, 14, 4 + level * 5.5, stone, .25);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(1.6, 73, 1.6, stone, sx * 6.3, 36.5, -62 + sz * 6.3); cylinder(0, 1.45, 8, gold, sx * 6.3, 78, -62 + sz * 6.3, 4, 0, Math.PI / 4); }
    box(14.5, 13.5, 14.5, stone, 0, 67, -62);
    const clockMat = material('#ffffff', { map: clockMap(), roughness: .55 });
    for (const side of [-1, 1]) { panel(7.4, 7.4, clockMat, 0, 67, -62 + side * 7.31, side < 0 ? Math.PI : 0); panel(7.4, 7.4, clockMat, side * 7.31, 67, -62, side * Math.PI / 2); }
    box(12, 8.5, 12, stone, 0, 78, -62);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(.5, 8.8, .5, gold, sx * 5.9, 78, -62 + sz * 5.9);
    cylinder(1.4, 9.3, 12.5, roof, 0, 88.5, -62, 4, 0, Math.PI / 4); cylinder(.14, 1, 2.25, gold, 0, 95, -62, 8);
    for (let i = 0; i < 7; i++) { box(12 - i * 1.5, .25, 12 - i * 1.5, gold, 0, 82.7 + i * 1.6, -62); }
    sign('WESTMINSTER', 'HOUSES OF PARLIAMENT', 0, 4, -56.3, 11, '#3e4543');
    setFrame(-150, 165); box(18, 58, 18, stone, 0, 29, 0); cylinder(0, 13, 17, roof, 0, 66.5, 0, 4, 0, Math.PI / 4);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { box(3, 70, 3, stone, sx * 8, 35, sz * 8); cylinder(0, 2.2, 7, stone, sx * 8, 73, sz * 8, 4); }
    const eyeX = 500, eyeZ = 10; reserve(eyeX, eyeZ, 77, 'London Eye'); setFrame(eyeX, eyeZ, -.12);
    const radius = 61, centerY = 72;
    for (const side of [-1, 1]) { const torus = new THREE.TorusGeometry(radius, .55, mobile ? 5 : 8, mobile ? 96 : 128); bake(torus, white, 0, centerY, side * 2); }
    for (let i = 0; i < 32; i++) {
      const angle = i / 32 * TAU, px = Math.sin(angle) * radius, py = centerY + Math.cos(angle) * radius;
      beam([0, centerY, -3], [px, py, -2], .15, steel); beam([0, centerY, 3], [px, py, 2], .15, steel);
      const capsule = new THREE.SphereGeometry(1, mobile ? 10 : 16, mobile ? 6 : 8); capsule.scale(3.8, 2.3, 2.1); bake(capsule, glass, px, py, 0);
      bake(new THREE.TorusGeometry(2.25, .16, 5, 16), white, px, py, 0, Math.PI / 2);
    }
    for (const side of [-1, 1]) { beam([side * 27, 0, -28], [0, centerY, 0], 2.3, white); beam([side * 22, 0, 22], [0, centerY, 0], 1.8, white); }
    cylinder(3, 3, 10, steel, 0, centerY, 0, 16, Math.PI / 2);
    setFrame(510, 130); box(95, 24, 49, stone, 0, 12, 0); facade(92, 20, 47, windowMaterials[1], 0, 15, 0); box(97, 2, 51, roof, 0, 25, 0);
    reserve(510, 130, 68, 'South Bank facade');
  }

  const extra = addExtraCityLandmarks({ scene, track, mobile, groundHeight, materials });
  reserved.push(...(extra.reserved || []));
  // Preserve narrow sightlines rather than clearing whole districts around monuments.
  const vistas = { taipei: [[-55, 90]], kualalumpur: [[-55, 95]], kobe: [[-60, -110]], london: [[-150, -112]], sydney: [[-485, 25]], sanfrancisco: [[-480, 510]], vancouver: [[-485, 25]] }[city] || [];
  if (city === 'melbourne') { const station = extra.reserved?.find(item => item.name === 'Flinders Street Station'); if (station) vistas.push([station.x, station.z]); }
  for (const [x, z] of vistas) {
    const distance = Math.hypot(x - track.spawn.x, z - track.spawn.z);
    for (let along = 20; along < distance; along += 23) reserve(track.spawn.x + (x - track.spawn.x) * along / distance, track.spawn.z + (z - track.spawn.z) * along / distance, 12, 'Landmark sightline');
  }

  const shops = {
    taipei: [['信義路', 'XINYI ROAD'], ['松仁路', 'SONGREN ROAD'], ['市府路', 'CITY HALL'], ['台北市', 'TAIPEI CITY']],
    kualalumpur: [['JALAN AMPANG', 'KLCC'], ['JALAN P. RAMLEE', 'KUALA LUMPUR'], ['PERSIARAN KLCC', 'CITY CENTRE'], ['JALAN SULTAN ISMAIL', 'BUKIT BINTANG']],
    kobe: [['メリケンパーク', 'MERIKEN PARK'], ['ハーバーランド', 'HARBORLAND'], ['神戸港', 'PORT OF KOBE'], ['海岸通', 'KAIGAN DORI']],
    london: [['WESTMINSTER', 'CITY OF LONDON'], ['VICTORIA EMBANKMENT', 'RIVER THAMES'], ['PARLIAMENT SQUARE', 'WESTMINSTER'], ['SOUTH BANK', 'WATERLOO']],
    sydney: [['CIRCULAR QUAY', 'SYDNEY HARBOUR'], ['GEORGE STREET', 'THE ROCKS'], ['BENNELONG POINT', 'OPERA HOUSE'], ['HICKSON ROAD', 'DAWES POINT']],
    goldcoast: [['SURFERS PARADISE', 'GOLD COAST'], ['THE ESPLANADE', 'BEACHFRONT'], ['CAVILL AVENUE', 'SURFERS PARADISE'], ['SURF PARADE', 'QUEENSLAND']],
    melbourne: [['FLINDERS STREET', 'MELBOURNE'], ['SWANSTON STREET', 'CITY CENTRE'], ['SOUTHBANK', 'YARRA RIVER'], ['FEDERATION SQUARE', 'FLINDERS STREET']],
    paris: [['QUAI BRANLY', 'PARIS'], ['CHAMP DE MARS', 'TOUR EIFFEL'], ['PONT D’IÉNA', 'LA SEINE'], ['AVENUE DE SUFFREN', 'PARIS VII']],
    prague: [['KARLŮV MOST', 'CHARLES BRIDGE'], ['STARÉ MĚSTO', 'OLD TOWN'], ['MALÁ STRANA', 'PRAGUE'], ['NÁBŘEŽÍ', 'VLTAVA']],
    newcastle: [['QUAYSIDE', 'NEWCASTLE UPON TYNE'], ['GATESHEAD', 'TYNE BRIDGE'], ['MILLENNIUM BRIDGE', 'RIVER TYNE'], ['GREY STREET', 'NEWCASTLE']],
    sanfrancisco: [['MARINA BOULEVARD', 'SAN FRANCISCO'], ['GOLDEN GATE', 'PACIFIC COAST'], ['LOMBARD STREET', 'NORTH BEACH'], ['PRESIDIO', 'CALIFORNIA']],
    newyork: [['BROADWAY', 'MANHATTAN'], ['5TH AVENUE', 'NEW YORK'], ['BROOKLYN BRIDGE', 'EAST RIVER'], ['CENTRAL PARK', 'MIDTOWN']],
    vancouver: [['CANADA PLACE', 'VANCOUVER'], ['COAL HARBOUR', 'BURRARD INLET'], ['WEST CORDOVA ST', 'DOWNTOWN'], ['STANLEY PARK', 'BRITISH COLUMBIA']],
    hanoi: [['HỒ HOÀN KIẾM', 'HOAN KIEM LAKE'], ['PHỐ HÀNG ĐÀO', 'OLD QUARTER'], ['TRÀNG TIỀN', 'HANOI'], ['NHÀ HÁT LỚN', 'OPERA HOUSE']],
    lisbon: [['AVENIDA DA ÍNDIA', 'LISBOA'], ['BELÉM', 'RIO TEJO'], ['ALFAMA', 'ELÉCTRICO 28'], ['PRAÇA DO COMÉRCIO', 'LISBON']],
    marseille: [['VIEUX PORT', 'MARSEILLE'], ['QUAI DU PORT', 'PROVENCE'], ['LA CANEBIÈRE', 'CENTRE VILLE'], ['NOTRE DAME', 'LA GARDE']],
    nice: [['PROMENADE DES ANGLAIS', 'NICE'], ['BAIE DES ANGES', 'CÔTE D’AZUR'], ['LE NEGRESCO', 'LA PROMENADE'], ['PLACE MASSÉNA', 'VIEUX NICE']],
    warwick: [['CASTLE LANE', 'WARWICK'], ['HIGH STREET', 'OLD TOWN'], ['RIVER AVON', 'CASTLE BRIDGE'], ['SMITH STREET', 'WARWICKSHIRE']],
    bangkok: [['ถนนเจริญกรุง', 'CHAROEN KRUNG ROAD'], ['วัดอรุณ', 'WAT ARUN'], ['แม่น้ำเจ้าพระยา', 'CHAO PHRAYA RIVER'], ['ถนนมหาราช', 'MAHA RAT ROAD']],
  }[city];
  const britishPlaque = ['london', 'newcastle', 'warwick'].includes(city), continentalPlaque = ['paris', 'prague', 'lisbon', 'marseille', 'nice'].includes(city);
  const roadSigns = (city === 'taipei' ? shops.slice(0, 1) : shops).map(([title, sub]) => material('#ffffff', { map: signMap(title, sub, britishPlaque ? '#e4e2d6' : continentalPlaque ? city === 'prague' ? '#975347' : '#294c66' : '#1a594b', britishPlaque ? '#353837' : '#f4f4e7', mobile ? .5 : 1), roughness: .85 }));
  const localShopNames = ({
    taipei: [['巷口咖啡', 'COFFEE & TEA'], ['信義茶行', 'TAIWAN TEA'], ['城市書房', 'BOOKS & CULTURE'], ['台灣日常', 'LOCAL GOODS']],
    kualalumpur: [['KEDAI KOPI', 'KOPI & ROTI'], ['TAMAN BOOKS', 'BOOKS & STATIONERY'], ['AMPANG KITCHEN', 'NASI & TEH'], ['BUNGA FLORIST', 'FLOWERS & GIFTS']],
    kobe: [['海岸珈琲', 'COFFEE'], ['港ベーカリー', 'BAKERY'], ['神戸の書店', 'BOOKS'], ['喫茶海風', 'TEA & COFFEE']],
    london: [['THE RIVER LANTERN', 'PUBLIC HOUSE'], ['WESTMINSTER BOOKS', 'BOOKSELLER'], ['GARDEN & TABLE', 'CAFÉ'], ['VICTORIA PHARMACY', 'CHEMIST']],
    sydney: [['HARBOUR COFFEE', 'ROASTERS'], ['THE SANDSTONE', 'PUBLIC HOUSE'], ['QUAY BOOKS', 'BOOKSHOP'], ['ROCKS PANTRY', 'BAKERY']],
    goldcoast: [['SURF & SUN', 'SURF SHOP'], ['COASTAL COFFEE', 'ESPRESSO'], ['THE BEACH HOUSE', 'APARTMENTS'], ['OCEAN PANTRY', 'LOCAL MARKET']],
    melbourne: [['LANEWAY COFFEE', 'ROASTERS'], ['YARRA BOOKS', 'BOOKSHOP'], ['THE GREEN TRAM', 'CAFÉ'], ['FLINDERS PANTRY', 'BAKERY']],
    paris: [['CAFÉ DES QUAIS', 'CAFÉ & BRASSERIE'], ['BOULANGERIE', 'PAIN & PÂTISSERIE'], ['LIBRAIRIE DU PARC', 'LIVRES'], ['FLEURS DE SEINE', 'FLEURISTE']],
    prague: [['KAVÁRNA U MOSTU', 'KÁVA & ČAJ'], ['KNIHKUPECTVÍ', 'KNIHY'], ['PEKAŘSTVÍ', 'ČERSTVÉ PEČIVO'], ['STARÁ LÉKÁRNA', 'LÉKÁRNA']],
    newcastle: [['THE TYNE LANTERN', 'PUBLIC HOUSE'], ['QUAYSIDE BOOKS', 'BOOKSELLER'], ['RIVER ROAST', 'COFFEE'], ['THE OLD WHARF', 'BAKERY']],
    bangkok: [['ร้านกาแฟ', 'COFFEE'], ['ก๋วยเตี๋ยว', 'NOODLES'], ['ขายของชำ', 'GROCERY'], ['ร้านหนังสือ', 'BOOKS']],
    sanfrancisco: [['MARINA COFFEE', 'ROASTERS'], ['BAY BOOKS', 'BOOKSHOP'], ['PRESIDIO PANTRY', 'BAKERY'], ['THE CYPRESS', 'LOCAL GOODS']],
    newyork: [['CORNER DELI', 'GROCERY & COFFEE'], ['CITY BAGELS', 'BAKERY'], ['PARKSIDE BOOKS', 'BOOKSHOP'], ['EASTSIDE LAUNDRY', 'WASH & FOLD']],
    vancouver: [['HARBOUR COFFEE', 'ROASTERS'], ['COAL HARBOUR', 'RESIDENCES'], ['PACIFIC BOOKS', 'BOOKSHOP'], ['CEDAR MARKET', 'LOCAL GOODS']],
    hanoi: [['CÀ PHÊ', 'COFFEE'], ['PHỞ HÀ NỘI', 'PHỞ'], ['TẠP HÓA', 'GROCERY'], ['TRÀ & BÁNH', 'TEA & BAKERY']],
    lisbon: [['CAFÉ DO TEJO', 'CAFÉ & PASTELARIA'], ['LIVRARIA DA COLINA', 'LIVROS'], ['MERCEARIA', 'PRODUTOS LOCAIS'], ['AZULEJOS & ARTE', 'ARTESANATO']],
    marseille: [['CAFÉ DU PORT', 'CAFÉ & BRASSERIE'], ['LA BOULANGERIE', 'PAIN & VIENNOISERIES'], ['LA MARÉE', 'POISSONNERIE'], ['LIBRAIRIE DES QUAIS', 'LIVRES']],
    nice: [['CAFÉ AZUR', 'CAFÉ & GLACES'], ['PÂTISSERIE', 'GÂTEAUX & PAIN'], ['FLEURS DE LA BAIE', 'FLEURISTE'], ['LA LIBRAIRIE', 'LIVRES']],
    warwick: [['THE AVON LANTERN', 'PUBLIC HOUSE'], ['CASTLE BOOKS', 'BOOKSHOP'], ['SMITH STREET TEA', 'TEA ROOM'], ['THE OLD BAKERY', 'BREAD & CAKES']],
  })[city] || shops;
  const shopSigns = (city === 'taipei' ? localShopNames.slice(0, 3) : localShopNames).map(([title, sub], i) => material('#ffffff', { map: signMap(title, sub, city === 'taipei' ? ['#4c6253', '#964e3f', '#526c72', '#8f7953'][i] : ['#455c59', '#6c685a', '#725349', '#516c78'][i], undefined, mobile ? .5 : 1), roughness: .88 }));
  const taipeiBladeSigns = city === 'taipei' ? ['咖啡茶飲', '信義茶行', '城市書房'].map((title, index) => material('#ffffff', { map: canvasMap(mobile ? 64 : 128, mobile ? 256 : 512, (c, w, h) => {
    c.fillStyle = ['#526b53', '#a45943', '#456979', '#a17f41'][index]; c.fillRect(0, 0, w, h);
    c.strokeStyle = '#dad6b7'; c.lineWidth = w * .025; c.strokeRect(w * .055, h * .018, w * .89, h * .964);
    c.fillStyle = '#f4efda'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `700 ${w * .68}px Arial, sans-serif`;
    Array.from(title).forEach((letter, row) => c.fillText(letter, w / 2, h * (.15 + row * .23)));
  }), roughness: .83 })) : [];
  let taipeiScooters = 0, taipeiTaxis = 0;
  function parkedScooter(x, z, yaw, index) {
    const previous = frame;
    const point = new THREE.Vector3(x, 0, z).applyMatrix4(previous), lift = track.nearest(point.x, point.z).y + .10 - point.y;
    frame = previous.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x, lift, z), new THREE.Quaternion().setFromAxisAngle(up, yaw), scale));
    const body = index % 4 === 0 ? red : index % 4 === 1 ? white : charcoal;
    for (const wheel of [-.58, .56]) {
      cylinder(.23, .23, .12, charcoal, 0, .24, wheel, mobile ? 8 : 12, 0, 0, Math.PI / 2);
      cylinder(.11, .11, .125, steel, 0, .24, wheel, 8, 0, 0, Math.PI / 2);
    }
    box(.42, .10, 1.2, roof, 0, .33, -.02);
    const rearShell = new THREE.SphereGeometry(1, mobile ? 7 : 10, 5); rearShell.scale(.225, .16, .34); bake(rearShell, body, 0, .57, .21);
    box(.47, .11, .69, charcoal, 0, .80, .18);
    const legShield = new THREE.SphereGeometry(1, mobile ? 7 : 10, 5); legShield.scale(.225, .30, .115); bake(legShield, body, 0, .65, -.48, -.12);
    box(.37, .16, .21, body, 0, 1.01, -.47);
    box(.21, .095, .025, white, 0, 1.01, -.59);
    box(.24, .17, .025, white, 0, .48, .72);
    beam([-.29, 1.06, -.46], [.29, 1.06, -.46], .032, steel);
    for (const side of [-1, 1]) {
      beam([side * .25, 1.06, -.46], [side * .31, 1.25, -.41], .025, steel);
      box(.11, .075, .03, darkGlass, side * .31, 1.26, -.42);
    }
    frame = previous; taipeiScooters++;
  }
  function building(x, z, w, h, d, yaw, index, near = false, wrapSide = 0, district = null, infill = false, massing = null) {
    if (cityGroundLevel(city, x, z) < 4 || !clearFootprint(x, z, w, d, yaw, 3)) return false;
    if (city !== 'taipei' && urbanJunctionAt(track, track.nearest(x, z).s, Math.min(w, d) / 2 + 2) && track.nearest(x, z).distance < 65) return false;
    const placedDistrict = cityDistrictForPoint(track, x, z), localDistrict = district || placedDistrict;
    if (near && placedDistrict.density === 0) return false;
    const footprint = { x, z, w, h, d, yaw, near, massing, layer: infill ? 'neighbourhood' : near ? 'frontage' : 'skyline', family: street.family, district: localDistrict.district, frontage: localDistrict.frontage, districtHeights: localDistrict.heights, districtDensity: localDistrict.density };
    setFrame(x, z, yaw); footprints.push(footprint);
    box(w + 1, .22, d + 1, stone, 0, -.045, 0);
    box(w + 4, .07, d + 4, paving, 0, .035, 0);
    const modernSkyline = district?.facades === 'modern' || !near && ['sydney', 'melbourne', 'bangkok', 'newyork'].includes(city);
    const mat = city === 'taipei' && wrapSide && index === 2 ? taipeiCornerFacade : windowMaterials[modernSkyline ? 3 + index % 3 : ['sydney', 'melbourne', 'bangkok', 'newyork'].includes(city) ? index % 3 : index % 6];
    const towerProfile = ['klcc-rounded', 'manhattan-setbacks', 'victorian-laneways', 'rocks-sandstone', 'thai-shophouse'].includes(street.family) && h > 50 ? index % 4 : 0;
    const roundedKL = street.family === 'klcc-rounded' && h > 35 && index % 3 === 0;
    const physical = near && !modernSkyline && !roundedKL && h <= 55 && !(city === 'taipei' && index % 6 >= 4) ? { index, record: footprint } : null;
    const stepped = city === 'taipei' && near && massing?.upperSetback && index % 6 < 4;
    const roofX = stepped ? -w * (1 - massing.inset) * .24 : 0, roofZ = stepped ? d * .115 : 0;
    if (roundedKL) {
      for (const [top, bottom, hh, yy] of [[w * .39, w * .46, h * .84, h * .42], [w * .25, w * .35, h * .16, h * .92]]) {
        const geo = new THREE.CylinderGeometry(top, bottom, hh, mobile ? 16 : 24), uv = geo.attributes.uv;
        for (let vertex = 0; vertex < uv.count; vertex++) uv.setXY(vertex, uv.getX(vertex) * (top + bottom) * Math.PI / 16, uv.getY(vertex) * hh / 25);
        bake(geo, mat, 0, yy, 0);
      }
      for (let floor = 3.6; floor < h * .84; floor += 3.6) {
        const radius = w * (.46 - .07 * floor / (h * .84)); cylinder(radius + .13, radius + .13, .17, steel, 0, floor, 0, mobile ? 16 : 24);
      }
    } else if (towerProfile === 1 && h > 55) {
      const lower = h * .24, upper = h - lower;
      facade(w, lower, d, mat); facade(w * .78, upper, d * .76, mat, 0, lower + upper / 2, 0);
      cornice(w, d, lower + .2, stone, .5); cornice(w * .78, d * .76, h + .3, steel, .2);
    } else if (towerProfile === 2 && h > 70) {
      const lower = h * .56, middle = h * .29, top = h - lower - middle;
      facade(w, lower, d, mat); facade(w * .8, middle, d * .86, mat, 0, lower + middle / 2, 0);
      facade(w * .58, top, d * .66, mat, 0, lower + middle + top / 2, 0);
      for (const [ww, dd, yy] of [[w, d, lower], [w * .8, d * .86, lower + middle], [w * .58, d * .66, h]]) cornice(ww, dd, yy + .2, stone, .3);
    } else {
      if (city === 'taipei' && near) {
        // Upper floors project over a genuinely recessed, walkable arcade.
        if (index % 6 >= 4) {
          const setback = h * .76;
          facade(w, setback - 4.35, d, mat, 0, (setback + 4.35) / 2);
          facade(w * .82, h - setback, d * .83, mat, 0, (h + setback) / 2);
          cornice(w, d, setback + .1, stone, .25);
        } else if (massing?.upperSetback) {
          const lower = h - 7, inset = massing.inset;
          facade(w, lower - 4.35, d, mat, 0, (lower + 4.35) / 2, 0, physical);
          facade(w * inset, 7, d * .77, mat, -w * (1 - inset) * .24, lower + 3.5, d * .115, physical);
          cornice(w, d, lower + .1, stone, .22);
        } else if (index % 6 === 3) {
          facade(w * .84, h - 4.35, d, mat, 0, (h + 4.35) / 2, 0, physical);
          facade(w * .16, h * .67 - 4.35, d * .85, mat, w * .42, (h * .67 + 4.35) / 2, d * .075, physical);
        } else facade(w, h - 4.35, d, mat, 0, (h + 4.35) / 2, 0, physical);
        box(w - (wrapSide ? 3 : 0), 4.35, d - 3, stone, wrapSide ? -wrapSide * 1.5 : 0, 2.175, 1.5);
      } else if (near && ['london', 'sydney', 'kualalumpur', 'goldcoast', 'melbourne', 'newyork', 'vancouver', 'paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick'].includes(city)) {
        const ground = city === 'goldcoast' ? 4.7 : 3.9;
        facade(w, h - ground, d, mat, 0, (h + ground) / 2, 0, physical);
        box(w, ground, d - 1.1, stone, 0, ground / 2, .55);
      } else facade(w, h, d, mat, 0, h / 2, 0, physical ? { ...physical, bottom: 3.9 } : null);
      cornice(stepped ? w * massing.inset : city === 'taipei' && near && index % 6 >= 3 ? w * (index % 6 === 3 ? .84 : .82) : w, stepped ? d * .77 : city === 'taipei' && near && index % 6 >= 4 ? d * .83 : d, h + .3, stone, .45, roofX, roofZ);
    }
    const heritageRoof = !modernSkyline && ['mansard', 'slate', 'tile', 'gable'].includes(street.roof)
      && !(city === 'sydney' && index % 3 !== 2) && !(city === 'london' && index % 3 !== 2);
    const roofRise = heritageRoof ? city === 'warwick' ? 4.3 : city === 'sanfrancisco' ? 3.3 : ['prague', 'lisbon'].includes(city) ? 4.5 : 3.8 : 0;
    if (heritageRoof) {
      pitchedRoof(w, d, h + .5, roofRise, street.roof === 'mansard', ['sanfrancisco', 'warwick'].includes(city) || city === 'prague' && index % 3 === 0, mat);
      if (near && street.roof === 'mansard') for (let xx = -w * .36; xx <= w * .37; xx += 6.3) {
        box(2.5, 2.5, 2.7, stone, xx, h + 2, -d * .37);
        box(1.4, 1.8, .06, darkGlass, xx, h + 2, -d * .37 - 1.38);
        box(2.8, .3, 3, roof, xx, h + 3.4, -d * .37, -.13);
      }
      if (city === 'warwick' && near && index % 3 !== 1) {
        for (const side of [-1, 1]) { beam([-w / 2, h + .6, side * (d / 2 + .45)], [0, h + roofRise + .5, side * (d / 2 + .45)], .20, charcoal); beam([0, h + roofRise + .5, side * (d / 2 + .45)], [w / 2, h + .6, side * (d / 2 + .45)], .20, charcoal); }
      }
    } else if (roundedKL) {
      cylinder(w * .254, w * .254, .35, steel, 0, h + .17, 0, mobile ? 16 : 24);
      cylinder(w * .16, w * .16, .2, roof, 0, h + .4, 0, mobile ? 16 : 24);
    } else {
      const upperW = massing?.upperSetback && index % 6 < 4 ? w * massing.inset : city === 'taipei' && near && index % 6 >= 3 ? w * (index % 6 === 3 ? .84 : .82) : towerProfile === 1 && h > 55 ? w * .78 : towerProfile === 2 && h > 70 ? w * .58 : w;
      const upperD = massing?.upperSetback && index % 6 < 4 ? d * .77 : city === 'taipei' && near && index % 6 >= 4 ? d * .83 : towerProfile === 1 && h > 55 ? d * .76 : towerProfile === 2 && h > 70 ? d * .66 : d;
      box(upperW - .7, .4, upperD - .7, roof, roofX, h + .8, roofZ);
      if (h > 32) { box(upperW * .32, 2.3, upperD * .27, stone, roofX, h + 1.8, roofZ); box(3, 1.7, 4, steel, roofX + upperW * .26, h + 1.6, roofZ + upperD * .24); }
      if (towerProfile === 3 && h > 65) {
        for (const xx of [-w * .39, w * .39]) box(.45, h, .35, steel, xx, h / 2, -d / 2 - .2);
        for (let level = 9; level < h; level += 12) box(w + .25, .25, d + .25, charcoal, 0, level, 0);
      }
    }
    if (['surfers-balconies', 'coalharbor-ribbons'].includes(street.family)) {
      const band = city === 'goldcoast' ? white : stone;
      for (let level = 4; level < h; level += city === 'goldcoast' ? 3.2 : 3.5) {
        box(w + 1.7, .22, d + .8, band, 0, level, 0);
        for (const side of [-1, 1]) box(w + 1.3, .8, .07, glass, 0, level + .53, side * (d / 2 + .39));
      }
      for (const xx of [-w * .36, w * .36]) box(.55, h, d + .25, band, xx, h / 2, 0);
    }
    if (near && city === 'melbourne' && !modernSkyline) {
      box(w + .5, .7, .85, stone, 0, h + .8, -d / 2 - .1);
      for (let xx = -w / 2 + .45; xx < w / 2; xx += 4.3) { box(.65, 1.4, .85, stone, xx, h + 1.15, -d / 2 - .1); box(.85, .18, 1, stone, xx, h + 1.9, -d / 2 - .1); }
      if (index % 3 !== 1) {
        const pediment = new THREE.Shape(); pediment.moveTo(-w * .20, 0); pediment.lineTo(0, 1.75); pediment.lineTo(w * .20, 0); pediment.closePath();
        const geo = new THREE.ExtrudeGeometry(pediment, { depth: .62, bevelEnabled: false }); bake(geo, stone, 0, h + 1.15, -d / 2 - .48);
      }
    }
    if (street.family === 'tudor-sandstone' && index % 3 !== 1) {
      for (const side of [-1, 1]) {
        for (const level of [0, h * .5, h]) box(w + .1, .2, .14, charcoal, 0, level, side * (d / 2 + .05));
        for (let xx = -w / 2; xx <= w / 2; xx += 3) {
          box(.18, h, .16, charcoal, xx, h / 2, side * (d / 2 + .08));
          if (index % 2) beam([xx, h * .51, side * (d / 2 + .15)], [Math.min(w / 2, xx + 2.8), h - .15, side * (d / 2 + .15)], .16, charcoal);
        }
      }
    }
    if (near && street.family === 'victorian-bays') {
      for (const side of [-1, 1]) {
        box(w * .52, h * .64, 1.7, stone, 0, h * .54, side * (d / 2 + .68));
        for (let level = 4; level < h - 1; level += 3.3) for (const xx of [-w * .19, 0, w * .19]) box(w * .13, 2.25, .09, darkGlass, xx, level, side * (d / 2 + 1.56));
        cornice(w * .56, d + 3.1, h * .86, stone, .15);
      }
    }
    if (near && ['oldquarter-tubes', 'thai-shophouse'].includes(street.family)) {
      for (const side of [-1, 1]) {
        for (let level = 4; level < h; level += 3.2) {
          box(w - .4, .17, .8, stone, 0, level, side * (d / 2 + .34));
          box(w - .5, .07, .06, charcoal, 0, level + .8, side * (d / 2 + .71));
          for (let xx = -w * .38; xx <= w * .4; xx += .7) box(.035, .8, .04, charcoal, xx, level + .4, side * (d / 2 + .71));
        }
      }
      for (const xx of [-w * .24, w * .24]) cylinder(.32, .32, .7, steel, xx, h + 1.1, 1.4, 8);
      box(w - .5, .5, d - .5, stone, 0, h + .6, 0);
    }
    if (city === 'newyork') {
      if (near && !modernSkyline) {
        for (let floor = 7; floor < Math.min(h, 35); floor += 3.7) {
          box(3.4, .13, 1.15, charcoal, -w * .23, floor, -d / 2 - .59);
          for (const xx of [-w * .23 - 1.6, -w * .23 + 1.6]) box(.065, .9, .06, charcoal, xx, floor + .45, -d / 2 - 1.12);
          beam([-w * .23 - 1.5, floor, -d / 2 - 1.08], [-w * .23 + 1.5, floor - 3.7, -d / 2 - 1.08], .13, charcoal);
        }
      }
      if (!modernSkyline && index % 3 === 0) { cylinder(1.6, 1.6, 3.1, bark, 0, h + 3.2, 0, 12); cylinder(0, 1.8, .7, roof, 0, h + 5.1, 0, 12); for (const xx of [-1, 1]) box(.16, 2.1, .16, steel, xx, h + 1.9, 0); }
    }
    if (near) {
      if (city === 'taipei') {
        const bays = Math.max(2, Math.round(w / 5.5)), bayWidth = w / bays;
        box(w + .8, .42, 4.3, stone, 0, 4.16, -d / 2 - 1.45);
        box(w + .6, .22, .25, charcoal, 0, 4.0, -d / 2 - 3.5);
        for (let bay = 0; bay < bays; bay++) {
          const xx = -w / 2 + (bay + .5) * bayWidth;
          if ((index + bay) % 4 === 0) {
            box(bayWidth - .45, 2.8, .08, steel, xx, 1.7, -d / 2 + 2.89);
            for (let rib = .35; rib < 3.02; rib += .18) box(bayWidth - .48, .022, .08, charcoal, xx, rib, -d / 2 + 2.83);
          } else panel(bayWidth - .45, 2.8, taipeiStorefront, xx, 1.7, -d / 2 + 2.93, Math.PI);
          for (const edge of [-1, 1]) box(.12, 2.9, .18, steel, xx + edge * (bayWidth - .45) / 2, 1.72, -d / 2 + 2.81);
          box(.07, 2.75, .15, steel, xx + bayWidth * .13, 1.73, -d / 2 + 2.8);
          box(.08, .6, .12, steel, xx + bayWidth * .13 - .17, 1.35, -d / 2 + 2.65);
          panel(bayWidth - .38, .91, shopSigns[(index + bay) % shopSigns.length], xx, 3.6, -d / 2 + 2.78, Math.PI);
          if ((index + bay) % 3 !== 0) panel(bayWidth - .28, .65, shopSigns[(index + bay + 1) % shopSigns.length], xx, 3.83, -d / 2 - 3.61, Math.PI);
          box(.46, 4.05, .53, stone, -w / 2 + bay * bayWidth, 2.02, -d / 2 - 3.25);
        }
        box(.46, 4.05, .53, stone, w / 2, 2.02, -d / 2 - 3.25);
        if (index % 4 === 0 || track.nearest(x, z).s < 85) for (let scooter = 0; scooter < Math.min(mobile ? 2 : 3, bays); scooter++) parkedScooter(-w * .33 + scooter * 1.1, -d / 2 - 2.05, (index % 3 - 1) * .13, index + scooter);
        if (wrapSide) {
          box(3.15, .36, d + .55, stone, wrapSide * (w / 2 + 1.05), 4.10, .05);
          box(.18, .14, d + .55, charcoal, wrapSide * (w / 2 + 2.60), 3.91, .05);
          const sideBays = Math.max(2, Math.round((d - 3) / 5));
          for (let bay = 0; bay < sideBays; bay++) {
            const zz = -d / 2 + 3.7 + (bay + .5) * (d - 3.4) / sideBays;
            panel((d - 3.4) / sideBays - .32, 2.8, taipeiStorefront, wrapSide * (w / 2 - 2.91), 1.7, zz, wrapSide * Math.PI / 2);
            panel((d - 3.4) / sideBays - .28, .65, shopSigns[(index + bay + 2) % shopSigns.length], wrapSide * (w / 2 + 2.63), 3.64, zz, wrapSide * Math.PI / 2);
            box(.46, 4.0, .47, stone, wrapSide * (w / 2 + 2.42), 2.0, zz + (d - 3.4) / sideBays / 2);
          }
          for (let scooter = 0; scooter < (mobile ? 2 : 3); scooter++) parkedScooter(wrapSide * (w / 2 + 1.30), -d * .18 + scooter * 1.1, -wrapSide * Math.PI / 2, index + scooter);
        }
        // Exposed slab edges, balcony service bays and AC units distinguish the
        // tiled mid-rise blocks from the glass offices, as on Xinyi Road.
        if (index % 6 < 4) {
          for (let y = 7.85; y < (stepped ? h - 7 : h) - 1; y += 3.5) {
            box(w + .22, .18, .32, stone, 0, y, -d / 2 - .12);
            if (index % 3 !== 0) {
              box(3.5, .18, .95, stone, w * .25, y - .35, -d / 2 - .41);
              box(3.35, .7, .07, charcoal, w * .25, y + .06, -d / 2 - .84);
              for (let bar = -1; bar <= 1; bar++) box(.05, .72, .06, steel, w * .25 + bar, y + .04, -d / 2 - .86);
            }
            if (index % 2) { box(1.15, .62, .53, steel, -w * .30, y + .3, -d / 2 - .34); box(.91, .35, .04, charcoal, -w * .30, y + .3, -d / 2 - .63); }
          }
        }
        const pipeHeight = stepped ? h - 7 : index % 6 >= 4 ? h * .76 : h, pipeX = w * (index % 6 >= 3 ? .39 : .48);
        for (const xx of [-pipeX, pipeX]) cylinder(.055, .055, pipeHeight - 4.1, steel, xx, (pipeHeight + 4.1) / 2, -d / 2 - .19, 6);
        cornice(stepped ? w * massing.inset : index % 6 >= 3 ? w * (index % 6 === 3 ? .84 : .82) : w, stepped ? d * .77 : index % 6 >= 4 ? d * .83 : d, h + 1.14, stone, .2, roofX, roofZ);
        const bladeX = w * (index % 2 ? -.34 : .34), bladeZ = -d / 2 - 2.8, bladeHeight = index % 3 === 0 ? 3.1 : index % 3 === 1 ? 4.6 : 5.3;
        box(.08, bladeHeight + .06, 1.15, charcoal, bladeX, 5.0 + bladeHeight / 2, bladeZ);
        panel(1.10, bladeHeight, taipeiBladeSigns[index % taipeiBladeSigns.length], bladeX + .044, 5.0 + bladeHeight / 2, bladeZ, Math.PI / 2);
        panel(1.10, bladeHeight, taipeiBladeSigns[index % taipeiBladeSigns.length], bladeX - .044, 5.0 + bladeHeight / 2, bladeZ, -Math.PI / 2);
        beam([bladeX, 4.9 + bladeHeight, -d / 2], [bladeX, 4.9 + bladeHeight, bladeZ], .065, steel);
        if (index % 3 === 1) {
          cylinder(.75, .75, 1.6, steel, w * .22, h + 1.2, d * .22, 12);
          cylinder(.79, .79, .12, steel, w * .22, h + 2.03, d * .22, 12);
          box(2.8, 1.8, 3.8, stone, -w * .17, h + .92, d * .17);
        }
      } else if (heritageStorefront) {
        const bays = Math.max(city === 'warwick' ? 1 : 2, Math.round(w / (city === 'london' ? 6.2 : city === 'warwick' ? 5.3 : 5.1))), bayWidth = w / bays;
        for (let bay = 0; bay < bays; bay++) {
          const xx = -w / 2 + (bay + .5) * bayWidth, variant = (index + bay) % 4, geo = new THREE.PlaneGeometry(bayWidth - .35, 2.8), uv = geo.attributes.uv;
          for (let v = 0; v < uv.count; v++) uv.setX(v, (variant + uv.getX(v)) / 4);
          bake(geo, heritageStorefront, xx, 1.72, -d / 2 + 1.04, 0, Math.PI);
          panel(bayWidth - .35, .52, shopSigns[variant], xx, 3.34, -d / 2 + .89, Math.PI);
          for (const edge of [-1, 1]) box(.16, 3.75, 1.18, stone, xx + edge * bayWidth / 2, 1.87, -d / 2 + .52);
          box(bayWidth + .14, .24, 1.34, stone, xx, 3.77, -d / 2 + .46);
          if (variant === 2 && !['warwick', 'prague', 'lisbon'].includes(city) || ['paris', 'nice'].includes(city) && variant === 0) {
            const canopy = ['paris', 'nice'].includes(city) ? variant === 0 ? red : white : roof;
            box(bayWidth - .45, .11, 1.3, canopy, xx, 3.15, -d / 2 - .47, -.15); box(bayWidth - .45, .19, .10, canopy, xx, 2.99, -d / 2 - 1.1);
          }
        }
        for (const xx of [-w * .475, w * .475]) cylinder(.055, .055, h - 1, charcoal, xx, (h - 1) / 2, -d / 2 - .17, 6);
      } else if (city === 'sanfrancisco') {
        const entryX = w * .31;
        box(1.12, 2.45, .08, darkGlass, entryX, 1.67, -d / 2 - .08);
        for (const side of [-1, 1]) box(.15, 2.7, .16, stone, entryX + side * .63, 1.68, -d / 2 - .13);
        box(1.4, .17, .25, stone, entryX, 3.1, -d / 2 - .13);
        for (let step = 0; step < 4; step++) box(1.9, .17, .46, stone, entryX, .08 + step * .17, -d / 2 - 2.3 + step * .45);
        for (const side of [-1, 1]) { beam([entryX + side * 1.05, .7, -d / 2 - 2.15], [entryX + side * 1.05, 1.4, -d / 2 - .40], .07, charcoal); cylinder(.06, .06, .85, charcoal, entryX + side * 1.05, 1.13, -d / 2 - .39, 6); }
        if (index % 2 === 0) { box(2.7, .24, 2.0, stone, entryX, 3.28, -d / 2 - .9); for (const side of [-1, 1]) cylinder(.11, .15, 3.0, stone, entryX + side * 1.15, 1.8, -d / 2 - 1.75, 8); }
      } else {
      const arcade = city === 'taipei' || city === 'kobe';
      if (arcade) box(w + 2, .55, 4.8, stone, 0, 4.4, -d / 2 - 1.6);
      else {
        const awning = index % 2 ? roof : red, shallow = ['london', 'sydney', 'newyork'].includes(city), awningDepth = shallow ? 1.35 : 2.8;
        if (city !== 'goldcoast' || index % 3 === 0) {
          box(Math.min(w - 1, 17), .13, awningDepth, awning, 0, 3.15, -d / 2 - awningDepth * .42, -.15);
          box(Math.min(w - 1, 17), .25, .1, awning, 0, 2.98, -d / 2 - awningDepth * .90);
          for (const side of [-1, 1]) beam([side * Math.min(w / 2 - 1, 8), 2.85, -d / 2 - .1], [side * Math.min(w / 2 - 1, 8), 3.04, -d / 2 - awningDepth * .87], .045, charcoal);
        }
      }
      for (let i = -Math.floor(w / 9) / 2; i <= Math.floor(w / 9) / 2; i++) {
        const xx = i * 7.7, inset = ['london', 'sydney', 'kualalumpur', 'goldcoast', 'melbourne', 'newyork', 'vancouver'].includes(city) && !roundedKL ? 1.02 : -.06;
        box(Math.min(5.8, w - 1), 2.7, .09, darkGlass, xx, 1.6, -d / 2 + inset);
        for (const edge of [-1, 1]) box(.10, 2.8, .16, city === 'london' ? charcoal : steel, xx + edge * Math.min(5.8, w - 1) / 2, 1.6, -d / 2 + inset - .06);
        box(.09, 2.8, .16, steel, xx + .63, 1.6, -d / 2 + inset - .06);
        box(.08, .45, .12, steel, xx + .79, 1.3, -d / 2 + inset - .14);
        if (arcade) box(.6, 4.5, .6, stone, xx + 3.65, 2.2, -d / 2 - 3.4);
      }
      panel(Math.min(city === 'goldcoast' ? 9 : 14, w - 3), ['london', 'sydney', 'goldcoast'].includes(city) ? .75 : 1.2, shopSigns[index % shopSigns.length], 0, city === 'goldcoast' ? 3.85 : 3.45, -d / 2 - .2, Math.PI);
      }
      if (physical && ['london', 'newcastle', 'paris'].includes(city)) {
        const ground = 3.9, floors = Math.max(1, Math.round((h - ground) / CITY_FACADE_DEPTH_PROFILES[city].floor)), floorHeight = (h - ground) / floors;
        for (let level = 0; level < floors; level++) {
          const y = ground + level * floorHeight;
          if (city === 'paris' && level > 0 || level === 1) box(w + .2, .14, .28, stone, 0, y, -d / 2 - .06);
          if (city === 'paris' && (level === 1 || level === floors - 1) || city === 'london' && level === 0 && index % 3 !== 1) {
            box(w - .2, .15, .72, stone, 0, y + .03, -d / 2 - .28);
            box(w - .3, .055, .06, charcoal, 0, y + .86, -d / 2 - .63);
            for (let xx = -w / 2 + .22; xx < w / 2 - .1; xx += mobile ? 1.05 : .42) box(.03, .76, .04, charcoal, xx, y + .46, -d / 2 - .63);
          }
        }
      }
      for (let level = 1; !physical && level < Math.min(6, h / 5); level++) {
        const y = 5.5 + level * 3.4;
        if (['london', 'newcastle', 'paris'].includes(city)) {
          if (city === 'paris' || level === 1 || level === 4) box(w + .5, .18, city === 'paris' ? .7 : .32, stone, 0, y, -d / 2 -.12);
          for (let i = -w * .4; i < w * .4; i += 5) { box(3, .4, .5, stone, i, y + 2.7, -d / 2 - .2); box(.25, 2.3, .25, stone, i - 1.4, y + 1.35, -d / 2 - .17); }
        }
        if ((city === 'paris' && (level === 1 || level === 4)) || index % 3 === 2 && !['warwick', 'hanoi', 'bangkok', 'sanfrancisco', 'goldcoast', 'vancouver', 'london'].includes(city)) {
          for (let i = -w * .35; i < w * .36; i += 7) { box(5, .25, 1.8, stone, i, y, -d / 2 - .5); box(5, .08, .08, steel, i, y + 1, -d / 2 - 1.3); for (let k = -2; k <= 2; k++) box(.05, 1, .05, steel, i + k, y + .5, -d / 2 - 1.3); }
        }
      }
      if (['london', 'newcastle', 'paris', 'warwick'].includes(city)) for (let i = -w / 3; i < w / 2; i += 9) { box(1.3, 2.6, 1.1, stone, i, h + roofRise + .6, 0); cylinder(.18, .2, .65, red, i, h + roofRise + 2.2, 0, 7); }
    }
    return true;
  }
  for (const side of [-1, 1]) {
    let cursor = city === 'taipei' ? 18 : 25, index = 0;
    while (cursor < track.length) {
      const district = cityDistrictAt(track, cursor, side), w = range(district.widths || street.widths), d = range(district.depths || street.depths);
      const s = cursor + w / 2, advance = Math.max(w + (district.gap ?? 2), district.spacing) * (.94 + rand() * .12);
      cursor += advance; index++;
      if (district.density === 0 || rand() > district.density || s >= district.to * track.length - w / 2) continue;
      if (city === 'taipei' && Math.abs(s - getTaipeiJunctions(track)[0].s) < 41) continue;
      const massing = streetMassing(city, district, s, side, index);
      const p = track.sample(s), offset = track.wallOffset + district.setback + massing.setback + d * .5;
      const x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side, yaw = p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      building(x, z, w, massing.height, d, yaw, massing.facade, true, 0, district, false, massing);
    }
  }
  if (city === 'taipei') {
    const junction = getTaipeiJunctions(track)[0], p = junction.center;
    // A street-view comparison requires occupied side streets, not a hole
    // through the racing facade row into an otherwise empty city interior.
    for (const side of [-1, 1]) for (const edge of [-1, 1]) for (let plot = 0; plot < 4; plot++) {
      const w = [18, 16, 22, 18][plot], d = [19, 22, 18, 21][plot], h = plot === 0 && side > 0 && edge > 0 ? 39.4 : [19.6, 26.2, 16.3, 29.5][(plot + (edge > 0 ? 1 : 0)) % 4];
      const across = side * (32 + plot * 23), along = edge * (junction.width / 2 + d / 2 + 5.1);
      const x = p.x + p.nx * across + Math.sin(p.heading) * along, z = p.z + p.nz * across + Math.cos(p.heading) * along;
      const yaw = p.heading + (edge > 0 ? 0 : Math.PI), index = plot === 0 ? side > 0 ? 2 : 1 : [2, 0, 1, 3][(plot + (side > 0 ? 1 : 0)) % 4];
      building(x, z, w, h, d, yaw, index, true, plot === 0 ? -side * edge : 0);
    }
  }
  for (let x = -760; x <= 760; x += street.grid[0]) for (let z = -690; z <= 720; z += street.grid[1]) {
    const xx = x + (rand() - .5) * street.grid[0] * .38, zz = z + (rand() - .5) * street.grid[1] * .4, near = track.nearest(xx, zz);
    if (near.distance < (street.sector === 'village' ? 105 : 85)) continue;
    if ((street.sector === 'east' && xx < 30) || (street.sector === 'west' && xx > 30)
      || (street.sector === 'north' && zz < -100) || (street.sector === 'south' && zz > 280)) continue;
    if (xx > -265 && xx < 260 && zz > -265 && zz < 270) continue;
    if (street.sector === 'village' && Math.abs(xx) + Math.abs(zz) > 940) continue;
    const district = cityDistrictForPoint(track, xx, zz);
    if (rand() > district.skylineDensity || district.density === 0 && near.distance < district.groundWidth + 150) continue;
    const height = range(street.skyline), width = range(street.widths) * (height > 50 ? 1.28 : 1), depth = range(street.depths);
    const yaw = street.sector === 'blocks' ? Math.round(near.heading / (Math.PI / 2)) * Math.PI / 2 : near.heading + Math.PI / 2;
    building(xx, zz, width, height, depth, yaw, Math.floor(rand() * 6), false, 0, district);
  }

  // Occupied blocks continue behind the racing frontage; the open shores and
  // landmark reservations still govern every plot. This creates parallax and
  // closes the empty gaps that previously exposed a bare concrete plain.
  for (const side of mobile ? [] : [-1, 1]) for (let s = 35, index = 0; s < track.length; s += mobile ? 72 : 46, index++) {
    const district = cityDistrictAt(track, s, side);
    if (!district.density || ['garden', 'park', 'woodland', 'cliff', 'beach', 'quay', 'port'].includes(district.frontage)) continue;
    for (let row = 1; row <= (mobile ? 1 : 2); row++) {
      const p = track.sample(s + row * 14), d = range(street.depths), w = range(district.widths || street.widths);
      const offset = track.wallOffset + district.setback + street.depths[1] + 14 + row * (d + 13);
      const x = p.x + p.nx * side * offset, z = p.z + p.nz * side * offset, yaw = p.heading + (side > 0 ? Math.PI / 2 : -Math.PI / 2);
      if (footprints.some(b => Math.hypot(b.x - x, b.z - z) < (Math.hypot(w, d) + Math.hypot(b.w, b.d)) * .46)) continue;
      const h = range(district.heights);
      building(x, z, w, h, d, yaw, city === 'taipei' ? index % 4 : index % 6, false, 0, district, true);
    }
  }

  const districtSurfaces = new Map();
  function districtSurface(kind) {
    if (kind === 'paving') return paving;
    if (kind === 'rock') return materials.rock;
    if (!districtSurfaces.has(kind)) {
      const base = kind === 'grass' ? materials.terrain : materials.shoulder;
      const tint = kind === 'grass' ? '#8ca36d' : kind === 'pebble' ? '#aaa99d' : '#e0d3b3';
      const mat = base ? surface(base, tint, { vertexColors: true, side: THREE.FrontSide }) : material(tint, { vertexColors: true, roughness: 1, side: THREE.FrontSide });
      // The sparse-grass scan includes dark, dry soil. Normalize its linear
      // reflectance instead of multiplying it by another dark olive tint.
      if (kind === 'grass' && mat.map) {
        const dry = ['goldcoast', 'lisbon', 'marseille', 'nice', 'sanfrancisco'].includes(city);
        const tropical = ['taipei', 'kualalumpur', 'bangkok', 'hanoi'].includes(city);
        mat.color.setRGB(...(dry ? [1.15, 1.8, 1.35] : tropical ? [.95, 2.25, 1.45] : [.95, 2.15, 1.6]));
      }
      mat.userData.seasonGround = true; mat.userData.cityDistrictGround = true; districtSurfaces.set(kind, mat);
    }
    return districtSurfaces.get(kind);
  }
  const groundPieces = new Map(), districtStep = mobile ? 24 : 16;
  function groundTriangles(points) {
    return [[points[0], points[1], points[2]], [points[0], points[2], points[3]]].flatMap(triangle => clipGroundTriangle(triangle, groundSurfaceHeight.grid));
  }
  for (let s = 0; s < track.length; s += districtStep) for (const side of [-1, 1]) {
    const district = cityDistrictAt(track, s + districtStep / 2, side);
    if (!district.ground || district.groundWidth <= 0) continue;
    const p = track.sample(s), q = track.sample(Math.min(s + districtStep, track.length)), start = track.wallOffset + 5.9;
    const mat = districtSurface(district.ground), bands = Math.ceil(district.groundWidth / (mobile ? 24 : 16));
    if (!groundPieces.has(mat)) groundPieces.set(mat, { vertices: [], uvs: [], colors: [] });
    const mesh = groundPieces.get(mat);
    for (let band = 0; band < bands; band++) {
      const lo = start + band * district.groundWidth / bands, hi = start + (band + 1) * district.groundWidth / bands;
      const points = [[p.x + p.nx * side * lo, p.z + p.nz * side * lo], [q.x + q.nx * side * lo, q.z + q.nz * side * lo], [q.x + q.nx * side * hi, q.z + q.nz * side * hi], [p.x + p.nx * side * hi, p.z + p.nz * side * hi]];
      if (points.some(([x, z]) => cityGroundLevel(city, x, z) < (district.ground === 'sand' || district.ground === 'pebble' ? 0 : 4) || track.nearest(x, z).distance < track.wallOffset + 5.2)) continue;
      const mx = points.reduce((v, point) => v + point[0], 0) / 4, mz = points.reduce((v, point) => v + point[1], 0) / 4;
      if (footprints.some(b => {
        const dx = mx - b.x, dz = mz - b.z, lx = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw), lz = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
        return Math.abs(lx) < b.w / 2 + 2 && Math.abs(lz) < b.d / 2 + 2;
      })) continue;
      if (city === 'paris') {
        const dx = mx + 155, dz = mz - 155, lx = dx * Math.cos(-.15) - dz * Math.sin(-.15), lz = dx * Math.sin(-.15) + dz * Math.cos(-.15);
        if (Math.abs(lx) < 70 && Math.abs(lz) < 70) continue;
      }
      // Mirrored sides and tight inner bends can invert an offset cell. Test
      // each triangle's actual orientation rather than assuming a side order.
      for (const triangle of groundTriangles(points)) {
        const [a, b, c] = triangle;
        const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        if (Math.abs(ny) < .01) continue;
        const order = ny > 0 ? triangle : [triangle[0], triangle[2], triangle[1]];
        for (const [x, z] of order) {
          const shade = Math.sin(x / 19) * Math.cos(z / 23) * .035;
          mesh.vertices.push(x, Math.max(groundHeight(x, z), groundSurfaceHeight(x, z)) + .048, z); mesh.uvs.push(x, z);
          if (mat.vertexColors) mesh.colors.push(.95 + shade, 1 + shade, .92 + shade);
        }
      }
    }
  }
  frame.identity();
  for (const [mat, mesh] of groundPieces) if (mesh.vertices.length) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(mesh.vertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(mesh.uvs, 2));
    if (mat.vertexColors) geo.setAttribute('color', new THREE.Float32BufferAttribute(mesh.colors, 3));
    geo.computeVertexNormals(); bake(geo, mat);
  }

  // Local waterfront furniture follows actual existing water edges. These
  // districts never create another river or fill a bridge's channel with land.
  for (let s = 38, index = 0; s < track.length; s += mobile ? 93 : 67, index++) for (const side of [-1, 1]) {
    const district = cityDistrictAt(track, s, side), p = track.sample(s);
    if (!district.ground || district.density > 0 || cityGroundLevel(city, p.x, p.z) < 4) continue;
    if (district.trees > 0) for (let row = 0; row < (district.frontage === 'woodland' && !mobile ? 3 : 1); row++) {
      if (rand() > district.trees) continue;
      const offset = track.wallOffset + 15 + row * 16, x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
      if (cityGroundLevel(city, x, z) < 4 || track.nearest(x, z).distance < track.wallOffset + 10 || reserved.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + 5)) continue;
      tree(x, z, range(street.treeHeight), street.trees === 'palm' || street.trees === 'tropical' && index % 2 === 0, true);
    }
    if (!district.furniture) continue;
    const offset = track.wallOffset + 8.1, x = p.x + p.nx * offset * side, z = p.z + p.nz * offset * side;
    if (cityGroundLevel(city, x, z) < 4 || track.nearest(x, z).distance < track.wallOffset + 6) continue;
    setFrame(x, z, p.heading);
    if (district.furniture === 'port') {
      cylinder(.18, .26, .68, charcoal, 0, .34, 0, 8); cylinder(.28, .28, .1, charcoal, 0, .72, 0, 8);
      if (city === 'kobe' && index % 3 === 0) { box(2.45, 2.55, 6.1, index % 2 ? red : white, side * 8, 1.27, 0); for (let rib = -2.6; rib < 3; rib += .55) box(2.49, 2.48, .045, steel, side * 8, 1.27, rib); }
    } else if (['quay', 'lake', 'promenade', 'garden', 'park'].includes(district.furniture)) {
      box(2.4, .16, .65, district.furniture === 'promenade' ? glass : bark, 0, .57, 0); box(2.4, .55, .10, district.furniture === 'promenade' ? glass : bark, 0, .96, side * .3);
      for (const xx of [-.86, .86]) { box(.12, .56, .50, charcoal, xx, .28, 0); box(.08, .76, .08, charcoal, xx, .85, side * .29); }
    }
    if (['quay', 'lake', 'port'].includes(district.furniture)) {
      let shore = null;
      for (let distance = track.wallOffset + 7; distance <= Math.min(190, track.wallOffset + district.groundWidth + 24); distance += 4) {
        const xx = p.x + p.nx * distance * side, zz = p.z + p.nz * distance * side;
        if (cityGroundLevel(city, xx, zz) < 0) { shore = distance - 3; break; }
      }
      if (shore !== null && shore > track.wallOffset + 10) {
        const xx = p.x + p.nx * shore * side, zz = p.z + p.nz * shore * side;
        setFrame(xx, zz, p.heading);
        box(.65, .85, 32, stone, 0, .42, 0); box(.92, .15, 32.2, paving, 0, .91, 0);
        for (const along of [-14, -7, 0, 7, 14]) cylinder(.035, .045, .83, charcoal, 0, 1.38, along, 6);
        box(.05, .05, 31, charcoal, 0, 1.76, 0);
      }
    }
  }

  const landscapedGround = { kualalumpur: { x: 100, z: -20, radius: 135 }, paris: { x: -155, z: 65, radius: 185, depth: 375 }, warwick: { x: -85, z: 65, radius: 250, depth: 350 } }[city];
  if (landscapedGround) {
    const vertices = [], uvs = [], colors = [], step = mobile ? 12 : 8, { x: cx, z: cz, radius, depth = radius } = landscapedGround;
    const monumentGarden = city === 'paris' || city === 'warwick';
    const occupied = (x, z) => footprints.some(b => {
      const dx = x - b.x, dz = z - b.z, lx = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw), lz = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
      return Math.abs(lx) < b.w / 2 + 4 && Math.abs(lz) < b.d / 2 + 4;
    });
    for (let x = cx - radius; x < cx + radius; x += step) for (let z = cz - depth; z < cz + depth; z += step) {
      const points = [[x, z], [x + step, z], [x + step, z + step], [x, z + step]], mx = x + step / 2, mz = z + step / 2;
      if (((mx - cx) / radius) ** 2 + ((mz - cz) / depth) ** 2 > 1 || points.some(([px, pz]) => cityGroundLevel(city, px, pz) < 4 || track.nearest(px, pz).distance < track.wallOffset + (monumentGarden ? 6 : 8) || occupied(px, pz))) continue;
      // A building reservation protects the skyline; it must not excavate the
      // gardens below that landmark into the city's concrete ground colour.
      if (!monumentGarden && reserved.some(item => item.name !== 'Landmark sightline' && item.name !== 'landmark viewing corridor' && Math.hypot(mx - item.x, mz - item.z) < item.radius + step)) continue;
      if (city === 'paris') {
        const dx = mx + 155, dz = mz - 155, lx = dx * Math.cos(-.15) - dz * Math.sin(-.15), lz = dx * Math.sin(-.15) + dz * Math.cos(-.15);
        if (Math.abs(lx) < 70 && Math.abs(lz) < 70 || Math.abs(mx + 155) < 5 || Math.abs(mz - 155) < 5) continue; // Esplanade and garden paths.
      } else if (city === 'warwick' && Math.abs(mz + 12) < 4 && mx > -232 && mx < -88) continue; // Castle approach path.
      for (const [a, b, c] of groundTriangles(points)) {
        const ny = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
        if (Math.abs(ny) < .01) continue;
        for (const [px, pz] of ny > 0 ? [a, b, c] : [a, c, b]) {
          const shade = Math.sin(px / 19) * Math.cos(pz / 23) * .04 + Math.sin((px + pz) / 7) * .012;
          vertices.push(px, Math.max(groundHeight(px, pz), groundSurfaceHeight(px, pz)) + .045, pz); uvs.push(px, pz); colors.push(.94 + shade, 1 + shade, .91 + shade);
        }
      }
    }
    if (vertices.length) {
      const turf = districtSurface('grass');
      frame.identity(); const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3)); geo.computeVertexNormals(); bake(geo, turf);
    }
    if (monumentGarden) {
      const trees = city === 'paris' ? [[-285, -140, 12], [-270, -101, 14], [-281, -54, 13], [-268, 8, 15], [-280, 76, 13], [-263, 259, 14], [-216, 292, 15], [-42, 269, 12], [2, 215, 14], [1, 98, 13], [-52, -22, 15], [-70, -102, 12]]
        : [[-235, -127, 14], [-242, -77, 15], [-219, 9, 17], [-207, 97, 15], [-210, 203, 17], [-145, 267, 14], [-50, 268, 17], [71, 222, 15], [94, 158, 14], [80, 42, 16], [36, -44, 15], [-37, -127, 13]];
      for (const [index, [x, z, height]] of trees.entries()) {
        if (mobile && index % 3 === 2 || occupied(x, z) || cityGroundLevel(city, x, z) < 4 || track.nearest(x, z).distance < track.wallOffset + 12) continue;
        if (reserved.some(item => item.name === 'landmark viewing corridor' && Math.hypot(x - item.x, z - item.z) < item.radius + 5)) continue;
        tree(x, z, height);
      }
    }
  }

  // Continuous raised sidewalks, correctly spaced lamps, bilingual route signs and closed-course crosswalks.
  for (let s = 0; s < track.length; s += 8) for (const side of [-1, 1]) {
    const junction = city === 'taipei' ? taipeiJunctionAt(track, s + 4, 4) : urbanJunctionAt(track, s + 4, 4);
    if (junction && (junction.cross || junction.side === side || junction.sides?.includes(side))) continue;
    const p = track.sample(s), q = track.sample(s + 8), from = new THREE.Vector3(p.x + p.nx * side * (track.wallOffset + 3.2), p.y - .05, p.z + p.nz * side * (track.wallOffset + 3.2));
    const to = new THREE.Vector3(q.x + q.nx * side * (track.wallOffset + 3.2), q.y - .05, q.z + q.nz * side * (track.wallOffset + 3.2));
    const dir = to.clone().sub(from), middle = to.add(from).multiplyScalar(.5);
    frame.identity(); box(5.2, .3, dir.length() + .12, paving, middle.x, middle.y, middle.z, 0, Math.atan2(dir.x, dir.z));
  }
  for (let s = 18, index = 0; s < track.length; s += city === 'hanoi' ? 37 : city === 'warwick' ? 53 : 45, index++) for (const side of [-1, 1]) {
    if (city === 'taipei' && taipeiJunctionAt(track, s, 4)) continue;
    const district = cityDistrictAt(track, s, side);
    if (['woodland', 'cliff'].includes(district.frontage) && index % 2) continue;
    roadFrame(s, side, track.wallOffset + 3.5);
    const lantern = ['lantern', 'oldquarter'].includes(street.lamps), lampHeight = lantern ? city === 'warwick' ? 4.7 : 6.2 : street.lamps === 'resort' ? 6.7 : 8.5;
    cylinder(.07, .13, lampHeight, charcoal, 0, lampHeight / 2, 0, 7);
    if (lantern) {
      box(.52, .6, .52, charcoal, 0, lampHeight + .3, 0); box(.37, .4, .37, white, 0, lampHeight + .27, 0); cylinder(0, .38, .45, charcoal, 0, lampHeight + .77, 0, 4, 0, Math.PI / 4);
    } else if (['harbor', 'resort', 'quayside'].includes(street.lamps)) {
      cylinder(.16, .26, .4, steel, 0, lampHeight + .1, 0, 10);
      bake(new THREE.SphereGeometry(.42, 10, 7), white, 0, lampHeight + .4, 0);
      if (street.lamps === 'quayside') cylinder(.035, .15, .28, charcoal, 0, lampHeight + .82, 0, 8);
    } else {
      for (const arm of street.lamps === 'twin' ? [-1, 1] : [-1]) { beam([0, lampHeight, 0], [arm * 2.7, lampHeight - .25, 0], .11, steel); box(1, .14, .42, steel, arm * 2.45, lampHeight - .33, 0); box(.76, .03, .29, white, arm * 2.48, lampHeight - .43, 0); }
    }
    if (index % 6 === 0) {
      const yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2, mat = roadSigns[Math.floor(index / 6) % roadSigns.length];
      const w = city === 'taipei' ? 2.2 : britishPlaque ? 2.1 : continentalPlaque ? 2.6 : 5.4, h = city === 'taipei' ? .55 : britishPlaque ? .52 : continentalPlaque ? .65 : 1.35, y = city === 'taipei' ? 3.22 : britishPlaque || continentalPlaque ? 2.9 : 4.5;
      panel(w, h, mat, Math.sin(yaw) * .004, y, .05, yaw);
      panel(w, h, mat, -Math.sin(yaw) * .004, y, .05, yaw + Math.PI);
    }
    if (rand() < district.trees && (!mobile || index % 2 === 0)) {
      const p = track.sample(s + 14), treeOffset = city === 'taipei' ? 2.3 : city === 'kualalumpur' ? 4.5 : 7.4, x = p.x + p.nx * (track.wallOffset + treeOffset) * side, z = p.z + p.nz * (track.wallOffset + treeOffset) * side;
      const overlapsBuilding = footprints.some(b => {
        if (!['taipei', 'kualalumpur'].includes(city)) return Math.hypot(x - b.x, z - b.z) < Math.hypot(b.w, b.d) * .53;
        const dx = x - b.x, dz = z - b.z, lx = dx * Math.cos(b.yaw) - dz * Math.sin(b.yaw), lz = dx * Math.sin(b.yaw) + dz * Math.cos(b.yaw);
        return Math.abs(lx) < b.w / 2 + 1.6 && Math.abs(lz) < b.d / 2 + 1.6;
      });
      if (!(city === 'taipei' && taipeiStreetAt(track, x, z, 3)) && !reserved.some(item => Math.hypot(x - item.x, z - item.z) < item.radius + 5) && !overlapsBuilding) tree(x, z, range(street.treeHeight), street.trees === 'palm' || (street.trees === 'tropical' && index % 2 === 0));
    }
  }
  if (city === 'taipei') addTaipeiStreetDetails({ track, setFrame, box, cylinder, beam, panel, materials: { asphalt: taipeiAsphalt, paving, cornerPaving: taipeiJunctionPaving, white: taipeiWhitePaint, yellow: roadPaint, charcoal, steel, red, green: signalGreen, amber: gold, streetName: roadSigns[0] } });
  addCityRoadMarkings({ track, bake, setFrame, white: roadPaint, yellow: yellowRoadPaint });
  for (const ratio of [.10, .31, .6, .83]) {
    if (city === 'taipei') break;
    const p = track.sample(track.length * ratio); if (Math.abs(p.curvature) > .006) continue;
    setFrame(p.x, p.z, p.heading, p.y + .063);
    for (let x = -track.width / 2 + 1; x <= track.width / 2 - 1; x += 1.25) box(.7, .012, 4.5, roadPaint, x, 0, 0);
    for (const side of [-1, 1]) {
      cylinder(.07, .11, 6, charcoal, side * (track.wallOffset + 1.8), 3, -4.2, 8);
      box(.28, 1.12, .31, charcoal, side * (track.wallOffset + 1.8), 4.5, -4.2);
      for (let lamp = 0; lamp < 3; lamp++) cylinder(.09, .09, .035, lamp === 0 ? red : lamp === 1 ? gold : signalGreen, side * (track.wallOffset + 1.8), 4.83 - lamp * .33, -4.385, 12, Math.PI / 2);
    }
  }
  function parkedVehicle(s, side, bus = false) {
    const p = track.sample(s), offset = track.wallOffset + 11.5;
    const x = p.x + p.nx * side * offset, z = p.z + p.nz * side * offset;
    if (!clearFootprint(x, z, bus ? 2.5 : 1.9, bus ? 11 : 4.7, p.heading, 2)) return;
    setFrame(x, z, p.heading); const color = city === 'taipei' ? taipeiTaxiBody : city === 'london' ? red : white;
    if (bus) {
      const double = city === 'london'; box(2.45, double ? 3.9 : 2.8, 10.8, color, 0, double ? 2.35 : 1.8, 0);
      box(2.5, .82, 8.9, darkGlass, 0, double ? 1.75 : 2.35, .5); if (double) box(2.5, .89, 10, darkGlass, 0, 3.58, .25);
      for (let i = -4; i <= 4; i += 1.25) box(2.52, double ? 3.25 : .86, .1, color, 0, double ? 2.35 : 2.4, i);
    } else { box(1.86, .72, 4.5, color, 0, .88, 0); box(1.57, .65, 2.25, darkGlass, 0, 1.5, -.3); box(1.65, .13, 2.5, color, 0, 1.88, -.3); if (city === 'taipei') { box(.46, .15, .32, white, 0, 2.02, 0); taipeiTaxis++; } }
    for (const xx of [-1, 1]) for (const zz of [-1, 1]) cylinder(bus ? .45 : .31, bus ? .45 : .31, .22, charcoal, xx * (bus ? 1.15 : .85), bus ? .49 : .38, zz * (bus ? 3.4 : 1.45), 12, 0, 0, Math.PI / 2);
  }
  for (let s = 160, index = 0; s < track.length; s += 330, index++) parkedVehicle(s, index % 2 ? 1 : -1, index % 3 === 0);
  if (city === 'taipei') for (const s of [44, 156, 340, 870, 1450, 2050]) {
    const p = track.sample(s), side = 1, x = p.x + p.nx * (track.wallOffset + 1.6), z = p.z + p.nz * (track.wallOffset + 1.6);
    if (taipeiStreetAt(track, x, z, 4)) continue;
    setFrame(x, z, p.heading, p.y + .02);
    box(1.82, .58, 4.55, taipeiTaxiBody, 0, .65, 0); box(1.63, .60, 2.31, darkGlass, 0, 1.19, -.10);
    box(1.72, .12, 2.38, taipeiTaxiBody, 0, 1.52, -.10); box(.46, .14, .31, white, 0, 1.66, -.10);
    for (const xx of [-.87, .87]) for (const zz of [-1.41, 1.43]) cylinder(.29, .29, .19, charcoal, xx, .34, zz, 12, 0, 0, Math.PI / 2);
    for (const xx of [-.60, .60]) { box(.36, .13, .035, white, xx, .71, 2.29); box(.35, .12, .035, red, xx, .74, -2.29); }
    box(.63, .19, .03, white, 0, .47, 2.30); taipeiTaxis++;
  }

  if (city === 'kobe' || city === 'london') {
    frame.identity();
    const water = createCityWaterMaterial(city === 'kobe' ? '#548d9b' : '#6e8787');
    water.userData.cityWater = true; cityWater = water; ownedMaterials.add(water);
    const geo = new THREE.PlaneGeometry(city === 'kobe' ? 2000 : 255, city === 'kobe' ? 1050 : 1700); geo.rotateX(-Math.PI / 2);
    bake(geo, water, city === 'kobe' ? 0 : 229, city === 'kobe' ? 2 : 2.7, city === 'kobe' ? -910 : 0);
    if (city === 'kobe') {
      box(940, 3, 18, stone, 0, 2, -379);
      for (let x = -440; x < 450; x += 12) cylinder(.28, .38, 1, charcoal, x, 4, -383, 8);
      for (let ship = 0; ship < 3; ship++) {
        setFrame(-160 + ship * 193, -435, .18 + ship * .27, 2.4);
        cylinder(8, 11, 75, white, 0, 6, 0, 4, Math.PI / 2, Math.PI / 4); box(13, 7, 35, white, 0, 12, 5); facade(12, 5, 30, windowMaterials[1], 0, 14, 5);
        box(10, 2, 38, red, 0, 17, 6); cylinder(.12, .16, 9, steel, 0, 22, 1, 8);
      }
    } else {
      for (const x of [101, 357]) for (let z = -390; z <= 390; z += 7) {
        if (track.nearest(x, z).distance < track.wallOffset + 12) continue;
        setFrame(x, z, 0, 0); box(5, 3, 7.05, stone, 0, 2.25, 0);
        cylinder(.05, .06, 1.2, charcoal, 0, 4.35, 0, 6); box(.07, .07, 7.05, charcoal, 0, 4.95, 0);
      }
      for (const z of [-315, 320]) {
        setFrame(229, z, 0, 0); box(250, 3.1, 26, stone, 0, 2.1, 0);
        for (let x = -105; x <= 105; x += 42) { box(5, 3.6, 27, stone, x, .8, 0); beam([x - 20, 0, -13], [x, 3.2, -13], .65, steel); beam([x, 3.2, -13], [x + 20, 0, -13], .65, steel); }
      }
    }
  }
  // Low, continuous regional ridges keep the city grounded rather than floating on a plain.
  if (city === 'taipei') {
    frame.identity(); const ridgeMat = material('#657b65', { roughness: 1 });
    const geo = new THREE.PlaneGeometry(2400, 550, 80, 10); geo.rotateX(-Math.PI / 2); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), edge = Math.max(0, 1 - Math.abs(z) / 275); p.setY(i, Math.max(0, (75 + 80 * Math.sin(x / 290) ** 2 + 47 * Math.sin(x / 108) ** 2) * edge)); }
    geo.computeVertexNormals(); bake(geo, ridgeMat, 1100, -10, 150, 0, Math.PI / 2);
  }
  for (const [mat, pieces] of batches) {
    const geometry = mergeGeometries(pieces); pieces.forEach(piece => piece.dispose());
    const mesh = new THREE.Mesh(geometry, mat); mesh.name = `${city}-architecture`; mesh.castShadow = mat !== leaf && !mat.userData.cityRoadPaint && !mat.userData.cityRoadSurface && !mat.userData.seasonGround && !mat.transparent && !mat.userData.cityWater; mesh.receiveShadow = true;
    group.add(mesh); shadowMeshes.push(mesh);
  }
  const urban = addCityUrbanDetails({ scene, track, mobile, groundHeight, groundSurfaceHeight, materials, buildings: footprints, reserved, cityGroundLevel });
  // Unused materials have no world traversal owner and are cleaned immediately.
  for (const mat of ownedMaterials) if (!batches.has(mat)) { mat.map?.dispose(); mat.dispose(); }
  group.userData.landmarks = reserved.map(({ name }) => name); group.userData.buildings = footprints; group.userData.streetProfile = street; group.userData.districtPlan = CITY_DISTRICT_PLANS[city];
  if (city === 'taipei') { group.userData.junctions = getTaipeiJunctions(track); group.userData.parkedScooters = taipeiScooters; group.userData.parkedTaxis = taipeiTaxis; }
  return { group, update(state, elapsed) { extra.update?.(state, elapsed); cityWater?.normalMap.offset.set(elapsed * .004, elapsed * .003); }, setQuality(level) {
    extra.setQuality?.(level); urban.setQuality?.(level);
    for (const mesh of shadowMeshes) mesh.castShadow = level !== 'low' && !mesh.material.transparent && !mesh.material.userData.cityRoadPaint && !mesh.material.userData.cityRoadSurface && !mesh.material.userData.seasonGround && !mesh.material.userData.cityWater && (mesh.material !== leaf || level === 'high');
  } };
}
