export const tile = 60;
export const width = tile * 9;
export const height = tile * 10;
export const bottom = height / tile - 1;

const levels = [
  ["蒲公英溪", "Dandelion Creek", "GLLLGcCG"],
  ["圓石小路", "Pebble Path", "GLSlGCcG"],
  ["水草淺灘", "Reed Bank", "GLlSGcCG"],
  ["小木船港", "Boat Cove", "GFlLGcCG"],
  ["雛菊河岸", "Daisy Bank", "GSLfGCcG"],
  ["午前急流", "Morning Rapids", "GLfLGcCG"],
  ["荷葉碼頭", "Lily Dock", "GPLlGCcG"],
  ["風車河道", "Windmill Bend", "GfLpGcCG"],
  ["蘆葦渡口", "Reed Ferry", "GSfLGCcG"],
  ["蜻蜓小徑", "Dragonfly Path", "GLplGCcG"],
  ["荷塘迴廊", "Lily Loop", "GfSPGcCG"],
  ["風鈴小港", "Chime Harbor", "GLpFGCcG"],
  ["落葉石橋", "Maple Crossing", "GSfPLcCG"],
  ["南瓜小徑", "Pumpkin Path", "GFSlGcCc"],
  ["橡果渡輪", "Acorn Ferry", "GLfSGcCc"],
  ["金楓急流", "Maple Rapids", "GplFLcCG"],
  ["斜陽河灣", "Sunset Bend", "GFpSGCcC"],
  ["燈籠碼頭", "Lantern Dock", "GflPLCcG"],
  ["藍莓月河", "Blueberry Moon", "GLpfSCcC"],
  ["螢火草岸", "Firefly Bank", "GFSlPcCG"],
  ["月牙渡口", "Crescent Ferry", "GpFLGCcC"],
  ["星星浮橋", "Star Crossing", "GSfPlCcG"],
  ["銀光急水", "Silver Rapids", "GflPFcCC"],
  ["鴨鴨回家", "Home at Last", "GFpLfCcC"]
];

const specs = {
  l: { type: "log", length: 132, count: 3, speed: 43 },
  p: { type: "pad", length: 132, count: 3, speed: 25 },
  f: { type: "ferry", length: 147, count: 3, speed: 39 },
  s: { type: "stone", length: 137, count: 3, speed: 0 },
  c: { type: "cart", length: 64, count: 3, speed: 56 },
  g: { type: "grass" }
};

export const levelCount = levels.length;
const asLane = (type) => ({ type });
const mod = (n, length) => ((n % length) + length) % length;

export function makeCourse(index) {
  const [zh, en, route] = levels[index];
  const lanes = Array.from(route, (code, row) => {
    const spec = specs[code.toLowerCase()];
    if (spec.type === "grass") return spec;
    const direction = code === code.toUpperCase() ? 1 : -1;
    const speed = spec.speed ? direction * (spec.speed + index * (spec.type === "cart" ? 2.45 : 1.82)) : 0;
    const length = spec.length + (spec.type === "cart" ? index * .63 : Math.max(0, 4 - index) * 6);
    const phase = (index * 37 + (row + 1) * 61 + (row % 2) * 82) % width;
    return { ...spec, speed, length, phase, row: row + 1 };
  });
  const nests = index < 2 ? [2, 6] : index % 3 === 2 ? [1, 4, 7] : [1, 3, 7];
  return { zh, en, index, lanes: [asLane("nest"), ...lanes, asLane("grass")], nests };
}

export function eachObject(lane, time, callback) {
  const spacing = width / lane.count;
  for (let i = 0; i < lane.count; i++) {
    const x = mod(lane.phase + i * spacing + lane.speed * time, width);
    let phase = 0;
    if (lane.type === "pad") phase = mod(time + i * .74 + lane.row * .51, 4.6);
    if (x - lane.length / 2 < 0) callback(x + width, phase, i);
    if (x + lane.length / 2 > width) callback(x - width, phase, i);
    callback(x, phase, i);
  }
}

export function surfaceAt(lane, x, time) {
  if (lane.type === "grass" || lane.type === "nest") return { safe: true, drift: 0 };
  let overlap = false;
  const reach = lane.length / 2 + (lane.type === "cart" ? 10 : -9);
  eachObject(lane, time, (center, phase) => {
    if (Math.abs(x - center) < reach && phase < 3.65) overlap = true;
  });
  if (lane.type === "cart") return { safe: !overlap, drift: 0 };
  return { safe: overlap, drift: lane.speed };
}

export function nestAt(course, x, occupied) {
  return course.nests.find((col) => Math.abs((col + .5) * tile - x) <= 25 && !occupied.has(col));
}
