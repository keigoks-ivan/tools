const TAU = Math.PI * 2;
const wrap = (value, length) => ((value % length) + length) % length;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const angleDelta = (a, b) => wrap(b - a + Math.PI, TAU) - Math.PI;

// An original clockwise coastal circuit. The west straight faces north (+Z);
// the water lies west of the road and the tighter inland section climbs gently.
const coastalAnchors = [
  [-170, -190], [-170, -60], [-170, 90], [-165, 185],
  [-110, 260], [5, 285], [110, 245], [170, 150],
  [175, 60], [110, -35], [115, -120], [185, -190],
  [155, -275], [45, -320], [-80, -300], [-170, -250],
];

function pointOnSpline(anchors, segment, t) {
  const n = anchors.length;
  const p0 = anchors[(segment - 1 + n) % n], p1 = anchors[segment];
  const p2 = anchors[(segment + 1) % n], p3 = anchors[(segment + 2) % n];
  const at = axis => .5 * ((2 * p1[axis]) + (-p0[axis] + p2[axis]) * t
    + (2 * p0[axis] - 5 * p1[axis] + 4 * p2[axis] - p3[axis]) * t * t
    + (-p0[axis] + 3 * p1[axis] - 3 * p2[axis] + p3[axis]) * t * t * t);
  return { x: at(0), z: at(1) };
}

function buildTrack({ id, name, label, description, anchors, height, width = 12, wallOffset = 10.5 }) {
  const dense = [{ ...pointOnSpline(anchors, 0, 0), s: 0 }];
  let length = 0;
  for (let segment = 0; segment < anchors.length; segment++) {
    for (let j = 1; j <= 96; j++) {
      const p = pointOnSpline(anchors, segment, j / 96), previous = dense[dense.length - 1];
      length += Math.hypot(p.x - previous.x, p.z - previous.z);
      dense.push({ ...p, s: length });
    }
  }

  const count = Math.ceil(length / 2), spacing = length / count, samples = [];
  let cursor = 0;
  for (let i = 0; i < count; i++) {
    const s = i * spacing;
    while (dense[cursor + 1].s < s) cursor++;
    const a = dense[cursor], b = dense[cursor + 1], t = (s - a.s) / (b.s - a.s);
    const phase = s / length * TAU;
    samples.push({
      x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
      y: height(phase),
      s, heading: 0, nx: 0, nz: 0, curvature: 0,
    });
  }
  for (let i = 0; i < count; i++) {
    const a = samples[(i - 1 + count) % count], b = samples[(i + 1) % count];
    const p = samples[i];
    p.heading = Math.atan2(b.x - a.x, b.z - a.z);
    p.nx = Math.cos(p.heading); p.nz = -Math.sin(p.heading);
  }
  for (let i = 0; i < count; i++) {
    samples[i].curvature = angleDelta(samples[(i - 1 + count) % count].heading,
      samples[(i + 1) % count].heading) / (2 * spacing);
  }

  function sample(distance) {
    const s = wrap(distance, length), index = Math.floor(s / spacing);
    const a = samples[index], b = samples[(index + 1) % count], t = (s - a.s) / spacing;
    const heading = a.heading + angleDelta(a.heading, b.heading) * t;
    return {
      x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t, s, heading,
      nx: Math.cos(heading), nz: -Math.sin(heading),
      curvature: a.curvature + (b.curvature - a.curvature) * t,
    };
  }

  // A local hint is the usual 120 Hz path. A spatial index handles spawn,
  // resets and queries made elsewhere in the scene without a full road scan.
  const cellSize = 32, cells = new Map();
  const cellKey = (x, z) => `${x},${z}`;
  for (let i = 0; i < count; i++) {
    const a = samples[i], b = samples[(i + 1) % count];
    for (let x = Math.floor(Math.min(a.x, b.x) / cellSize); x <= Math.floor(Math.max(a.x, b.x) / cellSize); x++) {
      for (let z = Math.floor(Math.min(a.z, b.z) / cellSize); z <= Math.floor(Math.max(a.z, b.z) / cellSize); z++) {
        const key = cellKey(x, z);
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(i);
      }
    }
  }

  function nearest(x, z, hint) {
    let best = null, bestSquared = Infinity;
    const check = index => {
      const a = samples[index], b = samples[(index + 1) % count];
      const dx = b.x - a.x, dz = b.z - a.z;
      const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = a.x + dx * t, pz = a.z + dz * t;
      const squared = (x - px) ** 2 + (z - pz) ** 2;
      if (squared < bestSquared) { bestSquared = squared; best = { index, t, x: px, z: pz }; }
    };
    if (Number.isFinite(hint)) {
      const index = Math.floor(wrap(hint, length) / spacing);
      for (let j = -18; j <= 18; j++) check(wrap(index + j, count));
    }
    if (bestSquared > 144) {
      const cx = Math.floor(x / cellSize), cz = Math.floor(z / cellSize);
      for (let ix = cx - 1; ix <= cx + 1; ix++) {
        for (let iz = cz - 1; iz <= cz + 1; iz++) {
          for (const index of cells.get(cellKey(ix, iz)) || []) check(index);
        }
      }
      // Far-away scenery queries still receive the closest road position.
      if (bestSquared > cellSize * cellSize) for (let i = 0; i < count; i++) check(i);
    }
    const road = sample((best.index + best.t) * spacing);
    return {
      s: road.s, offset: (x - best.x) * road.nx + (z - best.z) * road.nz,
      distance: Math.sqrt(bestSquared), y: road.y, heading: road.heading,
      curvature: road.curvature, nx: road.nx, nz: road.nz,
    };
  }

  const spawn = sample(0);
  const bounds = Object.freeze({
    minX: Math.min(...samples.map(p => p.x)), maxX: Math.max(...samples.map(p => p.x)),
    minZ: Math.min(...samples.map(p => p.z)), maxZ: Math.max(...samples.map(p => p.z)),
  });
  return Object.freeze({
    id, name, label, description, theme: id, length, width, shoulderWidth: 2,
    wallOffset, spacing, bounds, spawn: Object.freeze(spawn),
    samples: Object.freeze(samples.map(Object.freeze)), sample, nearest,
  });
}

export const TRACKS = Object.freeze({
  costa: buildTrack({
    id: 'costa', name: 'Capo Azzurro', label: '蔚藍海岸',
    description: '沿著地中海奔馳，海岸長直線接上起伏的內陸彎道。',
    anchors: coastalAnchors,
    height: phase => 11.5 + 3 * Math.sin(phase - .9) + 1.2 * Math.sin(phase * 2 + .3),
  }),
  alpine: buildTrack({
    id: 'alpine', name: 'Alpine Pass', label: '高山松林',
    description: '穿過冷杉與雪峰，連續山路彎道考驗煞車與路線。',
    anchors: [[-245, -185], [-245, -40], [-242, 95], [-195, 225], [-95, 310],
      [65, 325], [190, 275], [220, 170], [145, 90], [75, 25], [150, -45],
      [270, -105], [305, -205], [220, -290], [90, -300], [-25, -240],
      [-130, -280], [-230, -265]],
    height: phase => 29 + 10 * Math.sin(phase - .25) + 3 * Math.sin(phase * 2 + .6),
    width: 11, wallOffset: 10,
  }),
  canyon: buildTrack({
    id: 'canyon', name: 'Red Rock Run', label: '赤岩峽谷',
    description: '砂岩台地間的高速公路，寬廣長彎與沙漠光影。',
    anchors: [[-310, -155], [-310, 0], [-300, 180], [-195, 275], [-40, 270],
      [70, 185], [200, 220], [330, 130], [345, -35], [280, -215],
      [155, -315], [-10, -330], [-135, -240], [-275, -240]],
    height: phase => 15 + 4.5 * Math.sin(phase + .4) + 1.7 * Math.sin(phase * 3),
    width: 13, wallOffset: 12,
  }),
  grandprix: buildTrack({
    id: 'grandprix', name: 'Apex International', label: '國際大獎賽',
    description: '寬闊主直線、重煞車區與複合彎，完整賽道場館。',
    anchors: [[-265, -215], [-265, -35], [-265, 165], [-225, 285], [-95, 340],
      [65, 335], [210, 250], [270, 145], [195, 80], [85, 115],
      [45, 30], [135, -35], [275, -100], [275, -220], [180, -310],
      [20, -315], [-95, -255], [-230, -290]],
    height: phase => 5 + .75 * Math.sin(phase - .5) + .3 * Math.sin(phase * 2),
    width: 15, wallOffset: 13,
  }),
  taipei: buildTrack({
    id: 'taipei', name: 'Taipei Xinyi', label: '台北・信義大道',
    description: '台北 101、信義街廓與象山天際線；依城市景觀改編的封閉街道賽道。',
    anchors: [[-325, -255], [-325, -90], [-325, 80], [-305, 260], [-170, 335],
      [5, 335], [175, 315], [305, 225], [325, 70], [275, -70], [315, -240],
      [195, -325], [20, -325], [-165, -325], [-295, -325]],
    height: phase => 5 + .18 * Math.sin(phase), width: 18, wallOffset: 14,
  }),
  kualalumpur: buildTrack({
    id: 'kualalumpur', name: 'Kuala Lumpur KLCC', label: '吉隆坡・KLCC',
    description: '雙峰塔、KLCC 公園與熱帶都市街景；依城市景觀改編的封閉街道賽道。',
    anchors: [[-340, -230], [-340, -65], [-340, 115], [-295, 275], [-150, 335],
      [10, 345], [165, 290], [300, 200], [330, 35], [240, -70], [315, -205],
      [210, -310], [40, -345], [-140, -325], [-295, -310]],
    height: phase => 5 + .4 * Math.sin(phase + .3), width: 17, wallOffset: 13.5,
  }),
  kobe: buildTrack({
    id: 'kobe', name: 'Kobe Meriken Harbor', label: '神戶・港灣大道',
    description: '紅色港塔、海洋博物館與六甲山景；依港灣景觀改編的封閉街道賽道。',
    anchors: [[-325, -240], [-325, -70], [-325, 100], [-275, 255], [-145, 320],
      [25, 335], [205, 285], [315, 175], [330, 5], [290, -145],
      [185, -280], [20, -325], [-150, -310], [-290, -300]],
    height: phase => 5 + .22 * Math.sin(phase + .6), width: 16, wallOffset: 13,
  }),
  london: buildTrack({
    id: 'london', name: 'London Westminster', label: '倫敦・西敏河岸',
    description: '大笨鐘、國會大廈與泰晤士河岸；依城市景觀改編的封閉街道賽道。',
    anchors: [[-325, -230], [-325, -65], [-325, 110], [-285, 270], [-145, 335],
      [25, 330], [185, 285], [310, 175], [330, 15], [275, -120],
      [170, -285], [10, -330], [-160, -315], [-290, -305]],
    height: phase => 5 + .2 * Math.sin(phase - .4), width: 16, wallOffset: 13,
  }),
  sydney: buildTrack({
    id: 'sydney', name: 'Sydney Harbour', label: '雪梨・港灣巡航',
    description: '歌劇院、港灣大橋與岩石區街景；依雪梨港景觀改編的封閉街道賽道。',
    anchors: [[-340, -245], [-340, -80], [-335, 95], [-290, 250], [-155, 325],
      [20, 340], [185, 305], [315, 190], [330, 30], [240, -80], [270, -235],
      [155, -325], [-20, -345], [-190, -320], [-305, -315]],
    height: phase => 5 + 1.2 * Math.sin(phase + .2), width: 17, wallOffset: 13.5,
  }),
  goldcoast: buildTrack({
    id: 'goldcoast', name: 'Gold Coast Surfers', label: '黃金海岸・衝浪天堂',
    description: '海灘長直線、Q1 天際線與棕櫚海濱；依衝浪天堂景觀改編的封閉街道賽道。',
    anchors: [[-290, -240], [-290, -100], [-290, 85], [-270, 265], [-160, 340],
      [15, 345], [185, 305], [290, 205], [305, 40], [250, -105],
      [275, -235], [135, -330], [-35, -340], [-160, -335], [-290, -340]],
    height: phase => 5 + .15 * Math.sin(phase), width: 17, wallOffset: 13.5,
  }),
  melbourne: buildTrack({
    id: 'melbourne', name: 'Melbourne Yarra', label: '墨爾本・雅拉河岸',
    description: '弗林德斯車站、電車與雅拉河岸街廓；依墨爾本景觀改編的封閉街道賽道。',
    anchors: [[-340, -230], [-340, -60], [-340, 110], [-275, 265], [-145, 330],
      [15, 345], [180, 295], [310, 190], [335, 35], [285, -90],
      [190, -260], [35, -335], [-135, -310], [-295, -300]],
    height: phase => 5 + .35 * Math.sin(phase + .8), width: 18, wallOffset: 14,
  }),
  paris: buildTrack({
    id: 'paris', name: 'Paris Seine', label: '巴黎・塞納河畔',
    description: '艾菲爾鐵塔、石砌街廓與塞納河岸；依巴黎景觀改編的封閉街道賽道。',
    anchors: [[-335, -245], [-335, -75], [-335, 95], [-290, 260], [-140, 330],
      [25, 345], [180, 305], [315, 195], [340, 30], [280, -100],
      [185, -270], [20, -335], [-150, -320], [-305, -310]],
    height: phase => 5 + .3 * Math.sin(phase - .2), width: 17, wallOffset: 13.5,
  }),
  prague: buildTrack({
    id: 'prague', name: 'Prague Vltava', label: '布拉格・伏爾塔瓦',
    description: '查理大橋、尖塔與紅瓦屋頂；依布拉格河岸景觀改編的封閉街道賽道。',
    anchors: [[-320, -245], [-320, -70], [-320, 105], [-265, 255], [-140, 325],
      [20, 340], [175, 290], [300, 185], [325, 35], [265, -100],
      [185, -265], [20, -325], [-155, -305], [-280, -315]],
    height: phase => 5 + .75 * Math.sin(phase + .3), width: 15, wallOffset: 12.5,
  }),
  newcastle: buildTrack({
    id: 'newcastle', name: 'Newcastle Quayside', label: '紐卡索・泰恩河岸',
    description: '泰恩大橋、千禧橋與英國港城河岸；依紐卡索景觀改編的封閉街道賽道。',
    anchors: [[-340, -250], [-340, -80], [-340, 90], [-295, 250], [-160, 330],
      [10, 345], [185, 290], [315, 180], [330, 15], [260, -120],
      [165, -275], [0, -335], [-170, -320], [-305, -310]],
    height: phase => 5 + 1.5 * Math.sin(phase - .4), width: 16, wallOffset: 13,
  }),
  bangkok: buildTrack({
    id: 'bangkok', name: 'Bangkok Chao Phraya', label: '曼谷・昭披耶河',
    description: '鄭王廟、金色寺院與昭披耶河都會景；依曼谷景觀改編的封閉街道賽道。',
    anchors: [[-330, -230], [-330, -60], [-330, 120], [-275, 270], [-135, 340],
      [25, 335], [185, 285], [315, 175], [335, 15], [290, -110],
      [195, -270], [30, -340], [-145, -320], [-290, -300]],
    height: phase => 5 + .18 * Math.sin(phase + .2), width: 18, wallOffset: 14,
  }),
  sanfrancisco: buildTrack({
    id: 'sanfrancisco', name: 'San Francisco Pacific', label: '舊金山・太平洋山城',
    description: '金門大橋、彩色維多利亞住宅與起伏坡道；依山城景觀改編的封閉賽道。',
    anchors: [[-330, -250], [-330, -80], [-330, 100], [-295, 290], [-110, 370],
      [95, 345], [240, 240], [325, 95], [260, -20], [350, -140],
      [275, -305], [105, -350], [-40, -290], [-205, -365], [-305, -335]],
    height: phase => 22 + 8 * Math.sin(phase - .3) + 4 * Math.sin(phase * 2 + .6), width: 16, wallOffset: 13,
  }),
  newyork: buildTrack({
    id: 'newyork', name: 'New York Manhattan', label: '紐約・曼哈頓街廓',
    description: '布魯克林大橋、帝國大廈與黃牌計程車；長直線接街口重煞車的改編封閉賽道。',
    anchors: [[-335, -310], [-335, -120], [-335, 100], [-335, 290], [-275, 350],
      [-95, 350], [110, 350], [280, 330], [335, 255], [335, 70],
      [285, 10], [335, -85], [335, -260], [250, -350], [50, -350], [-150, -350], [-270, -400], [-335, -395]],
    height: phase => 5 + .22 * Math.sin(phase), width: 19, wallOffset: 15,
  }),
  vancouver: buildTrack({
    id: 'vancouver', name: 'Vancouver Coal Harbour', label: '溫哥華・煤港海灣',
    description: '加拿大廣場白帆、港灣與北岸山景；海灣長彎接市中心街廓的改編封閉賽道。',
    anchors: [[-330, -230], [-330, -70], [-330, 105], [-280, 260], [-115, 335],
      [85, 330], [260, 245], [330, 80], [270, -55], [330, -160],
      [200, -300], [20, -350], [-120, -310], [-330, -325]],
    height: phase => 6 + .55 * Math.sin(phase + .5), width: 17, wallOffset: 13.5,
  }),
  hanoi: buildTrack({
    id: 'hanoi', name: 'Hanoi Hoan Kiem', label: '河內・還劍湖',
    description: '還劍湖、龜塔、紅色棲旭橋與老城店屋；短直線與緊湊連續彎的改編封閉賽道。',
    anchors: [[-280, -195], [-280, -55], [-280, 90], [-240, 220], [-100, 275],
      [70, 260], [205, 175], [265, 70], [210, -15], [285, -120],
      [180, -250], [30, -285], [-115, -245], [-255, -275]],
    height: phase => 5 + .15 * Math.sin(phase), width: 13.5, wallOffset: 11.5,
  }),
  lisbon: buildTrack({
    id: 'lisbon', name: 'Lisbon Tagus Hills', label: '里斯本・特茹山城',
    description: '貝倫塔、紅色大橋、黃電車與瓷磚街景；高低起伏的河岸改編封閉賽道。',
    anchors: [[-325, -230], [-325, -65], [-325, 105], [-270, 260], [-125, 330],
      [60, 300], [200, 210], [310, 100], [265, -25], [345, -125],
      [260, -275], [115, -335], [-30, -280], [-190, -330], [-300, -315]],
    height: phase => 14 + 5.5 * Math.sin(phase - .6) + 2 * Math.sin(phase * 2), width: 16, wallOffset: 13,
  }),
  marseille: buildTrack({
    id: 'marseille', name: 'Marseille Vieux Port', label: '馬賽・舊港',
    description: '聖母守護聖殿、舊港帆船與普羅旺斯石砌街景；港灣環線改編封閉賽道。',
    anchors: [[-320, -225], [-320, -60], [-320, 105], [-250, 270], [-90, 330],
      [100, 315], [265, 245], [340, 100], [320, -70], [235, -140],
      [265, -270], [120, -340], [-55, -340], [-190, -295], [-320, -320]],
    height: phase => 7 + 1.7 * Math.sin(phase + .4), width: 17, wallOffset: 13.5,
  }),
  nice: buildTrack({
    id: 'nice', name: 'Nice Promenade', label: '尼斯・蔚藍海濱',
    description: '英國人散步大道、藍色座椅與內格雷斯科粉紅圓頂；海濱高速直線的改編封閉賽道。',
    anchors: [[-305, -300], [-305, -110], [-305, 105], [-305, 315], [-195, 365],
      [-10, 360], [175, 295], [285, 180], [260, 30], [320, -105],
      [240, -270], [100, -365], [-85, -350], [-260, -375]],
    height: phase => 5 + .2 * Math.sin(phase), width: 18, wallOffset: 14,
  }),
  warwick: buildTrack({
    id: 'warwick', name: 'Warwick Castle Run', label: '華威・城堡河畔',
    description: '華威城堡、埃文河石橋與半木構小鎮；鄉間長彎接小鎮路段的改編封閉賽道。',
    anchors: [[-285, -195], [-285, -55], [-285, 100], [-230, 225], [-90, 290],
      [70, 285], [220, 200], [285, 50], [225, -60], [275, -175],
      [175, -270], [20, -315], [-135, -270], [-260, -275]],
    height: phase => 8 + 1.8 * Math.sin(phase - .2), width: 14, wallOffset: 12,
  }),
});

export const TRACK = TRACKS.costa;
