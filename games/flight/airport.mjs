// Single source of truth for everything that is specific to the airport the game is set at.
// Physics, world, instruments, scenery and UI all read this object; nothing else hard-codes a place.
// Local frame: origin = runway centre at field elevation, -z = runway heading, +x = right of the runway heading, +y = up.
// Positions are surveyed on the baked SWISSIMAGE (see dev/bake_lszh.py), not copied from a chart.
const FT = 3.28084;

export const AIRPORT = Object.freeze({
  icao: 'LSZH',
  name: Object.freeze({ zh: '蘇黎世機場', en: 'ZURICH AIRPORT' }),
  city: Object.freeze({ zh: '蘇黎世', en: 'Zurich' }),
  // Runway 14 is used for BOTH takeoff and the ILS landing (a simplification: real arrivals use 14, departures mostly 28/16).
  runway: Object.freeze({
    ident: '14', reciprocal: '32', lengthM: 3300, widthM: 60,
    center: Object.freeze({ lat: 47.4722, lon: 8.5496 }), // runway centre (checked against the SWISSIMAGE pavement edges, within ~2 m)
    bearing: 137.3, // true bearing of runway 14
    elevationM: 427, // field elevation, metres MSL (1,401 ft); terrain is flattened to this around the airfield
    displacedNearM: 150, // runway 14 landing threshold is 150 m inside the pavement end (bars and numerals on the imagery)
    touchdownZoneM: 300, // glideslope aiming point beyond the landing threshold
  }),
  ils: Object.freeze({ ident: 'ILS 14', course: 137.3, glideslopeDeg: 3.0 }), // 3.0 deg: public sources for the real angle are unverified
  // Terrain inside this local-frame box is flattened to the field elevation (three runways, aprons, approach lights).
  flatZone: Object.freeze({ minX: -150, maxX: 2000, minZ: -2800, maxZ: 2700, feather: 350 }),
  // Other runways: flat surfaces drawn over the imagery. Ends [x, z] in the local frame, measured on the imagery.
  otherRunways: Object.freeze([
    Object.freeze({ from: '16', to: '34', a: [495, 972], b: [1627, -2545], widthM: 60 }),
    Object.freeze({ from: '10', to: '28', a: [1673, -470], b: [27, -2338], widthM: 60 }),
  ]),
  // Buildings as boxes (local frame). Dock E was measured on the imagery; the rest are approximate.
  buildings: Object.freeze([
    Object.freeze({ id: 'dockE', a: [688, -978], b: [418, -1392], width: 40, height: 17, measured: true }),
    Object.freeze({ id: 'dockB', a: [640, -2085], b: [1010, -1770], width: 42, height: 16, measured: false }),
    Object.freeze({ id: 'terminal', a: [430, -2240], b: [700, -2200], width: 70, height: 24, measured: false }),
  ]),
  tower: Object.freeze({ x: 712, z: -1900, height: 70, measured: false }), // approximate
  // Circuit for the takeoff scenario (local frame; +x is right of runway 14). Left-hand pattern over the NE side:
  // clear of Uetliberg (SW, 870 m) and the Laegern ridge (W, 868 m). Highest terrain under the route is about 610 m (2,010 ft).
  waypoints: Object.freeze([
    Object.freeze({ x: 0, z: -5500 }), Object.freeze({ x: -5000, z: -5500 }),
    Object.freeze({ x: -5000, z: 11000 }), Object.freeze({ x: 0, z: 11000 }), // base turn: 9.7 km from the glidepath origin, 3,000 ft intercepts the 3 deg path there
  ]),
  circuitAltFt: 4500, // MSL, about 3,100 ft above the field
  // MQ-172 circuit (same frame, left-hand): 2,900 ft MSL, base and final at 2,300 ft. Highest terrain within 300 m of the route is 1,883 ft. Same numbers as LIGHT_CIRCUIT in light.pilot.mjs.
  lightCircuit: Object.freeze({
    waypoints: Object.freeze([
      Object.freeze({ x: 0, z: -3500 }), Object.freeze({ x: -2500, z: -3500 }), Object.freeze({ x: -2500, z: 5500 }), Object.freeze({ x: 0, z: 5500 }),
    ]),
    altFt: 2900, finalAltFt: 2300,
  }),
  landmarks: Object.freeze([
    Object.freeze({ id: 'hb', zh: '蘇黎世火車站', en: 'Zurich HB', bearing: 184, km: 10.5 }),
    Object.freeze({ id: 'lake', zh: '蘇黎世湖', en: 'Lake Zurich', bearing: 182, km: 12.5 }),
    Object.freeze({ id: 'uetliberg', zh: '烏埃特利山', en: 'Uetliberg', bearing: 198, km: 14, elevationM: 870 }),
    Object.freeze({ id: 'greifensee', zh: '格賴芬湖', en: 'Greifensee', bearing: 144, km: 16 }),
    Object.freeze({ id: 'laegern', zh: '萊格恩山脊', en: 'Lägern ridge', bearing: 275, km: 11, elevationM: 868 }),
    Object.freeze({ id: 'saentis', zh: '桑蒂斯峰', en: 'Säntis', bearing: 112, km: 65, elevationM: 2502 }),
    Object.freeze({ id: 'toedi', zh: '特迪峰', en: 'Tödi', bearing: 159, km: 78, elevationM: 3614 }),
    Object.freeze({ id: 'pilatus', zh: '皮拉圖斯山', en: 'Pilatus', bearing: 202, km: 59, elevationM: 2128 }),
  ]),
  attribution: Object.freeze({
    imagery: 'Imagery © swisstopo · Sentinel-2 cloudless 2016 by EOX (CC BY 4.0, contains modified Copernicus Sentinel data 2016)',
    terrain: 'Terrain: swisstopo (swissALTI3D), Mapzen terrain tiles (Copernicus EU-DEM, USGS SRTM, NOAA ETOPO1)',
    note: 'airfield elevation flattened',
  }),
});

// Autopilot altitude selector: feet MSL on the panel, metres above the field elevation in the physics state.
export const AP_MAX_FT = 20000;
export const apFloorFt = (airport = AIRPORT) => Math.max(500, Math.ceil((airport.runway.elevationM * FT + 400) / 100) * 100);
export const apAltitudeLocal = (feetMsl, airport = AIRPORT) =>
  Math.min(AP_MAX_FT, Math.max(apFloorFt(airport), Number.isFinite(feetMsl) ? feetMsl : 3000)) / FT - airport.runway.elevationM;
