// Original Xinyi street construction; positions adapt to the closed racing loop.
// These are visual junctions, not surveyed or drivable route extensions.
const layouts = new WeakMap(), noJunctions = Object.freeze([]);
export function paintTaipeiCornerFacade(c, width, height) {
  c.scale(width / 512, height / 1024);
  let seed = 73579;
  const rand = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  c.fillStyle = '#ad755d'; c.fillRect(0, 0, 512, 1024);
  for (let y = 0; y < 1024; y += 6) for (let x = -10; x < 512; x += 14) {
    c.fillStyle = `rgba(${rand() > .5 ? '226,170,128' : '84,49,36'},${.045 + rand() * .06})`;
    c.fillRect(x + (y % 12 ? 7 : 0) + .5, y + .5, 13, 5);
  }
  for (let row = 0; row < 10; row++) for (let bay = 0; bay < 4; bay++) for (const pane of [0, 1]) {
    const x = bay * 128 + 25 + pane * 37, y = row * 102.4 + 23;
    c.fillStyle = '#714f42'; c.fillRect(x - 3, y - 3, 34, 71);
    c.fillStyle = '#bcb1a0'; c.fillRect(x - 1, y - 1, 30, 67);
    const glass = c.createLinearGradient(x, y, x, y + 64);
    glass.addColorStop(0, '#708284'); glass.addColorStop(.45, '#53696b'); glass.addColorStop(1, '#303e40');
    c.fillStyle = glass; c.fillRect(x + 1, y + 1, 26, 63);
    if (rand() > .53) { c.fillStyle = '#aaa89b'; c.fillRect(x + 2, y + 2, 24, 7 + rand() * 30); }
    c.fillStyle = '#9a9c94'; c.fillRect(x + 13, y + 1, 1.5, 63); c.fillRect(x + 1, y + 43, 26, 1.5);
    c.fillStyle = 'rgba(52,41,33,.32)'; c.fillRect(x - 3, y + 67, 34, 3);
  }
  for (let streak = 0; streak < 230; streak++) {
    c.fillStyle = `rgba(59,48,38,${rand() * .055})`; c.fillRect(rand() * 512, rand() * 1024, 1.5, 6 + rand() * 70);
  }
}

export function paintTaipeiJunctionPaving(c, width, height) {
  c.scale(width / 256, height / 256);
  for (let row = 0; row < 8; row++) for (let col = 0; col < 8; col++) {
    c.fillStyle = (row + col) % 3 === 0 ? '#ad8b7e' : (row + col) % 2 ? '#aab0a1' : '#c3bca9';
    c.fillRect(col * 32, row * 32, 32, 32);
    c.fillStyle = 'rgba(67,70,60,.21)'; c.fillRect(col * 32, row * 32, 32, 1.3); c.fillRect(col * 32, row * 32, 1.3, 32);
    c.fillStyle = 'rgba(237,226,204,.15)'; c.fillRect(col * 32 + 2, row * 32 + 2, 29, 1);
  }
}

export function getTaipeiJunctions(track) {
  if (track.id !== 'taipei') return noJunctions;
  if (layouts.has(track)) return layouts.get(track);
  const junctions = [
    { s: 105, width: 18, reach: 118, cross: true, kind: 'avenue' },
    { s: 300, width: 8, reach: 64, cross: false, side: -1, kind: 'lane' },
    { s: track.length * .343, width: 16, reach: 88, cross: true, kind: 'avenue' },
    { s: track.length * .585, width: 8, reach: 60, cross: false, side: 1, kind: 'lane' },
    { s: track.length * .842, width: 18, reach: 86, cross: true, kind: 'avenue' },
  ].map(junction => Object.freeze({ ...junction, center: track.sample(junction.s) }));
  layouts.set(track, Object.freeze(junctions)); return layouts.get(track);
}

export function taipeiJunctionAt(track, s, padding = 0) {
  return getTaipeiJunctions(track).find(junction => {
    const delta = ((s - junction.s + track.length / 2) % track.length + track.length) % track.length - track.length / 2;
    return Math.abs(delta) <= junction.width / 2 + padding;
  }) || null;
}

export function taipeiStreetAt(track, x, z, padding = 0) {
  return getTaipeiJunctions(track).find(junction => {
    const p = junction.center, dx = x - p.x, dz = z - p.z;
    const across = dx * p.nx + dz * p.nz, along = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
    return Math.abs(along) < junction.width / 2 + padding && Math.abs(across) < junction.reach + padding
      && (junction.cross || across * junction.side > 0);
  }) || null;
}

export function addTaipeiStreetDetails({ track, setFrame, box, cylinder, beam, panel, materials }) {
  const { asphalt, paving, cornerPaving, white, yellow, charcoal, steel, red, green, amber, streetName } = materials;
  const half = track.width / 2;
  const stripe = (s, offset, width, length, mat) => {
    const p = track.sample(s); setFrame(p.x, p.z, p.heading, p.y + .064);
    box(width, .009, length, mat, offset, 0, 0);
  };
  for (let s = 1.5; s < track.length; s += 3) {
    if (!taipeiJunctionAt(track, s, 1)) for (const offset of [-.17, .17]) stripe(s, offset, .12, 3.02, yellow);
  }
  for (let s = 3; s < track.length; s += 10) {
    if (taipeiJunctionAt(track, s, 7)) continue;
    for (const offset of [-6, -3, 3, 6]) stripe(s, offset, .12, 4, white);
  }
  for (let s = 2; s < track.length; s += 4) {
    if (taipeiJunctionAt(track, s, 2)) continue;
    for (const side of [-1, 1]) stripe(s, side * (half - .12), .12, 4.03, white);
  }
  for (const junction of getTaipeiJunctions(track)) {
    const p = track.sample(junction.s), sides = junction.cross ? [-1, 1] : [junction.side];
    setFrame(p.x, p.z, p.heading, p.y);
    for (const side of sides) {
      const length = junction.reach - half, mid = side * (junction.reach + half) / 2;
      box(length, .026, junction.width, asphalt, mid, .020, 0);
      for (const edge of [-1, 1]) {
        box(length, .20, .45, paving, mid, .09, edge * (junction.width / 2 + .22));
        box(length, .11, 2.8, cornerPaving, mid, .065, edge * (junction.width / 2 + 1.8));
        box(length, .025, .16, red, mid, .204, edge * (junction.width / 2 + .09));
        box(length - 2, .009, .12, white, mid, .065, edge * (junction.width / 2 - .28));
      }
      if (junction.cross) for (const edge of [-1, 1]) box(length, .009, .12, yellow, mid, .065, edge * .17);
      for (let z = -junction.width / 2 + .8; z < junction.width / 2 - .3; z += 1.15) box(4, .011, .62, white, side * (track.wallOffset + 7), .069, z);
    }
    const crossing = junction.width / 2 + 3.0;
    for (const side of [-1, 1]) for (const edge of [-1, 1]) {
      const curbX = side * (track.wallOffset + .60), curbZ = edge * (junction.width / 2 + 5.5);
      box(.15, .025, 8, red, curbX, .108, curbZ);
      box(1.9, .21, 1.9, cornerPaving, side * (track.wallOffset + 1.6), .08, edge * (junction.width / 2 + 1.7), 0, .23 * side * edge);
      box(.15, .025, 2.3, red, side * (track.wallOffset + .82), .108, edge * (junction.width / 2 + 1.4), 0, -.65 * side * edge);
    }
    for (const approach of [-1, 1]) {
      for (let x = -half + .75; x < half - .2; x += 1.15) box(.62, .011, 3.8, white, x, .070, approach * crossing);
      const stop = approach * (junction.width / 2 + 7.4), laneSide = -approach;
      box(half - .5, .010, .33, white, laneSide * half / 2, .070, stop);
      // A four-metre scooter waiting box is part of the observed Taipei street vocabulary.
      for (const edge of [-1, 1]) box(half - .6, .010, .12, white, laneSide * half / 2, .070, stop - approach * (edge + 1) * 1.65);
      for (const edge of [.45, half - .45]) box(.12, .010, 3.3, white, laneSide * edge, .070, stop - approach * 1.65);
      for (const side of [-1, 1]) {
        const x = side * (track.wallOffset + 1.0), z = approach * (junction.width / 2 + 1.5);
        cylinder(.065, .11, 6.2, charcoal, x, 3.1, z, 8);
        beam([x, 5.7, z], [x - side * 1.0, 5.7, z], .08, steel);
        box(.40, 1.37, .39, charcoal, x - side * .85, 5.22, z);
        for (let lamp = 0; lamp < 3; lamp++) {
          const mat = lamp === 0 ? red : lamp === 1 ? amber : green;
          cylinder(.12, .12, .044, mat, x - side * .85, 5.63 - lamp * .4, z + approach * .224, 12, Math.PI / 2);
          box(.27, .055, .25, charcoal, x - side * .85, 5.80 - lamp * .4, z + approach * .20);
        }
        box(.34, .54, .26, charcoal, x, 2.25, z - approach * .15);
        box(.07, .20, .027, green, x, 2.26, z + approach * .02);
        panel(2.1, .52, streetName, x - side * .63, 3.22, z + approach * .13, approach < 0 ? Math.PI : 0);
      }
      if (junction.cross) for (const lane of [1.5, 4.5, 7.5]) {
        const x = laneSide * lane, z = stop + approach * 15.5;
        box(.15, .010, 2.6, white, x, .071, z);
        box(.13, .010, .92, white, x - .28, .071, z - approach * 1.2, 0, approach * .65);
        box(.13, .010, .92, white, x + .28, .071, z - approach * 1.2, 0, -approach * .65);
      }
    }
  }
  for (const [s, offset, width, length, tint] of [[48, 4.1, 2.6, 3.2, .80], [77, -3.7, 3.0, 2.3, 1.09], [122, 5.5, 2.8, 3.6, .87], [156, -2.2, 2.7, 4.8, .76]]) {
    const p = track.sample(s); setFrame(p.x, p.z, p.heading, p.y + .037);
    box(width, .0018, length, asphalt, offset, 0, 0, 0, 0, 0, tint);
  }
  for (const s of [63, 142]) {
    const p = track.sample(s); setFrame(p.x, p.z, p.heading, p.y + .048);
    cylinder(.32, .32, .014, charcoal, -5.6, 0, 0, 16);
    for (let seam = -2; seam <= 2; seam++) box(.026, .008, .35, steel, -5.6 + seam * .072, .009, 0);
  }
}
