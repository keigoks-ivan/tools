const PLAYFIELD = {height: 620, floor: 545, spawn: 150, courierWidth: 26};
const COLLISION_CELL_WIDTH = 640;

const firstCourse = {
  name: ["暮谷郵路", "Dusk Valley"],
  hint: ["長按跳躍可以跳得更高。", "Hold jump to climb higher."],
  theme: "dusk",
  background: "dusk",
  end: 4460,
  checkpoint: 1980,
  platforms: [
    [0, 545, 820], [940, 545, 650], [1745, 545, 735],
    [2670, 545, 610], [3470, 545, 990],
    [436, 463, 139], [620, 407, 122], [828, 483, 83],
    [1030, 460, 133], [1235, 404, 121], [1406, 470, 134], [1611, 484, 89],
    [1800, 456, 131], [2135, 451, 137], [2325, 391, 120], [2496, 473, 113],
    [2730, 452, 114], [2890, 398, 145], [3103, 463, 116], [3295, 469, 111],
    [3520, 456, 145], [3723, 400, 140], [3953, 455, 121],
  ].map(([x, y, w]) => ({ x, y, w, ground: y === 545 })),
  seeds: [
    [485, 432], [533, 432], [653, 374], [702, 374],
    [785, 471], [855, 447], [913, 482], [1077, 426], [1124, 426],
    [1271, 371], [1322, 371], [1470, 433], [1560, 491], [1653, 447],
    [1838, 421], [1888, 421], [2183, 414], [2230, 414], [2364, 354], [2411, 354],
    [2549, 434], [2698, 504], [2787, 415], [2927, 364], [2980, 364],
    [3157, 429], [3249, 484], [3350, 432], [3456, 489], [3575, 418],
    [3766, 362], [3821, 362], [3999, 417], [4128, 508], [4175, 508],
  ],
  enemies: [
    [1110, 545, 1015, 1260], [1875, 545, 1785, 1925],
    [2840, 545, 2720, 2980], [3580, 545, 3510, 3650],
  ],
  spikes: [[1343, 51], [3686, 54]],
};

function course(data) {
  const { banks, ledges, ...details } = data;
  const platforms = banks.map(([x, w]) => ({ x, y: PLAYFIELD.floor, w, ground: true }));
  platforms.push(...ledges.map(([x, y, w, spring]) => ({ x, y, w, spring: Boolean(spring) })));
  const seeds = ledges.flatMap(([x, y, w, spring]) => spring
    ? [[x + w * .5, y - 82], [x + w * .85, y - 127]]
    : [[x + w * .28, y - 28], [x + w * .72, y - 28]]);
  seeds.push(...banks.flatMap(([x, w]) => w < 300 ? [] : [[x + w - 103, PLAYFIELD.floor - 35]]));
  return { ...details, platforms, seeds, end: banks.at(-1)[0] + banks.at(-1)[1] };
}

const openingRoutes = [{ ...firstCourse, enemySpeed: 48 }, ...[
  {
    name: ["曉霧樹海", "Cedar in the Mist"], theme: "morning", background: "morning",
    hint: ["霧裡的木台可以當作踏腳石。", "Use the ledges in the mist as stepping stones."],
    banks: [[0, 580], [725, 485], [1370, 610], [2150, 600], [2915, 560]],
    ledges: [[313, 473, 139], [600, 480, 95], [890, 452, 149], [1240, 480, 89],
      [1530, 463, 131], [1708, 400, 116], [2006, 470, 109], [2320, 449, 161],
      [2590, 472, 110], [2790, 480, 86], [3100, 444, 154]],
    enemies: [[941, 545, 852, 1036], [1818, 545, 1710, 1940], [2513, 545, 2420, 2650],
      [3175, 545, 3100, 3285]],
    spikes: [[1075, 54], [2437, 47]], checkpoint: 1550, enemySpeed: 52,
  },
  {
    name: ["水車溪谷", "Waterwheel Run"], theme: "morning", background: "millstream",
    hint: ["沿著水車上方的高台穿過溪谷。", "Take the high ledges over the millstream."],
    banks: [[0, 670], [875, 420], [1530, 585], [2380, 510], [3160, 470]],
    ledges: [[310, 472, 106], [456, 416, 129], [698, 465, 101], [827, 422, 95],
      [1069, 466, 110], [1318, 480, 101], [1442, 418, 99], [1660, 453, 139],
      [1850, 388, 111], [2160, 465, 98], [2280, 411, 105], [2520, 463, 101],
      [2720, 406, 138], [2910, 456, 107], [3040, 478, 97], [3290, 459, 130]],
    enemies: [[566, 545, 488, 651], [1145, 545, 1090, 1263], [1720, 545, 1706, 1860],
      [2561, 463, 2520, 2621], [3410, 545, 3305, 3505]],
    spikes: [[960, 60], [1925, 68], [2650, 53]], checkpoint: 1575, enemySpeed: 65,
  },
  {
    name: ["赤葉橋鎮", "Copperleaf Crossing"], theme: "copper", background: "leafbridge",
    hint: ["有刺的橋面可以從上方繞過。", "Cross above the brambles on the raised walkways."],
    banks: [[0, 490], [660, 760], [1650, 540], [2390, 515], [3090, 790]],
    ledges: [[280, 470, 113], [506, 470, 110], [705, 453, 105], [865, 394, 135],
      [1060, 431, 165], [1270, 483, 120], [1460, 465, 100], [1590, 424, 102],
      [1800, 459, 131], [2038, 463, 102], [2225, 472, 112], [2460, 457, 104],
      [2620, 391, 122], [2915, 469, 103], [3180, 469, 120], [3380, 418, 151]],
    enemies: [[755, 545, 670, 850], [913, 394, 865, 1000], [1232, 545, 1130, 1380],
      [1943, 545, 1880, 2030], [2638, 545, 2550, 2725], [3410, 418, 3380, 3531],
      [3558, 545, 3497, 3695]],
    spikes: [[825, 64], [996, 106], [1980, 50], [2780, 62], [3305, 65]],
    checkpoint: 1700, enemySpeed: 66,
  },
  {
    name: ["銅輪工坊", "Clockwork Works"], theme: "copper", background: "copper",
    hint: ["踩上發光的彈簧台就能彈得更高。", "Land on a glowing springboard for an extra-high jump."],
    banks: [[0, 570], [900, 460], [1680, 480], [2450, 500], [3210, 700]],
    ledges: [[350, 462, 123], [608, 479, 96, true], [776, 384, 106], [1000, 446, 151],
      [1214, 463, 96], [1390, 467, 95, true], [1560, 354, 103], [1810, 448, 132],
      [1988, 403, 94], [2190, 471, 103, true], [2357, 371, 107], [2580, 452, 141],
      [2800, 404, 115], [2975, 470, 94], [3090, 435, 92], [3350, 454, 150]],
    enemies: [[522, 545, 440, 565], [1125, 545, 1040, 1260], [1880, 545, 1805, 1950],
      [2675, 545, 2560, 2810], [3455, 545, 3340, 3560], [3690, 545, 3625, 3750]],
    spikes: [[962, 67], [2030, 76], [2838, 53], [3574, 52]],
    checkpoint: 1730, enemySpeed: 73,
  },
  {
    name: ["高風稜線", "Gale Ridge"], theme: "copper", background: "gale-ridge",
    hint: ["把大跳拆成幾次短跳，在高處找下一個落點。", "Break long jumps into short hops across the ridge."],
    banks: [[0, 490], [740, 355], [1315, 390], [1985, 630], [2875, 365], [3480, 535]],
    ledges: [[260, 460, 119], [510, 470, 92], [628, 419, 92], [870, 458, 114],
      [1108, 472, 93, true], [1241, 371, 105], [1460, 444, 143], [1733, 479, 87],
      [1855, 431, 97], [2140, 460, 107], [2314, 396, 113], [2485, 438, 102],
      [2642, 468, 104], [2764, 413, 92], [3030, 457, 120], [3256, 472, 89, true],
      [3401, 360, 103], [3650, 474, 111]],
    enemies: [[880, 545, 823, 1045], [1475, 444, 1460, 1603], [1528, 545, 1440, 1615],
      [2280, 545, 2210, 2370], [3090, 545, 3020, 3210], [3730, 545, 3600, 3850]],
    spikes: [[970, 53], [1595, 56], [2414, 74], [3126, 59]], checkpoint: 2045, enemySpeed: 77,
  },
  {
    name: ["月潮河港", "Moonwake Harbor"], theme: "night", background: "night",
    hint: ["跟著水面上的燈光，在碼頭之間跳躍。", "Follow the lights from dock to dock."],
    banks: [[0, 700], [910, 420], [1575, 345], [2195, 580], [3005, 520], [3760, 590]],
    ledges: [[320, 475, 110], [511, 455, 132], [731, 481, 108], [1040, 465, 120],
      [1354, 475, 89], [1470, 427, 88], [1718, 471, 117], [1952, 479, 120],
      [2094, 439, 111], [2280, 463, 110], [2434, 400, 137], [2630, 472, 114],
      [2800, 481, 91], [2921, 436, 94], [3164, 468, 126], [3340, 413, 129],
      [3556, 476, 117], [3795, 454, 128], [3995, 411, 109]],
    enemies: [[593, 545, 503, 665], [1152, 545, 1020, 1270], [1775, 545, 1700, 1855],
      [2444, 400, 2434, 2571], [2575, 545, 2510, 2630], [3190, 468, 3164, 3290],
      [3396, 545, 3300, 3440], [4080, 545, 3960, 4170]],
    spikes: [[987, 50], [1845, 54], [2500, 51], [3430, 49], [3930, 60]],
    checkpoint: 2250, enemySpeed: 73,
  },
  {
    name: ["星霧林道", "Starlit Switchbacks"], theme: "night", background: "starwood",
    hint: ["敵人在高台上巡邏，從頭頂踩下去。", "Patrols roam the platforms. Stomp from above."],
    banks: [[0, 580], [840, 370], [1490, 540], [2305, 480], [3090, 430], [3805, 550]],
    ledges: [[332, 457, 131], [607, 471, 94], [735, 412, 94], [970, 470, 130],
      [1227, 462, 99, true], [1387, 358, 104], [1615, 451, 130], [1804, 391, 116],
      [2060, 472, 96], [2180, 417, 105], [2410, 457, 131], [2599, 391, 112],
      [2815, 467, 90, true], [2960, 367, 95], [3190, 472, 123], [3360, 410, 122],
      [3550, 474, 99], [3690, 406, 119], [3920, 456, 121], [4100, 410, 97]],
    enemies: [[432, 545, 365, 550], [998, 470, 970, 1100], [1707, 545, 1610, 1820],
      [1840, 391, 1804, 1920], [2442, 457, 2410, 2541], [2600, 545, 2525, 2730],
      [3380, 410, 3360, 3482], [3941, 456, 3920, 4041], [4076, 545, 4000, 4155]],
    spikes: [[1058, 87], [1888, 82], [2685, 65], [3321, 79], [4164, 56]],
    checkpoint: 1535, enemySpeed: 81,
  },
  {
    name: ["夜鐘高架", "Midnight Viaduct"], theme: "night", background: "bellworks",
    hint: ["連續的斷橋很窄，落地後再起跳。", "Land firmly between jumps along the broken viaduct."],
    banks: [[0, 480], [795, 390], [1490, 345], [2175, 390], [2880, 545], [3740, 580]],
    ledges: [[265, 467, 108], [510, 468, 81], [620, 433, 80], [720, 380, 80],
      [968, 445, 108], [1207, 468, 86], [1328, 402, 88], [1445, 448, 88],
      [1640, 463, 123], [1865, 471, 79, true], [2030, 356, 92], [2136, 411, 85],
      [2320, 448, 128], [2579, 472, 93], [2711, 403, 103], [2825, 458, 88],
      [3030, 452, 118], [3197, 386, 122], [3447, 462, 90, true], [3594, 352, 106],
      [3830, 456, 121], [4015, 415, 108]],
    enemies: [[1037, 545, 890, 1140], [1700, 463, 1640, 1763], [2298, 545, 2284, 2395],
      [2370, 448, 2320, 2448], [3055, 545, 2970, 3170], [3210, 386, 3197, 3319],
      [3860, 456, 3830, 3951], [4065, 545, 3990, 4165]],
    spikes: [[1080, 58], [1758, 59], [2410, 77], [3095, 60], [3295, 62], [3955, 74]],
    checkpoint: 2216, enemySpeed: 88,
  },
  {
    name: ["風塔天階", "The Windspire Ascent"], theme: "dusk", background: "summit",
    hint: ["越過最後一連串彈簧台，把信送到風塔。", "Cross the final springboards and deliver the letter."],
    banks: [[0, 545], [850, 500], [1690, 535], [2555, 460], [3330, 450], [4130, 510]],
    ledges: [[315, 463, 118], [570, 472, 87, true], [724, 358, 111], [969, 464, 125],
      [1150, 401, 130], [1381, 466, 96, true], [1531, 359, 115], [1635, 417, 91],
      [1845, 459, 134], [2025, 401, 115], [2244, 472, 90], [2365, 424, 91], [2475, 374, 115],
      [2710, 465, 122], [3037, 471, 91, true], [3183, 348, 114], [3286, 405, 83],
      [3463, 458, 124], [3622, 392, 98], [3806, 467, 94, true], [3946, 342, 103],
      [4060, 401, 92], [4275, 452, 124]],
    enemies: [[467, 545, 390, 515], [1059, 545, 987, 1160], [1175, 401, 1150, 1280],
      [1864, 459, 1845, 1979], [2050, 545, 1940, 2160], [2770, 465, 2710, 2832],
      [2848, 545, 2740, 2960], [3517, 458, 3463, 3587], [3620, 545, 3520, 3710],
      [4337, 545, 4250, 4410]],
    spikes: [[932, 55], [1195, 79], [1925, 56], [2128, 65], [2679, 57], [2928, 57],
      [3420, 66], [3711, 53], [4395, 61]], checkpoint: 1730, enemySpeed: 93,
  },
].map(course)];

// Each crossing lists ledges by center along the gap, height, and width.
const crossings = {
  open: [],
  brook: [[.51, 485, 132]],
  steppingStones: [[.28, 480, 114], [.72, 455, 112]],
  stair: [[.22, 477, 108], [.60, 411, 101], [.88, 459, 97]],
  bridge: [[.21, 471, 103], [.55, 423, 100], [.86, 469, 88]],
  dock: [[.25, 489, 112], [.68, 472, 101]],
  ridge: [[.19, 478, 86], [.51, 419, 87], [.79, 372, 83]],
  highRidge: [[.17, 478, 82], [.47, 414, 82], [.77, 357, 76], [.93, 426, 76]],
  spring: [[.20, 480, 99, true], [.72, 333, 110]],
  relay: [[.15, 477, 86, true], [.55, 410, 87, true], [.90, 291, 94]],
  lowSpan: [[.21, 490, 123], [.53, 498, 110], [.84, 473, 111]],
  arch: [[.19, 482, 105], [.51, 415, 102], [.83, 468, 96]],
  switchback: [[.16, 479, 96], [.43, 417, 92], [.69, 459, 94], [.90, 411, 92]],
  steppedPier: [[.18, 499, 113], [.49, 445, 100], [.80, 489, 108]],
  springStairs: [[.16, 482, 103, true], [.65, 373, 118], [.91, 436, 104]],
  splitRelay: [[.16, 480, 96, true], [.59, 423, 106, true], [.90, 329, 106]],
};

// Each section starts at a postal station. Rows describe bank width, gap width,
// crossing profile, and the obstacle encountered on the bank.
const courseSections = [
  [ // Dusk Valley: short jumps, wide landing areas, isolated obstacles.
    [[555, 114, "open"], [480, 127, "brook", "patrol"], [565, 118, "open", "brambles"], [500, 172, "brook"], [510, 0, "open", "patrol"]],
    [[575, 139, "brook"], [480, 143, "open", "patrol"], [545, 179, "steppingStones", "brambles"], [575, 123, "open"], [455, 0, "open", "patrol"]],
    [[620, 157, "open", "patrol"], [535, 193, "steppingStones"], [475, 144, "brook", "brambles"], [530, 164, "open", "patrol"], [475, 0, "open"]],
  ],
  [ // Cedar in the Mist: alternating open gaps and low wooden paths.
    [[545, 145, "open", "patrol"], [485, 184, "brook"], [585, 170, "open", "brambles"], [500, 216, "steppingStones", "patrol"], [525, 0, "open"]],
    [[620, 192, "brook"], [480, 177, "open", "brambles"], [525, 245, "steppingStones", "patrol"], [550, 168, "open", "brambles"], [500, 0, "open", "patrol"]],
    [[535, 216, "steppingStones", "patrol"], [570, 185, "open"], [490, 240, "stair", "brambles"], [530, 208, "brook", "patrol"], [505, 0, "open"]],
  ],
  [ // Waterwheel Run: lead up to higher landings across wider water.
    [[575, 225, "dock", "patrol"], [470, 263, "stair"], [540, 190, "open", "brambles"], [520, 300, "bridge", "patrol"], [565, 0, "open"]],
    [[585, 242, "steppingStones", "brambles"], [510, 286, "stair", "patrol"], [495, 228, "dock", "brambles"], [535, 299, "ridge"], [510, 0, "open", "patrol"]],
    [[640, 240, "dock", "patrol"], [470, 318, "ridge", "brambles"], [545, 263, "stair", "patrol"], [500, 288, "bridge", "overpass"], [505, 0, "open"]],
  ],
  [ // Copperleaf Crossing: branches over ground hazards.
    [[625, 252, "bridge", "brambles"], [455, 285, "stair", "overpass"], [600, 215, "dock", "patrol"], [510, 312, "bridge", "overpass"], [530, 0, "open"]],
    [[580, 268, "bridge", "patrol"], [525, 304, "ridge", "overpass"], [450, 237, "steppingStones", "brambles"], [575, 333, "bridge", "overpass"], [490, 0, "open", "patrol"]],
    [[630, 326, "ridge", "overpass"], [500, 251, "stair", "patrol"], [570, 330, "bridge", "overpass"], [490, 274, "steppingStones", "brambles"], [510, 0, "open"]],
  ],
  [ // Clockwork Works: introduce springboards before asking for a longer arc.
    [[605, 288, "bridge", "overpass"], [485, 315, "spring", "brambles"], [555, 251, "steppingStones", "patrol"], [525, 361, "spring", "overpass"], [550, 0, "open"]],
    [[595, 339, "spring", "patrol"], [485, 276, "bridge", "overpass"], [560, 390, "spring", "brambles"], [470, 328, "ridge", "overpass"], [545, 0, "open", "patrol"]],
    [[620, 384, "spring", "overpass"], [530, 312, "stair", "patrol"], [505, 422, "spring", "overpass"], [520, 351, "ridge", "brambles"], [530, 0, "open"]],
  ],
  [ // Gale Ridge: several climbs need a deliberate landing and a new jump.
    [[555, 332, "ridge", "patrol"], [530, 380, "highRidge", "overpass"], [535, 318, "bridge", "brambles"], [595, 402, "spring", "sentries"], [515, 0, "open"]],
    [[605, 377, "highRidge", "brambles"], [460, 334, "ridge", "overpass"], [560, 426, "spring", "sentries"], [510, 374, "highRidge", "patrol"], [545, 0, "open", "overpass"]],
    [[624, 390, "highRidge", "overpass"], [490, 351, "ridge", "sentries"], [550, 433, "spring", "overpass"], [500, 400, "highRidge", "brambles"], [575, 0, "open"]],
  ],
  [ // Moonwake Harbor: lower docks alternate with exposed pier approaches.
    [[600, 323, "dock", "sentries"], [510, 374, "bridge", "overpass"], [580, 346, "dock", "patrol"], [525, 396, "ridge", "sentries"], [565, 0, "open", "overpass"]],
    [[615, 365, "dock", "overpass"], [455, 387, "highRidge", "brambles"], [525, 402, "dock", "sentries"], [565, 416, "spring", "overpass"], [555, 0, "open"]],
    [[625, 399, "dock", "sentries"], [525, 360, "bridge", "overpass"], [545, 411, "ridge", "sentries"], [480, 394, "dock", "brambles"], [565, 0, "open", "patrol"]],
  ],
  [ // Starlit Switchbacks: use both the low path and guarded ledges.
    [[630, 382, "ridge", "sentries"], [505, 416, "spring", "overpass"], [490, 370, "highRidge", "sentries"], [555, 438, "spring", "overpass"], [580, 0, "open"]],
    [[605, 402, "highRidge", "sentries"], [525, 440, "spring", "sentries"], [550, 346, "bridge", "overpass"], [500, 435, "highRidge", "sentries"], [550, 0, "open", "overpass"]],
    [[660, 426, "spring", "sentries"], [510, 388, "ridge", "overpass"], [575, 460, "relay", "sentries"], [495, 401, "highRidge", "sentries"], [590, 0, "open"]],
  ],
  [ // Midnight Viaduct: tight landings over long breaks, then spring chains.
    [[615, 410, "highRidge", "sentries"], [525, 468, "relay", "overpass"], [540, 378, "ridge", "sentries"], [505, 430, "highRidge", "sentries"], [605, 0, "open"]],
    [[665, 434, "highRidge", "sentries"], [510, 478, "relay", "sentries"], [540, 404, "ridge", "overpass"], [555, 485, "relay", "sentries"], [575, 0, "open"]],
    [[640, 480, "relay", "sentries"], [520, 428, "highRidge", "sentries"], [550, 449, "highRidge", "overpass"], [500, 493, "relay", "sentries"], [590, 0, "open"]],
  ],
  [ // Windspire Ascent: link multiple springboards and narrow ridges.
    [[650, 453, "highRidge", "sentries"], [555, 488, "relay", "sentries"], [530, 444, "highRidge", "sentries"], [530, 515, "relay", "sentries"], [595, 0, "open"]],
    [[680, 510, "relay", "sentries"], [555, 470, "highRidge", "sentries"], [590, 528, "relay", "sentries"], [505, 455, "highRidge", "sentries"], [620, 0, "open"]],
    [[675, 516, "relay", "sentries"], [580, 463, "highRidge", "sentries"], [545, 538, "relay", "sentries"], [550, 550, "relay", "sentries"], [640, 0, "open"]],
  ],
];

// The remaining postal sections vary the crossing order within each landscape.
// The length range for a crossing keeps its landings within jump distance.
const crossingLengths = {
  open: [128, 191], brook: [178, 240], steppingStones: [226, 318],
  stair: [272, 368], bridge: [283, 372], dock: [248, 344],
  ridge: [332, 426], highRidge: [390, 470], spring: [315, 438], relay: [455, 510],
  lowSpan: [208, 305], arch: [316, 425], switchback: [365, 455],
  steppedPier: [314, 421], springStairs: [360, 442], splitRelay: [450, 523],
};

const extraCrossings = [
  [ // Dusk Valley
    "open brook open lowSpan brook open steppingStones",
    "brook open steppingStones brook open brook lowSpan",
    "open lowSpan brook steppingStones open lowSpan brook",
    "steppingStones brook open lowSpan brook steppingStones open",
    "brook steppingStones lowSpan open brook lowSpan steppingStones",
    "open brook lowSpan steppingStones brook open lowSpan",
    "lowSpan open brook lowSpan steppingStones brook open",
    "brook steppingStones open lowSpan open brook steppingStones",
  ],
  [ // Cedar in the Mist
    "brook lowSpan open steppingStones brook lowSpan steppingStones",
    "steppingStones brook lowSpan open dock brook lowSpan",
    "open steppingStones lowSpan dock brook steppingStones open",
    "lowSpan dock brook steppingStones open lowSpan stair",
    "steppingStones lowSpan open dock steppingStones stair brook",
    "dock brook steppingStones lowSpan stair open dock",
    "lowSpan steppingStones stair brook dock open steppingStones",
    "stair lowSpan dock open steppingStones dock lowSpan",
  ],
  [ // Waterwheel Run
    "dock lowSpan steppedPier stair dock arch lowSpan",
    "stair dock steppingStones steppedPier arch lowSpan steppedPier",
    "lowSpan arch steppedPier dock stair bridge dock",
    "steppedPier stair dock arch lowSpan steppedPier ridge",
    "arch steppedPier bridge lowSpan dock ridge stair",
    "dock bridge steppedPier ridge stair lowSpan arch",
    "ridge steppedPier lowSpan arch dock stair steppedPier",
    "steppedPier arch dock bridge ridge steppedPier stair",
  ],
  [ // Copperleaf Crossing
    "bridge arch dock stair switchback bridge arch",
    "stair bridge switchback arch lowSpan ridge bridge",
    "arch stair bridge ridge switchback dock arch",
    "bridge switchback dock arch bridge ridge stair",
    "dock arch switchback bridge stair arch switchback",
    "switchback bridge arch ridge dock switchback bridge",
    "arch ridge stair switchback arch bridge dock",
  ],
  [ // Clockwork Works
    "spring bridge arch springStairs stair spring switchback",
    "arch springStairs bridge spring dock springStairs stair",
    "springStairs ridge spring arch switchback springStairs bridge",
    "bridge spring arch springStairs switchback springStairs ridge",
    "springStairs switchback bridge spring ridge springStairs arch",
    "arch spring ridge springStairs stair switchback spring",
    "switchback springStairs arch bridge springStairs ridge spring",
  ],
  [ // Gale Ridge
    "ridge highRidge switchback springStairs arch ridge highRidge",
    "switchback ridge spring highRidge ridge arch springStairs",
    "springStairs highRidge arch ridge switchback spring highRidge",
    "highRidge springStairs ridge switchback arch highRidge ridge",
    "ridge switchback highRidge springStairs ridge highRidge spring",
    "highRidge arch springStairs ridge switchback highRidge arch",
    "springStairs ridge highRidge arch springStairs switchback ridge",
  ],
  [ // Moonwake Harbor
    "steppedPier dock arch steppedPier lowSpan bridge steppedPier",
    "arch steppedPier bridge dock steppedPier springStairs arch",
    "dock steppedPier switchback arch bridge steppedPier ridge",
    "steppedPier bridge steppedPier ridge dock springStairs steppedPier",
    "arch steppedPier lowSpan dock switchback steppedPier arch",
    "steppedPier ridge dock steppedPier springStairs arch steppedPier",
    "switchback steppedPier arch bridge steppedPier ridge dock",
  ],
  [ // Starlit Switchbacks
    "switchback springStairs highRidge splitRelay ridge switchback spring",
    "springStairs switchback splitRelay ridge highRidge switchback arch",
    "highRidge springStairs switchback arch splitRelay ridge highRidge",
    "switchback splitRelay ridge springStairs switchback highRidge ridge",
    "splitRelay switchback highRidge ridge switchback springStairs arch",
    "highRidge arch springStairs switchback splitRelay ridge switchback",
    "springStairs splitRelay highRidge switchback ridge springStairs highRidge",
  ],
  [ // Midnight Viaduct
    "highRidge switchback relay ridge splitRelay highRidge arch",
    "splitRelay highRidge switchback relay arch highRidge ridge",
    "highRidge relay ridge switchback highRidge splitRelay relay",
    "switchback splitRelay highRidge arch relay ridge highRidge",
    "relay highRidge switchback splitRelay ridge highRidge relay",
    "highRidge splitRelay arch relay highRidge switchback splitRelay",
    "switchback relay highRidge splitRelay relay ridge highRidge",
  ],
  [ // Windspire Ascent
    "splitRelay highRidge relay switchback splitRelay highRidge relay",
    "highRidge splitRelay springStairs relay highRidge splitRelay switchback",
    "relay switchback splitRelay highRidge relay ridge splitRelay",
    "splitRelay relay highRidge springStairs splitRelay highRidge relay",
    "highRidge splitRelay relay ridge splitRelay switchback highRidge",
    "relay highRidge splitRelay relay switchback splitRelay highRidge",
    "splitRelay relay highRidge splitRelay springStairs highRidge splitRelay",
  ],
];

const shoreObstacles = [
  ["terrace", "patrol", "brambles", "terrace", "patrol"],
  ["brambles", "terrace", "patrol", "brambles", "terrace"],
  ["patrol", "terrace", "splitPath", "brambles", "overpass"],
  ["terrace", "splitPath", "overpass", "patrol", "lookout"],
  ["lookout", "brambles", "overpass", "splitPath", "terrace"],
  ["sentries", "terrace", "splitPath", "overpass", "lookout"],
  ["lookout", "splitPath", "overpass", "sentries", "terrace"],
  ["splitPath", "sentries", "lookout", "terrace", "overpass"],
  ["sentries", "splitPath", "lookout", "overpass", "sentries"],
  ["lookout", "sentries", "splitPath", "sentries", "lookout"],
];

function extraSections(courseIndex) {
  return extraCrossings[courseIndex].map((crossings, sectionIndex) => {
    const obstacles = shoreObstacles[courseIndex];
    const spans = crossings.split(" ").map((crossing, index) => {
      const [min, max] = crossingLengths[crossing];
      const variation = courseIndex * 37 + sectionIndex * 53 + index * 71;
      const width = index === 0 ? 580 + variation % 52 : 405 + variation % 153;
      const gap = min + (variation * 7 % (max - min + 1));
      const obstacle = index === 0 ? "terrace" : obstacles[(index + sectionIndex * 2) % obstacles.length];
      return [width, gap, crossing, obstacle];
    });
    spans.push([460, 0, "open", obstacles[sectionIndex % obstacles.length]]);
    return spans;
  });
}

function collisionCells(end, platforms, seeds, spikes) {
  const cells = Array.from({ length: Math.ceil(end / COLLISION_CELL_WIDTH) },
    () => ({ platforms: [], seeds: [], spikes: [] }));
  function add(kind, item, left, right) {
    const first = Math.max(0, Math.floor((left - PLAYFIELD.courierWidth) / COLLISION_CELL_WIDTH));
    const last = Math.min(cells.length - 1, Math.floor(right / COLLISION_CELL_WIDTH));
    for (let i = first; i <= last; i += 1) cells[i][kind].push(item);
  }
  for (const platform of platforms) add("platforms", platform, platform.x, platform.x + platform.w);
  seeds.forEach(([x], index) => add("seeds", index, x - 12, x + 12));
  for (const spike of spikes) add("spikes", spike, spike[0], spike[0] + spike[1]);
  return cells;
}

function extendRoute(opening, sections) {
  const { checkpoint, ...route } = opening;
  const platforms = route.platforms.map(platform => ({ ...platform }));
  const seeds = [...route.seeds];
  const enemies = [...route.enemies];
  const spikes = [...route.spikes];
  const checkpoints = [checkpoint];
  let end = route.end;
  let lastBank = platforms.find(platform => platform.ground && platform.x + platform.w === end);
  const floor = PLAYFIELD.floor;

  function ledge(x, y, w, spring = false) {
    platforms.push({ x, y, w, spring });
    seeds.push([x + w * .29, y - (spring ? 66 : 27)], [x + w * .73, y - (spring ? 97 : 27)]);
  }

  for (const section of sections) {
    checkpoints.push(end + 120);
    for (const [width, gap, crossing, obstacle] of section) {
      const start = end;
      const edge = start + width;
      if (lastBank.x + lastBank.w === start) {
        lastBank.w += width;
      } else {
        lastBank = { x: start, y: floor, w: width, ground: true };
        platforms.push(lastBank);
      }
      const center = start + Math.round(width * .51);
      if (obstacle === "patrol") {
        enemies.push([center, floor, center - 63, center + 79]);
        ledge(center - 97, 462, 137);
      } else if (obstacle === "brambles") {
        spikes.push([center - 24, 57]);
        ledge(center - 91, 477, 131);
      } else if (obstacle === "terrace") {
        ledge(center - 141, 482, 106);
        ledge(center - 6, 431, 92);
        ledge(center + 98, 464, 88);
      } else if (obstacle === "splitPath") {
        spikes.push([center - 100, 65], [center + 35, 61]);
        ledge(center - 145, 476, 110);
        ledge(center - 14, 425, 111);
        ledge(center + 111, 467, 85);
      } else if (obstacle === "lookout") {
        ledge(center - 175, 470, 118);
        ledge(center - 24, 425, 128);
        ledge(center + 117, 480, 82);
        enemies.push([center + 16, 425, center - 22, center + 98]);
        spikes.push([center - 56, 88]);
      } else if (obstacle === "overpass" || obstacle === "sentries") {
        const guarded = obstacle === "sentries";
        const upper = guarded ? 414 : 429;
        ledge(center - 150, 474, 98);
        ledge(center - 35, upper, 125);
        spikes.push([center - 26, guarded ? 145 : 113]);
        if (guarded) {
          enemies.push([center + 10, upper, center - 27, center + 85]);
          const approach = edge - 145;
          if (approach >= center + 143) spikes.push([approach, 48]);
        }
      } else {
        ledge(center - 51, 468, 105);
      }
      seeds.push([edge - 35, floor - 30]);
      for (const [relative, y, w, spring] of crossings[crossing]) {
        ledge(edge + Math.round(gap * relative - w / 2), y, w, spring);
      }
      end = edge + gap;
    }
  }
  return { ...route, platforms, seeds, enemies, spikes, checkpoints, end, goal: end - 147,
    cells: collisionCells(end, platforms, seeds, spikes) };
}

const COURSES = openingRoutes.map((opening, index) =>
  extendRoute(opening, [...courseSections[index], ...extraSections(index)]));
