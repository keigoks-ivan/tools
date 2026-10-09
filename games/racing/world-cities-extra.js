import * as THREE from 'three';
import { createCityBuilder } from './world-city-kit.js?v=city-drive-14';
import { addAustralianLandmarks, createCityWaterMaterial, addCityWaterPlane } from './world-city-australia.js?v=city-drive-14';
import { addAmericanLandmarks } from './world-city-america.js?v=city-drive-14';
import { addEuropeanLandmarks } from './world-city-europe.js?v=city-drive-14';
import { addKobeStreets } from './world-city-kobe-streets.js?v=city-drive-14';
import { cityDistrictAt, cityDistrictForPoint } from './world-city-districts.mjs?v=city-drive-14';

function streetAtlas(b, city, mobile) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = mobile ? 512 : 1024;
  const c = canvas.getContext('2d'), tile = canvas.width / 4;
  const labels = city === 'hanoi' ? ['CÀ PHÊ', 'PHỞ HÀ NỘI', 'TẠP HÓA', 'TRÀ & BÁNH'] : ['ก๋วยเตี๋ยว', 'ร้านกาแฟ', 'อาหารตามสั่ง', 'ขายของชำ'];
  for (let i = 0; i < 16; i++) {
    const x = i % 4 * tile, y = Math.floor(i / 4) * tile;
    c.save(); c.translate(x, y); c.fillStyle = i < 4 ? '#242d28' : i < 8 ? ['#685949', '#476e69', '#925e43', '#4d6177'][i - 4] : '#b7b8a3'; c.fillRect(0, 0, tile, tile);
    if (i === 0 || i === 1) {
      c.fillStyle = '#c3b28b'; c.fillRect(0, 0, tile, tile * .06); c.fillRect(0, tile * .94, tile, tile * .06);
      for (const side of [0, 1]) {
        const xx = tile * (.04 + side * .50);
        c.fillStyle = i ? '#71837b' : '#655f43'; c.fillRect(xx, tile * .07, tile * .42, tile * .86);
        for (let line = 0; line < 17; line++) { c.fillStyle = line % 2 ? '#363f35' : '#8a8969'; c.fillRect(xx + tile * .02, tile * (.09 + line * .048), tile * .38, tile * .012); }
      }
      c.fillStyle = '#252c29'; c.fillRect(tile * .48, tile * .04, tile * .04, tile * .92);
    } else if (i === 2) {
      c.fillStyle = '#727f7b'; c.fillRect(tile * .04, 0, tile * .92, tile);
      for (let line = 0; line < 35; line++) { c.fillStyle = line % 3 ? '#495950' : '#9aa295'; c.fillRect(tile * .04, line * tile / 35, tile * .92, tile * .018); }
    } else if (i === 3) {
      c.fillStyle = '#182321'; c.fillRect(tile * .04, tile * .04, tile * .92, tile * .92);
      if (city === 'hanoi') {
        c.fillStyle = '#596250'; c.fillRect(tile * .045, tile * .05, tile * .25, tile * .88);
        for (let rack = 0; rack < 4; rack++) {
          c.fillStyle = '#b09c7b'; c.fillRect(tile * .045, tile * (.20 + rack * .18), tile * .25, tile * .018);
          for (let box = 0; box < 3; box++) { c.fillStyle = ['#a69d65', '#748772', '#b78f67'][(rack + box) % 3]; c.fillRect(tile * (.055 + box * .074), tile * (.08 + rack * .18), tile * .057, tile * (.08 + (box % 3) * .02)); }
        }
        for (let bag = 0; bag < 5; bag++) { c.strokeStyle = '#969476'; c.lineWidth = tile * .008; c.beginPath(); c.moveTo(tile * (.36 + bag * .115), 0); c.lineTo(tile * (.36 + bag * .115), tile * (.19 + bag % 2 * .14)); c.stroke(); c.fillStyle = ['#c3bda2', '#a2997d', '#a9826d'][bag % 3]; c.beginPath(); c.ellipse(tile * (.36 + bag * .115), tile * (.23 + bag % 2 * .14), tile * .045, tile * .078, 0, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#7e7660'; c.fillRect(tile * .44, tile * .73, tile * .46, tile * .18);
      } else {
        c.fillStyle = '#5e746c'; c.fillRect(tile * .07, tile * .10, tile * .38, tile * .42); c.fillStyle = '#1d3231'; c.fillRect(tile * .47, tile * .12, tile * .40, tile * .70);
        c.fillStyle = '#a9aea2'; c.fillRect(tile * .08, tile * .68, tile * .76, tile * .035); c.fillStyle = '#66756e'; c.fillRect(tile * .11, tile * .72, tile * .73, tile * .22);
        for (let bowl = 0; bowl < 4; bowl++) { c.fillStyle = '#c9c1a5'; c.beginPath(); c.ellipse(tile * (.20 + bowl * .16), tile * .66, tile * .05, tile * .022, 0, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#d5d0b7'; c.fillRect(tile * .58, tile * .20, tile * .22, tile * .25); c.fillStyle = '#68766c'; for (let row = 0; row < 5; row++) c.fillRect(tile * .60, tile * (.24 + row * .037), tile * .17, tile * .01);
      }
      c.fillStyle = '#bab6a1'; c.fillRect(tile * .02, 0, tile * .027, tile); c.fillRect(tile * .95, 0, tile * .027, tile);
    } else if (i < 8) {
      c.strokeStyle = '#d8d1ac'; c.lineWidth = tile * .02; c.strokeRect(tile * .025, tile * .05, tile * .95, tile * .90);
      c.fillStyle = '#efe9d2'; c.textAlign = 'center'; c.textBaseline = 'middle'; let font = tile * .22;
      c.font = `600 ${font}px Arial, sans-serif`; while (c.measureText(labels[i - 4]).width > tile * .87) { font *= .9; c.font = `600 ${font}px Arial, sans-serif`; }
      c.fillText(labels[i - 4], tile / 2, tile * .47); c.font = `${tile * .075}px Arial, sans-serif`; c.fillText(city === 'hanoi' ? 'HÀNG QUÁN · HÀ NỘI' : 'เจริญกรุง · กรุงเทพ', tile / 2, tile * .77);
    } else if (i < 12) {
      for (let stripe = 0; stripe < 16; stripe++) { c.fillStyle = city === 'hanoi' ? ['#687b67', '#aaa084', '#717d7b', '#927366'][i - 8] : stripe % 2 ? '#b0aa92' : ['#486359', '#746749', '#617881', '#85635e'][i - 8]; c.fillRect(stripe * tile / 16, 0, tile / 16, tile); }
      if (city === 'hanoi') { c.strokeStyle = '#5c665433'; c.lineWidth = tile * .009; for (const seam of [.25, .50, .75]) { c.beginPath(); c.moveTo(seam * tile, 0); c.lineTo(seam * tile, tile); c.stroke(); } }
      c.fillStyle = '#28392b40'; c.fillRect(0, tile * .7, tile, tile * .3);
    } else if (i === 12) {
      c.fillStyle = '#657569'; c.fillRect(0, 0, tile, tile);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 4; col++) { c.strokeStyle = '#334d48'; c.lineWidth = tile * .025; c.strokeRect(col * tile / 4 + tile * .03, row * tile / 5 + tile * .025, tile * .19, tile * .15); }
    } else if (i === 13) {
      c.fillStyle = '#bcbdb1'; c.fillRect(0, 0, tile, tile); c.strokeStyle = '#535e58'; c.lineWidth = tile * .045;
      c.beginPath(); c.arc(tile * .46, tile * .50, tile * .32, 0, Math.PI * 2); c.stroke();
      for (let line = 0; line < 13; line++) { c.fillStyle = '#727b70'; c.fillRect(tile * .12, tile * (.17 + line * .052), tile * .68, tile * .012); }
    } else if (i === 14) {
      c.fillStyle = '#aba082'; c.fillRect(0, 0, tile, tile);
      for (let row = 0; row < 10; row++) for (let col = 0; col < 4; col++) { c.fillStyle = row % 3 ? '#b6ac92' : '#928874'; c.fillRect((col - (row % 2) * .5) * tile / 4 + 1, row * tile / 10 + 1, tile / 4 - 2, tile / 10 - 2); }
    } else {
      c.fillStyle = '#c2bdad'; c.fillRect(0, 0, tile, tile);
      for (let row = 0; row < 5; row++) for (let col = 0; col < 6; col++) { c.fillStyle = '#5e6253'; c.fillRect((col + .3) * tile / 6, (row + .3) * tile / 5, tile * .065, tile * .065); }
    }
    for (let speck = 0; speck < 90; speck++) { c.fillStyle = speck % 3 ? '#30413419' : '#f0e8cb17'; c.fillRect((speck * 37 + i * 13) % tile, (speck * 71 + i * 19) % tile, tile * .025, tile * .008); }
    c.restore();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  return b.material('#ffffff', { map, roughness: .91, side: THREE.DoubleSide });
}

function addAsianStreets(b, options, shared) {
  const { track, mobile, groundHeight } = options, hanoi = track.id === 'hanoi';
  const atlas = streetAtlas(b, track.id, mobile), { dark, roof, white, red } = shared;
  const stone = b.surface(options.materials.concrete, '#d6d0b9', { map: null });
  const iron = b.material('#424c47', { roughness: .82, metalness: .25 });
  const walls = (hanoi ? ['#c5a95e', '#cbc6b0', '#b99954', '#a4b296'] : ['#c3baa0', '#a3afa5', '#c7a879', '#b6a48f']).map(color => b.surface(options.materials.concrete, color, { map: null }));
  const paving = b.surface(options.materials.concrete, '#a7aaa1');
  const blue = b.material('#516f81', { roughness: .78 }), green = b.material('#607c50', { roughness: .86 });
  const occupied = [], footprints = []; let scooters = 0, stools = 0;
  function thinBar(a, end, width) {
    const dx = end[0] - a[0], dy = end[1] - a[1];
    b.box(width, Math.hypot(dx, dy), width, iron, (a[0] + end[0]) / 2, (a[1] + end[1]) / 2, (a[2] + end[2]) / 2, 0, 0, -Math.atan2(dx, dy));
  }
  function panel(tile, w, h, x, y, z, rx = 0, ry = Math.PI) {
    const geometry = new THREE.PlaneGeometry(w, h), uv = geometry.attributes.uv;
    const col = tile % 4, row = Math.floor(tile / 4), inset = .004;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (col + inset + uv.getX(i) * (1 - inset * 2)) / 4, 1 - (row + inset + (1 - uv.getY(i)) * (1 - inset * 2)) / 4);
    b.bake(geometry, atlas, x, y, z, rx, ry);
  }
  function pose(s, side, width, depth, name, clearance = 6) {
    if (cityDistrictAt(track, s, side)?.density === 0) return null;
    const p = track.sample(s), yaw = p.heading + side * Math.PI / 2;
    const c = Math.cos(yaw), sn = Math.sin(yaw);
    for (let attempt = 0; attempt < 8; attempt++) {
      const distance = track.wallOffset + depth / 2 + clearance + attempt * 3;
      const x = p.x + p.nx * side * distance, z = p.z + p.nz * side * distance;
      if (cityDistrictForPoint(track, x, z)?.density === 0) continue;
      if (hanoi && Math.hypot(x, z) < 209) continue;
      if (!hanoi && z < -375) continue;
      const blocked = track.samples.some(q => { const dx = q.x - x, dz = q.z - z; return Math.abs(dx * c - dz * sn) < width / 2 + track.wallOffset + 2 && Math.abs(dx * sn + dz * c) < depth / 2 + 4 + track.wallOffset; });
      if (blocked || occupied.some(q => Math.hypot(x - q.x, z - q.z) < (width + q.width) / 2 + 4)) continue;
      const entry = { x, z, yaw, width, depth, name }; occupied.push(entry); footprints.push(entry); b.reserve(x, z, Math.hypot(width, depth) / 2 + 5, name); b.setFrame(x, z, yaw, Math.max(groundHeight(x, z), p.y - .15)); return entry;
    }
    return null;
  }
  function scooter(x, z, index) {
    const body = [white, red, blue, green][index % 4];
    for (const wheel of [-.57, .57]) { b.cylinder(.225, .225, .13, iron, x, .29, z + wheel, mobile ? 8 : 10, 0, 0, Math.PI / 2); b.cylinder(.10, .10, .14, white, x, .29, z + wheel, 8, 0, 0, Math.PI / 2); }
    b.box(.43, .20, .88, body, x, .55, z + .13); b.box(.44, .09, .65, iron, x, .80, z + .18);
    b.box(.39, .52, .12, body, x, .65, z - .43, -.1); b.box(.30, .12, .16, body, x, 1.01, z - .48);
    b.box(.19, .07, .035, white, x, 1.02, z - .575); b.beam([x - .29, 1.06, z - .44], [x + .29, 1.06, z - .44], .03, iron);
    b.beam([x + .23, 1.06, z - .44], [x + .3, 1.24, z - .37], .025, iron); b.box(.13, .08, .025, dark, x + .31, 1.25, z - .36); scooters++;
  }
  function stool(x, z, color) {
    b.box(.32, .055, .31, color, x, .35, z);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(.035, .31, .035, color, x + sx * .13, .17, z + sz * .125); stools++;
  }
  const sites = [[43, -1], [62, 1], [109, -1], [136, 1], [213, -1], [253, 1], [track.length * .29, -1], [track.length * .42, 1], [track.length * .65, -1], [track.length * .83, 1]];
  for (let block = 0; block < sites.length; block++) {
    const [s, side] = sites[block], bays = block < 4 ? 4 : 3, bay = hanoi ? 3.7 : 5.0, depth = hanoi ? 10.4 : 10.0;
    if (!pose(s, side, bays * bay, depth, `${hanoi ? 'Old Quarter tube-house' : 'Charoen Krung shophouse'} row ${block}`)) continue;
    const width = bays * bay, front = -depth / 2;
    b.box(width + 2.0, .17, depth + 8.6, paving, 0, .045, -2.8);
    for (let segment = 0; segment < Math.ceil(width / 1.2); segment++) b.box(1.18, .18, .26, !hanoi && segment % 2 ? red : stone, -width / 2 + segment * 1.2, .1, front - 5.8);
    for (let tile = 0; tile < width / 2; tile++) b.box(.018, .01, 5.2, iron, -width / 2 + tile * 2, .14, front - 2.8);
    for (let j = 0; j < bays; j++) {
      const index = block * 4 + j, x = (j - (bays - 1) / 2) * bay;
      const floors = hanoi ? 1 + index % 3 : 2 + index % 2, height = 3.75 + floors * 2.9, wall = walls[index % 4];
      b.box(bay - .10, height - 3.4, depth, wall, x, (height + 3.4) / 2, 0);
      b.box(bay - .10, 3.4, depth - 1.8, wall, x, 1.7, .9);
      for (const edge of [-1, 1]) b.box(.26, 3.5, 1.9, stone, x + edge * (bay / 2 - .18), 1.75, front + .90);
      b.box(bay - .34, .12, 1.8, iron, x, 3.42, front + .9); panel(index % 3 === 0 ? 2 : 3, bay - .65, 2.65, x, 1.50, front + 1.79);
      for (let floor = 0; floor < floors; floor++) {
        const y = 5.2 + floor * 2.9;
        if (hanoi) {
          b.box(1.72, 2.38, .10, dark, x, y, front - .065); panel(12, 1.55, 2.23, x, y, front - .13);
          for (const sx of [-1, 1]) { b.box(.51, 2.33, .14, green, x + sx * 1.11, y, front - .20); panel(0, .46, 2.23, x + sx * 1.11, y, front - .285); }
          b.box(2.95, .15, .22, stone, x, y + 1.24, front - .12); b.box(2.94, .14, .29, stone, x, y - 1.24, front - .15);
        } else for (const sx of [-1, 1]) {
          b.box(1.30, 1.94, .09, iron, x + sx * bay * .24, y, front - .045); panel(1, 1.18, 1.82, x + sx * bay * .24, y, front - .10);
          b.box(1.45, .13, .23, stone, x + sx * bay * .24, y - 1.03, front - .12);
        }
        if (!hanoi || floor === 0 && index % 3 !== 1) {
          b.box(bay - .4, .19, 1.0, stone, x, y - 1.02, front - .42);
          b.box(bay - .5, .09, .085, hanoi ? iron : stone, x, y - .15, front - .94);
          for (let bar = 0; bar < (mobile ? 7 : 10); bar++) b.box(.035, .84, .035, hanoi ? iron : stone, x - (bay - .7) / 2 + bar * (bay - .7) / ((mobile ? 7 : 10) - 1), y - .61, front - .94);
          if (hanoi) for (let curl = 0; curl < 4; curl++) { const cx = x - 1.08 + curl * .70; for (let arc = 0; arc < 6; arc++) { const a0 = arc / 6 * Math.PI * 2, a1 = (arc + 1) / 6 * Math.PI * 2; thinBar([cx + Math.sin(a0) * .22, y - .62 + Math.cos(a0) * .27, front - .97], [cx + Math.sin(a1) * .22, y - .62 + Math.cos(a1) * .27, front - .97], .035); } }
        }
      }
      b.box(bay + .03, .28, depth + .30, stone, x, height + .13, 0); b.box(bay - .08, .65, .27, wall, x, height + .43, front + .09);
      for (let stain = 0; stain < 3; stain++) {
        const shape = new THREE.Shape(), width = .17 + stain * .07, h = .42 + ((index + stain) % 3) * .18;
        for (let vertex = 0; vertex < 9; vertex++) { const a = vertex / 8 * Math.PI * 2, radius = .78 + ((vertex * 3 + index) % 5) * .055; const xx = Math.sin(a) * width * radius, yy = Math.cos(a) * h * radius; if (vertex) shape.lineTo(xx, yy); else shape.moveTo(xx, yy); } shape.closePath();
        b.bake(new THREE.ShapeGeometry(shape), paving, x - bay * .40 + stain * .17, height - h * .7, front - .027, 0, Math.PI);
      }
      if ((hanoi && index % 3 !== 0) || (!hanoi && index % 3 === 1)) {
        b.box(bay + .32, .13, depth * .58, roof, x, height + .80, -depth * .24, -.27);
        b.box(bay + .32, .13, depth * .58, roof, x, height + .80, depth * .24, .27);
        b.box(bay + .32, .16, .24, roof, x, height + 1.58, 0);
      }
      b.box(bay - .40, .66, .19, iron, x, 3.87, front - .24); panel(4 + index % 4, bay - .46, .60, x, 3.87, front - .345);
      panel(8 + index % 4, bay - .24, 2.30, x, 3.035, front - 1.24, Math.PI * .37, 0);
      b.box(bay - .2, .24, .10, index % 2 ? green : blue, x, 2.57, front - 2.3);
      for (const edge of [-1, 1]) b.beam([x + edge * (bay * .43), 3.5, front], [x + edge * (bay * .43), 2.55, front - 2.3], .035, iron);
      b.box(.82, .51, .48, white, x + bay * .23, 4.00 + (index % 2) * 2.9, front - .34); panel(13, .70, .42, x + bay * .23, 4.00 + (index % 2) * 2.9, front - .59);
      b.beam([x + bay * .44, .3, front - .12], [x + bay * .44, height, front - .12], .065, iron);
      b.box(.34, .58, .035, paving, x + bay * .42, .40, front - .035);
      if (j === 0 || j === bays - 1) {
        const edge = j === 0 ? -1 : 1, end = x + edge * (bay / 2 - .02);
        for (let floor = 0; floor < floors; floor++) {
          const y = 5.2 + floor * 2.9;
          for (let column = 0; column < 3; column++) {
            const z = front + 1.5 + column * (depth - 3) / 2;
            b.box(.10, 1.96, 1.26, iron, end + edge * .065, y, z); panel(hanoi ? 0 : 1, 1.15, 1.82, end + edge * .13, y, z, 0, edge * Math.PI / 2);
          }
          b.box(.16, .12, depth + .10, stone, end + edge * .04, y - 1.07, 0);
        }
        panel(2, depth * .42, 2.45, end + edge * .10, 1.5, 1.5, 0, edge * Math.PI / 2);
        b.box(.42, .56, .87, white, end + edge * .28, 3.9, front + 2.0); panel(13, .74, .46, end + edge * .50, 3.9, front + 2.0, 0, edge * Math.PI / 2);
        b.beam([end + edge * .14, .2, front + .42], [end + edge * .14, height + .10, front + .42], .08, iron);
      }
      if (j < 3) { scooter(x + .8, front - 3.3 - (index % 2) * .6, index); if (hanoi || index % 2 === 0) scooter(x - .40, front - 3.4, index + 1); }
      if (hanoi || index % 3 === 0) {
        b.box(.76, .06, .63, iron, x - 1.1, .65, front - 2.4);
        b.box(.075, .62, .075, iron, x - 1.1, .32, front - 2.4);
        stool(x - 1.68, front - 2.4, red); stool(x - .85, front - 2.9, index % 2 ? blue : green);
        b.box(.26, .27, .24, green, x + bay * .36, height + .75, front + .30);
      }
    }
    // Cables run beside the circuit, never across the racing corridor.
    for (const edge of [-1, 1]) {
      const x = edge * (width / 2 + .6), z = front - 4.55;
      b.cylinder(.105, .19, 9.0, paving, x, 4.5, z, 8);
      for (const y of [6.3, 7.6]) { b.box(1.9, .10, .13, iron, x, y, z); for (const xx of [-.65, 0, .65]) b.cylinder(.10, .10, .28, iron, x + xx, y + .18, z, 6); }
    }
    for (let line = 0; line < (mobile ? 4 : 7); line++) for (let segment = 0; segment < 8; segment++) {
      const x0 = -width / 2 - .6 + segment * (width + 1.2) / 8, x1 = -width / 2 - .6 + (segment + 1) * (width + 1.2) / 8;
      thinBar([x0, 6.1 + line * .18 - Math.sin(segment / 8 * Math.PI) * .62, front - 4.5 + line * .085], [x1, 6.1 + line * .18 - Math.sin((segment + 1) / 8 * Math.PI) * .62, front - 4.5 + line * .085], line < 2 ? .065 : .025);
    }
    if (block % 3 === 0) {
      b.box(1.5, .87, .72, iron, -width / 2 - .1, .85, front - 2.6); b.box(1.7, .10, .90, stone, -width / 2 - .1, 1.34, front - 2.6);
      for (const side of [-1, 1]) b.cylinder(.20, .20, .10, iron, -width / 2 - .1 + side * .61, .32, front - 2.6, 8, 0, 0, Math.PI / 2);
    }
  }
  const backstreets = [];
  for (const lot of occupied) {
    const width = lot.width + 8, depth = 7.0, distance = (lot.depth + depth) / 2 + 4.5;
    const x = lot.x + Math.sin(lot.yaw) * distance, z = lot.z + Math.cos(lot.yaw) * distance, c = Math.cos(lot.yaw), sn = Math.sin(lot.yaw);
    if (cityDistrictForPoint(track, x, z)?.density === 0) continue;
    if (hanoi && Math.hypot(x, z) < 210 || !hanoi && z < -376) continue;
    const blocked = track.samples.some(q => { const dx = q.x - x, dz = q.z - z; return Math.abs(dx * c - dz * sn) < width / 2 + track.wallOffset + 3 && Math.abs(dx * sn + dz * c) < depth / 2 + track.wallOffset + 3; });
    if (blocked) continue;
    const p = track.sample(track.nearest(x, z).s); b.setFrame(x, z, lot.yaw, Math.max(groundHeight(x, z), p.y - .15)); b.reserve(x, z, Math.hypot(width, depth) / 2 + 3, 'Backstreet service courtyard');
    backstreets.push({ x, z, yaw: lot.yaw, width, depth });
    b.box(width + 1.5, .12, 15, paving, 0, .01, -3.6);
    const bays = hanoi ? 6 : 4, bay = width / bays;
    for (let j = 0; j < bays; j++) {
      const xx = (j - (bays - 1) / 2) * bay, height = hanoi ? 5.8 + j % 3 * 2.8 : 6.2 + j % 2 * 2.3;
      b.box(bay - .10, height, depth, walls[(j + 1) % 4], xx, height / 2, 0); b.box(bay + .03, .14, depth + .34, roof, xx, height + .22, 0, -.08);
      panel(hanoi ? 12 : 2, bay * .66, 2.35, xx, 1.5, -depth / 2 - .04);
      for (let floor = 4.3; floor < height - .65; floor += 2.8) panel(hanoi ? 0 : 1, bay * .45, 1.7, xx, floor, -depth / 2 - .04);
      b.box(.7, .47, .42, white, xx + bay * .28, 3.3, -depth / 2 - .25); b.beam([xx + bay * .41, .25, -depth / 2 - .07], [xx + bay * .41, height, -depth / 2 - .07], .06, iron);
    }
    for (const side of [-1, 1]) { scooter(side * (width / 2 - 1.3), -depth / 2 - 2.0, backstreets.length + (side + 1)); b.box(1.15, .48, .8, stone, side * (width / 2 - 2.4), .30, -depth / 2 - 1.9); b.box(.95, .23, .65, green, side * (width / 2 - 2.4), .65, -depth / 2 - 1.9); }
  }
  b.group.userData.localStreets = { family: hanoi ? 'old-quarter-tube-house' : 'charoen-krung-concrete-shop-house', blocks: footprints, backstreets, scooters, stools, atlasSize: mobile ? 512 : 1024 };
}

function archGeometry(width, height, depth, radius, openings = 1) {
  const shape = new THREE.Shape(); shape.moveTo(-width / 2, 0); shape.lineTo(width / 2, 0); shape.lineTo(width / 2, height); shape.lineTo(-width / 2, height); shape.closePath();
  for (let i = 0; i < openings; i++) {
    const center = (i - (openings - 1) / 2) * width / (openings + .35);
    const hole = new THREE.Path(); hole.moveTo(center - radius, -.1); hole.lineTo(center - radius, height * .48); hole.absarc(center, height * .48, radius, Math.PI, 0, true); hole.lineTo(center + radius, -.1); hole.closePath(); shape.holes.push(hole);
  }
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 12 }); geometry.translate(0, 0, -depth / 2); return geometry;
}
function addAsianLandmarks(options) {
  const { track, mobile } = options, b = createCityBuilder(options);
  const water = createCityWaterMaterial(track.id === 'hanoi' ? '#587e72' : '#796e57');
  if (track.id === 'bangkok') addCityWaterPlane(b, water, 0, -507.5, 5000, 245);
  const stone = b.surface(options.materials.concrete, '#d6d0b9');
  const white = b.surface(options.materials.concrete, '#e1decf');
  const yellow = b.surface(options.materials.concrete, '#d6bc7c');
  const gold = b.material('#c5a04a', { metalness: .68, roughness: .39 });
  const red = b.material('#a82e25', { roughness: .64 });
  const roof = b.material('#6a7066', { metalness: .32, roughness: .59 });
  const dark = b.material('#304a4c', { metalness: .22, roughness: .34 });
  function tierRoof(width, depth, y, x = 0, z = 0, mat = roof) {
    const geometry = new THREE.CylinderGeometry(0, 1, 1, 4); geometry.rotateY(Math.PI / 4); geometry.scale(width / Math.sqrt(2), 2.2, depth / Math.sqrt(2));
    b.bake(geometry, mat, x, y + 1.1, z);
    for (const side of [-1, 1]) b.box(width, .23, .25, mat, x, y + .05, z + side * depth / 2);
  }
  function templeHall(width, depth, x, z, thai = false) {
    b.box(width, 8, depth, white, x, 4, z);
    for (const side of [-1, 1]) for (let zz = -depth / 2 + 2; zz < depth / 2; zz += 3.5) b.cylinder(.26, .32, 7, gold, x + side * width * .43, 3.5, z + zz, 8);
    for (let layer = 0; layer < 3; layer++) tierRoof(width + 4 - layer * 2, depth + 3 - layer * 2.5, 8 + layer * 2, x, z, thai ? red : roof);
    if (thai) for (const side of [-1, 1]) {
      b.beam([x, 11, z + side * depth / 2], [x, 18, z + side * (depth / 2 + 2)], .45, gold);
      b.beam([x - width * .48, 8, z + side * depth / 2], [x - width * .49, 11, z + side * (depth / 2 + 2)], .25, gold);
      b.beam([x + width * .48, 8, z + side * depth / 2], [x + width * .49, 11, z + side * (depth / 2 + 2)], .25, gold);
    }
  }
  if (track.id === 'bangkok') {
    // Wat Arun's pale ceramic flowers and green leaf mosaics differ from gold chedis.
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = mobile ? 128 : 256;
    const ctx = canvas.getContext('2d'), size = canvas.width, cell = size / 8;
    ctx.fillStyle = '#d8d6c8'; ctx.fillRect(0, 0, size, size);
    for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
      const x = (col + .5) * cell, y = (row + .5) * cell;
      ctx.fillStyle = (row + col) % 3 ? '#748b75' : '#947969';
      for (let petal = 0; petal < 5; petal++) { const angle = petal / 5 * Math.PI * 2; ctx.beginPath(); ctx.ellipse(x + Math.sin(angle) * cell * .2, y + Math.cos(angle) * cell * .2, cell * .10, cell * .16, -angle, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#e5e0ca'; ctx.beginPath(); ctx.arc(x, y, cell * .105, 0, Math.PI * 2); ctx.fill();
    }
    const mosaicMap = new THREE.CanvasTexture(canvas); mosaicMap.colorSpace = THREE.SRGBColorSpace;
    mosaicMap.wrapS = mosaicMap.wrapT = THREE.RepeatWrapping; mosaicMap.repeat.set(16, 4);
    const porcelain = b.material('#f2eee1', { map: mosaicMap, roughness: .73, metalness: .04 });
    const hull = b.material('#694b38', { roughness: .71 }), blue = b.material('#417aa1', { roughness: .58 });
    for (const [x, z, yaw] of [[-190, -463, .5], [105, -526, -.6], [255, -460, -.2]]) {
      b.setFrame(x, z, yaw, -.1);
      const outline = new THREE.Shape(); outline.moveTo(-1.2, -8); outline.lineTo(-1.65, -5); outline.lineTo(-1.65, 6); outline.lineTo(0, 10); outline.lineTo(1.65, 6); outline.lineTo(1.65, -5); outline.lineTo(1.2, -8); outline.closePath();
      const boat = new THREE.ExtrudeGeometry(outline, { depth: .65, bevelEnabled: false }); boat.rotateX(-Math.PI / 2); b.bake(boat, hull);
      b.box(3.0, .08, 11.5, blue, 0, 2.1, -1);
      for (const side of [-1, 1]) for (const zz of [-5, 3]) b.beam([side * 1.3, .7, zz], [side * 1.3, 2.1, zz], .065, white);
      b.box(3.1, .16, 15.5, red, 0, .75, -.5); b.box(2.6, .18, 14.5, hull, 0, .87, -.5);
      b.beam([0, .7, -7.2], [0, .12, -12], .15, dark);
    }
    // The adapted river runs east-west here: place the entire Thonburi temple
    // precinct on its dry opposite bank, with the landing facing the water.
    b.setFrame(-65, -735, Math.PI); b.reserve(-65, -735, 104, 'Wat Arun temple precinct');
    b.box(100, 1.2, 110, stone, 0, .6, 0);
    function prang(x, z, h) {
      const tiers = [[0, .20], [.06, .18], [.15, .14], [.25, .12], [.36, .10], [.48, .078], [.62, .056], [.78, .035], [.91, .016]];
      for (let i = 0; i < tiers.length - 1; i++) {
        const [a, r] = tiers[i], [next, top] = tiers[i + 1], height = (next - a) * h;
        b.cylinder(top * h, r * h, height, porcelain, x, (a + next) * h / 2, z, 12);
        b.cylinder(r * h + .6, r * h + .9, .6, stone, x, a * h + .3, z, 12);
        const count = mobile ? 12 : 20;
        for (let j = 0; j < count; j++) {
          const angle = j / count * Math.PI * 2, radius = r * h;
          b.box(.4, .7, .35, j % 3 ? gold : red, x + Math.sin(angle) * radius, a * h + 1.1, z + Math.cos(angle) * radius, 0, angle);
        }
      }
      b.cylinder(0, .014 * h, .10 * h, gold, x, .96 * h, z, 8);
      for (const side of [-1, 1]) for (let step = 0; step < 16; step++) b.box(4.5, .7, 1.2, stone, x, .7 * step + 1, z + side * (h * .22 - step * .7));
    }
    prang(0, 0, 82);
    for (const x of [-32, 32]) for (const z of [-34, 34]) prang(x, z, 29);
    // Low white boundary piers, Thai temple rooflets and a river-facing landing.
    for (const side of [-1, 1]) {
      b.box(100, 1.1, .45, white, 0, 1.75, side * 55);
      for (let x = -48; x <= 48; x += 6) { b.box(.75, 2.2, .75, white, x, 1.7, side * 55); tierRoof(1.1, 1.1, 2.8, x, side * 55, red); }
    }
    b.box(10, .5, 52, stone, 0, 1.4, -81);
    templeHall(26, 42, 140, 5, true); b.reserve(-205, -740, 36, 'Wat Arun ceremonial hall');
    b.sign('วัดอรุณ', 'WAT ARUN · TEMPLE OF DAWN', 22, 4, 0, 4, -55.7, '#635343');
    b.place(.34, 1, 86, 26, 28, 'Bangkok golden chedi'); b.cylinder(12, 15, 3, white, 0, 1.5, 0, 12);
    for (let tier = 0; tier < 10; tier++) b.cylinder(8.5 - tier * .7, 10 - tier * .7, 1.2, gold, 0, 4 + tier * 1.2, 0, 24);
    b.cylinder(0, 3.2, 16, gold, 0, 23, 0, 24);
    b.place(.78, -1, 29, 8, 14, 'Bangkok tuk tuk stop');
    for (let i = -1; i <= 1; i++) {
      b.box(1.6, .55, 2.7, i % 2 ? red : gold, i * 2.3, .7, 0); b.box(1.6, .12, 1.7, dark, i * 2.3, 1.85, -.3);
      for (const side of [-1, 1]) b.beam([i * 2.3 + side * .65, 1, .35], [i * 2.3 + side * .65, 1.85, .35], .08, dark);
      for (const side of [-1, 1]) b.cylinder(.28, .28, .15, dark, i * 2.3 + side * .65, .3, -.75, 12, 0, 0, Math.PI / 2);
      b.cylinder(.28, .28, .15, dark, i * 2.3, .3, 1, 12, 0, 0, Math.PI / 2);
    }
  } else if (track.id === 'hanoi') {
    b.setFrame(0, 0, 0, 1.4); b.reserve(0, 0, 188, 'Hoan Kiem Lake');
    const lake = new THREE.CircleGeometry(1, mobile ? 64 : 96); lake.rotateX(-Math.PI / 2); lake.scale(140, 1, 180); b.bake(lake, water);
    const shorePositions = [], shoreIndices = [], shoreline = mobile ? 64 : 96;
    for (let i = 0; i <= shoreline; i++) {
      const a = i / shoreline * Math.PI * 2;
      shorePositions.push(Math.sin(a) * 140, -.2, Math.cos(a) * 180, Math.sin(a) * 147, 2.0, Math.cos(a) * 187);
      if (i) { const k = i * 2; shoreIndices.push(k, k - 2, k + 1, k + 1, k - 2, k - 1); }
    }
    const bank = new THREE.BufferGeometry(); bank.setAttribute('position', new THREE.Float32BufferAttribute(shorePositions, 3)); bank.setIndex(shoreIndices); bank.computeVertexNormals(); b.bake(bank, stone);
    b.sphere(14, 1.9, 10, stone, -20, .7, 15);
    b.sphere(13.7, .25, 9.7, b.material('#778f53', { roughness: .98 }), -20, 2.55, 15);
    b.setFrame(-20, 15, 0, 3.1);
    const weatheredStone = b.surface(options.materials.concrete, '#c1c3af');
    for (let tier = 0; tier < 3; tier++) {
      const width = 10 - tier * 2.4, depth = 7.4 - tier * 1.7, y = tier * 3.6;
      b.box(width, .5, depth, white, 0, y + .25, 0);
      for (const side of [-1, 1]) {
        b.bake(archGeometry(width, 2.9, .6, tier === 2 ? .7 : width * .085, tier === 2 ? 1 : 3), weatheredStone, 0, y + .45, side * depth / 2);
        b.bake(archGeometry(depth, 2.9, .6, tier === 2 ? .6 : .7, tier === 2 ? 1 : 2), weatheredStone, side * width / 2, y + .45, 0, 0, Math.PI / 2);
      }
      b.box(width + .65, .28, depth + .65, weatheredStone, 0, y + 3.4, 0);
      for (const side of [-1, 1]) { b.box(width + .65, .35, .18, weatheredStone, 0, y + 3.64, side * (depth + .45) / 2); b.box(.18, .35, depth + .65, weatheredStone, side * (width + .45) / 2, y + 3.64, 0); }
    }
    tierRoof(4, 3, 11.4, 0, 0, weatheredStone);
    b.setFrame(60, 75, -.45, 2.5); b.reserve(60, 75, 50, 'The Huc bridge and Ngoc Son temple');
    for (let step = 0; step < 24; step++) {
      const z = -26 + step * 2.2, elevation = 1.2 + Math.sin(step / 23 * Math.PI) * 1.5;
      b.box(3.7, .15, 2.28, red, 0, elevation, z);
      for (const side of [-1, 1]) { b.box(.12, 1.4, .12, red, side * 1.75, elevation + .7, z); b.box(.10, .10, 2.5, red, side * 1.75, elevation + 1.4, z); }
      if (step % 4 === 0) for (const side of [-1, 1]) b.cylinder(.19, .22, 3.5, red, side * 1.25, elevation - 1.75, z, 8);
    }
    b.box(21, 1, 17, stone, 0, 1, 33); templeHall(12, 9, 0, 32);
    b.place(.53, 1, 102, 70, 44, 'Hanoi Opera House');
    b.box(70, 15, 42, yellow, 0, 7.5, 0); b.box(71, .9, 43, white, 0, 15, 0); b.box(70, .9, 43, white, 0, 4, 0);
    for (let x = -29; x <= 29; x += 7.3) {
      b.cylinder(.5, .6, 10.5, white, x, 9, -22, 12); b.box(3.8, 4.4, .08, dark, x, 10, -21.1);
      b.bake(archGeometry(5, 3.7, .7, 1.55), white, x, .5, -21.6);
    }
    b.box(73, 1.2, 45, white, 0, 16, 0); b.box(32, 4, 24, yellow, 0, 18.5, 0); tierRoof(35, 27, 20.8);
    for (const side of [-1, 1]) { b.sphere(8, 5, 7, roof, side * 27, 20, 0); b.cylinder(0, 1.6, 3, roof, side * 27, 26, 0, 8); }
    b.sign('NHÀ HÁT LỚN HÀ NỘI', 'HANOI OPERA HOUSE', 28, 2.3, 0, 15, -22.9, '#8c7043');
  }
  addAsianStreets(b, options, { stone, dark, roof, white, red });
  const result = b.finish();
  for (const mesh of result.shadowMeshes) if (mesh.material === water) mesh.castShadow = false;
  return { ...result, update(_state, elapsed) { water.normalMap.offset.set(elapsed * .006, elapsed * .004); }, setQuality(quality) { result.setQuality(quality); for (const mesh of result.shadowMeshes) if (mesh.material === water) mesh.castShadow = false; } };
}

export function addExtraCityLandmarks(options) {
  if (['bangkok', 'hanoi'].includes(options.track.id)) return addAsianLandmarks(options);
  if (options.track.id === 'kobe') return addKobeStreets(options);
  if (['sydney', 'goldcoast', 'melbourne'].includes(options.track.id)) return addAustralianLandmarks(options);
  if (['sanfrancisco', 'newyork', 'vancouver'].includes(options.track.id)) return addAmericanLandmarks(options);
  if (['paris', 'prague', 'newcastle', 'lisbon', 'marseille', 'nice', 'warwick'].includes(options.track.id)) return addEuropeanLandmarks(options);
  return { reserved: [] };
}
