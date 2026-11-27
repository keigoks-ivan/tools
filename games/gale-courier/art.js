const landscapes = new Map();
const terrain = {
  dusk: ["#152927", "#283e32", "#a9a572", "#596e43", "#f6ce8c"],
  morning: ["#163234", "#294e43", "#b2bf83", "#567c59", "#e1edae"],
  millstream: ["#162e36", "#28484b", "#9db9a2", "#537e74", "#abd9ce"],
  leafbridge: ["#332725", "#504037", "#d6a16e", "#8c5c44", "#f8ad72"],
  copper: ["#352e29", "#46372e", "#d7ad71", "#836449", "#ffd28f"],
  "gale-ridge": ["#253440", "#3a4c54", "#c2c7a9", "#687e77", "#e4e3bf"],
  night: ["#222b40", "#313b51", "#b4b3d6", "#596282", "#b8c7ff"],
  starwood: ["#192c36", "#2d434d", "#9bbed1", "#4c727d", "#9ee3d9"],
  bellworks: ["#242937", "#3a4050", "#bcb5c9", "#6a6379", "#d5bfef"],
  summit: ["#203134", "#394a47", "#d4be91", "#7e795b", "#ffdda2"],
};

function landscape(key) {
  if (!landscapes.has(key)) {
    const image = new Image();
    image.src = `${key}.webp`;
    landscapes.set(key, image);
  }
  return landscapes.get(key);
}

function noise(seed) {
  const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function fill(ctx, color, x, y, w, h) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function polygon(ctx, color, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i][0], points[i][1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function halo(ctx, x, y, radius, color) {
  const gradient = ctx.createRadialGradient(x, y, 1, x, y, radius);
  gradient.addColorStop(0, color);
  gradient.addColorStop(1, "transparent");
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function paintBackdrop(ctx, width, camera, time, titleScreen, course) {
  const height = PLAYFIELD.height;
  const backdrop = landscape(course.background);
  const [rock, soil, edge, trim, light] = terrain[course.background];
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, rock);
  sky.addColorStop(.48, edge);
  sky.addColorStop(.72, trim);
  sky.addColorStop(1, soil);
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
  if (backdrop.complete && backdrop.naturalWidth) {
    const progress = camera / Math.max(1, course.end - width);
    const zoom = Math.max((width + 26) / backdrop.naturalWidth, height / backdrop.naturalHeight);
    const imageWidth = backdrop.naturalWidth * zoom;
    const imageHeight = backdrop.naturalHeight * zoom;
    const drift = titleScreen ? .78 : .64 + progress * .21;
    ctx.drawImage(backdrop, (width - imageWidth) * drift, (height - imageHeight) * .54, imageWidth, imageHeight);
  }

  const shadow = ctx.createLinearGradient(0, 0, 0, height);
  shadow.addColorStop(0, "#1123263c");
  shadow.addColorStop(.26, "#12272c00");
  shadow.addColorStop(.7, "#12272c00");
  shadow.addColorStop(1, "#10252cbe");
  ctx.fillStyle = shadow;
  ctx.fillRect(0, 0, width, height);

  for (let i = 0; i < 36; i += 1) {
    const x = ((noise(i + 123) * width + time * (7 + noise(i + 4) * 14)) % (width + 45)) - 10;
    const y = 128 + noise(i + 9) * 398 + Math.sin(time * .8 + i * 2) * 10;
    ctx.globalAlpha = .16 + (Math.sin(time * 1.6 + i) + 1) * .18;
    fill(ctx, i % 3 ? light : "#fff0b5", x, y, i % 5 ? 2 : 3, 2);
  }
  ctx.globalAlpha = 1;

  for (let i = 0; i < 5; i += 1) {
    const x = ((noise(i + 206) * width + time * 11) % (width + 90)) - 90;
    const y = 120 + noise(i + 83) * 335;
    ctx.strokeStyle = "#f7deb44c";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 24, y - 1, x + 42, y - 11, x + 69, y - 7);
    ctx.stroke();
  }
}

function paintSprig(ctx, x, y, height, phase, flower) {
  const lean = Math.sin(phase) * 4;
  polygon(ctx, "#537455", [[x - 1, y], [x + 1, y], [x + lean + 1, y - height], [x + lean - 1, y - height]]);
  fill(ctx, "#86a16a", x - 4, y - height / 2, 5, 2);
  fill(ctx, "#6c8b58", x + 1, y - height / 2 - 3, 4, 2);
  if (flower) {
    fill(ctx, "#b56453", x + lean - 4, y - height - 2, 9, 3);
    fill(ctx, "#e29a6c", x + lean - 2, y - height - 4, 5, 3);
    fill(ctx, "#f4b779", x + lean, y - height - 4, 2, 2);
  }
}

function paintPlatform(ctx, platform, camera, width, time, palette) {
  const { x, y, w, ground, spring } = platform;
  const [rock, soil, edge, trim] = palette;
  if (x + w < camera - 65 || x > camera + width + 65) return;
  if (ground) {
    polygon(ctx, rock, [[x, y], [x + w, y], [x + w, y + 29], [x + w - 12, y + 46],
      [x + w - 18, PLAYFIELD.height + 12], [x + 16, PLAYFIELD.height + 12], [x + 12, y + 44], [x, y + 34]]);
    fill(ctx, soil, x + 4, y + 9, w - 8, 23);
    for (let i = 14; i < w - 13; i += 26) {
      const piece = x + i;
      if (piece < camera - 35 || piece > camera + width + 35) continue;
      const n = noise(piece + 12);
      const offset = n * 38;
      polygon(ctx, soil, [[piece, y + 24 + offset], [piece + 15, y + 19 + offset],
        [piece + 24, y + 25 + offset], [piece + 18, y + 33 + offset], [piece + 5, y + 36 + offset]]);
      fill(ctx, trim, piece + 7, y + 22 + offset, 6 + Math.floor(n * 9), 2);
    }
  } else {
    polygon(ctx, rock, [[x, y], [x + w, y], [x + w - 3, y + 14], [x + w - 17, y + 24],
      [x + w * .68, y + 25], [x + w * .49, y + 34], [x + w * .21, y + 23], [x + 7, y + 17]]);
    fill(ctx, soil, x + 4, y + 6, w - 8, 10);
    for (const post of [x + 20, x + w - 24]) {
      fill(ctx, "#3f4834", post, y + 16, 7, 20);
      fill(ctx, "#9d7750", post + 2, y + 17, 4, 3);
    }
    fill(ctx, rock, x + 8, y + 13, w - 16, 3);
  }
  fill(ctx, edge, x + 1, y, w - 2, 3);
  fill(ctx, trim, x + 1, y + 3, w - 2, 5);
  fill(ctx, rock, x + 3, y + 8, w - 6, 2);
  if (spring) {
    halo(ctx, x + w / 2, y, 54, "#ffc67555");
    fill(ctx, "#ffe0a2", x, y, w, 3);
    fill(ctx, "#9d5e3e", x + 2, y + 3, w - 4, 5);
    for (let i = 13; i < w - 10; i += 15) {
      polygon(ctx, "#de9d60", [[x+i,y+9], [x+i+5,y+9], [x+i+11,y+19], [x+i+6,y+19]]);
    }
    return;
  }
  for (let i = 3; i < w - 4; i += 8) {
    const spot = x + i;
    if (spot < camera - 25 || spot > camera + width + 25) continue;
    const n = noise(spot);
    fill(ctx, n > .55 ? "#ab9a62" : "#6c814d", spot, y - (n > .65 ? 2 : 0), 3 + Math.floor(n * 6), 2);
    if (n > .66) paintSprig(ctx, spot, y, 5 + n * 10, time * 1.9 + n * 7, n > .88);
    if (ground && i > 13 && i < w - 13) {
      fill(ctx, n > .48 ? "#3d513c" : "#22332f", spot, y + 13 + n * 53, 5 + Math.floor(n * 10), 3);
      if (n > .69) fill(ctx, "#45543c", spot - 3, y + 11 + n * 36, 4, 6);
    }
  }
}

function paintLantern(ctx, x, y, lit = true) {
  if (lit) halo(ctx, x + 12, y - 54, 36, "#f1ae5d70");
  fill(ctx, "#172b28", x, y - 70, 6, 71);
  fill(ctx, "#637150", x + 1, y - 66, 2, 65);
  fill(ctx, "#293c32", x + 3, y - 69, 19, 4);
  fill(ctx, "#574e38", x + 11, y - 64, 4, 8);
  fill(ctx, "#574434", x + 6, y - 58, 14, 4);
  fill(ctx, lit ? "#efb867" : "#54644e", x + 8, y - 54, 10, 13);
  fill(ctx, lit ? "#ffdda0" : "#6a7358", x + 10, y - 52, 6, 9);
  fill(ctx, "#573e32", x + 6, y - 41, 14, 4);
}

function paintSign(ctx, x, resting, time) {
  paintLantern(ctx, x - 29, PLAYFIELD.floor, resting);
  fill(ctx, "#253832", x, 485, 6, 60);
  fill(ctx, "#5a6548", x + 1, 491, 2, 52);
  polygon(ctx, resting ? "#bd8153" : "#6c7453", [[x + 4, 488], [x + 34, 488],
    [x + 26 + Math.sin(time * 3) * 3, 499], [x + 33, 511], [x + 4, 510]]);
  fill(ctx, resting ? "#fff0bb" : "#9a9e71", x + 12, 494, 11, 3);
  fill(ctx, resting ? "#fff0bb" : "#9a9e71", x + 16, 490, 3, 12);
}

function paintMailbox(ctx, x, time) {
  const y = PLAYFIELD.floor;
  halo(ctx, x, y - 51, 95, "#f6ba654f");
  paintLantern(ctx, x - 62, y);
  paintLantern(ctx, x + 46, y);
  polygon(ctx, "#172927", [[x - 37, y], [x - 37, y - 72], [x - 20, y - 96],
    [x + 19, y - 96], [x + 37, y - 72], [x + 37, y]]);
  polygon(ctx, "#50604a", [[x - 33, y - 2], [x - 33, y - 70], [x - 17, y - 90],
    [x + 17, y - 90], [x + 33, y - 70], [x + 33, y - 2]]);
  fill(ctx, "#b79560", x - 16, y - 90, 31, 3);
  fill(ctx, "#1b312e", x - 22, y - 68, 44, 52);
  fill(ctx, "#d19758", x - 15, y - 59, 30, 19);
  polygon(ctx, "#ffdfa0", [[x - 13, y - 57], [x + 13, y - 57], [x, y - 47]]);
  fill(ctx, "#bf8053", x - 2, y - 49, 4, 4);
  fill(ctx, "#738062", x - 25, y - 15, 50, 4);
  fill(ctx, "#916c4c", x - 39, y - 4, 78, 4);
  paintSeed(ctx, { x, y: y - 121 }, time, "#fff0b4");
}

function paintSeed(ctx, seed, time, edge = "#e5a357") {
  const x = Math.round(seed.x);
  const y = Math.round(seed.y + Math.sin(time * 4 + x * .04) * 3);
  halo(ctx, x, y, 23, "#ffc36b47");
  polygon(ctx, "#54442e", [[x, y - 11], [x + 8, y], [x, y + 11], [x - 8, y]]);
  polygon(ctx, edge, [[x, y - 9], [x + 6, y], [x, y + 8], [x - 6, y]]);
  polygon(ctx, "#ffebaa", [[x, y - 8], [x + 1, y + 5], [x - 4, y]]);
  fill(ctx, "#fff9d2", x - 1, y - 3, 2, 3);
}

function paintEnemy(ctx, enemy, time) {
  const { x, y, dir } = enemy;
  const step = Math.floor(time * 9 + x * .07) % 2;
  ctx.save();
  ctx.translate(Math.round(x + 16), Math.round(y + 27));
  ctx.scale(dir, 1);
  fill(ctx, "#172726", -12, -4, 7, 4 + step);
  fill(ctx, "#172726", 5, -5, 8, 5 - step);
  polygon(ctx, "#172b29", [[-18, -8], [-15, -20], [-9, -26], [8, -26], [16, -20], [19, -10], [12, -4], [-11, -4]]);
  polygon(ctx, "#a36145", [[-14, -10], [-12, -20], [-7, -24], [8, -24], [14, -19], [16, -10]]);
  fill(ctx, "#de925a", -8, -23, 15, 3);
  fill(ctx, "#cd8550", -13, -16, 9, 3);
  fill(ctx, "#6c5140", -3, -18, 4, 11);
  fill(ctx, "#243a35", 3, -17, 12, 7);
  fill(ctx, "#ffce76", 7, -15, 3, 3);
  fill(ctx, "#f3a362", 12, -15, 2, 3);
  fill(ctx, "#547056", -15, -8, 29, 3);
  fill(ctx, "#638664", -5, -28, 3, 4);
  ctx.restore();
}

function paintCourier(ctx, p, time, zoom = 1) {
  if (p.invulnerable > 0 && Math.floor(p.invulnerable * 16) % 2) return;
  const running = p.grounded && Math.abs(p.vx) > 45;
  const stride = running ? Math.round(Math.sin(time * 20) * 3) : 0;
  const bounce = running ? Math.abs(stride) * .32 : p.grounded ? Math.sin(time * 2.4) * .5 : 0;
  ctx.save();
  ctx.translate(Math.round(p.x + p.w / 2), Math.round(p.y + p.h - bounce));
  ctx.scale(p.facing * zoom, zoom);
  polygon(ctx, "#392b36", [[-6, -29], [-22, -28], [-31, -26 + Math.sin(time * 8) * 4], [-23, -21], [-9, -24]]);
  polygon(ctx, "#e17b65", [[-7, -29], [-21, -27], [-28, -26 + Math.sin(time * 8) * 4], [-20, -23], [-9, -24]]);
  fill(ctx, "#152827", -11 + stride, -10, 9, 10 - Math.max(0, stride));
  fill(ctx, "#203534", 2 - stride, -12, 9, 12 + Math.min(0, stride));
  fill(ctx, "#a47555", -12 + stride, -3, 10, 3);
  fill(ctx, "#cd9163", 2 - stride, -3, 11, 3);
  polygon(ctx, "#172b2c", [[-13, -31], [9, -31], [12, -24], [11, -11], [6, -7], [-10, -7], [-14, -14]]);
  polygon(ctx, "#3e776d", [[-10, -29], [7, -29], [10, -22], [8, -12], [4, -9], [-9, -9], [-11, -14]]);
  fill(ctx, "#67a392", -8, -25, 4, 12);
  fill(ctx, "#e4a778", -13, -20, 8, 10);
  fill(ctx, "#ffd3a0", -12, -19, 6, 2);
  fill(ctx, "#a77555", -13, -12, 9, 4);
  fill(ctx, "#885c4c", -10, -17, 2, 4);
  fill(ctx, "#9c574b", -10, -28, 21, 5);
  fill(ctx, "#ec9270", -8, -28, 15, 3);
  polygon(ctx, "#2d302b", [[-13, -29], [-14, -39], [-9, -46], [-2, -48], [8, -46],
    [14, -40], [14, -30], [9, -26], [-6, -27]]);
  polygon(ctx, "#ebcc8a", [[-11, -33], [-11, -40], [-7, -45], [7, -45], [12, -39], [12, -32], [8, -29], [-7, -29]]);
  fill(ctx, "#fff0b9", -6, -44, 10, 3);
  fill(ctx, "#b5845e", -11, -38, 5, 7);
  fill(ctx, "#182e31", 0, -39, 15, 7);
  fill(ctx, "#74b5a8", 4, -38, 8, 4);
  fill(ctx, "#dcf1c5", 7, -38, 4, 2);
  fill(ctx, "#e2aa78", 5, -32, 6, 3);
  ctx.restore();
}

function paintGroundShadow(ctx, player, platforms) {
  const x = player.x + player.w / 2;
  const feet = player.y + player.h;
  const y = platforms.reduce((nearest, platform) => {
    if (platform.y >= feet - .03 && platform.x < x && x < platform.x + platform.w) {
      return Math.min(nearest, platform.y);
    }
    return nearest;
  }, Infinity);
  const height = y - feet;
  if (height > 115) return;
  ctx.fillStyle = `rgba(10, 20, 25, ${.66 * (1 - height / 116)})`;
  ctx.beginPath();
  ctx.ellipse(x, y + 2.5, 15 + Math.max(0, height) * .045, 3.5, 0, 0, 2 * Math.PI);
  ctx.fill();
}

function renderScene(ctx, width, run, camera, time, particles, titleScreen) {
  const course = run.course;
  paintBackdrop(ctx, width, camera, time, titleScreen, course);
  ctx.save();
  ctx.translate(-Math.round(camera), 0);
  for (const platform of course.platforms) {
    paintPlatform(ctx, platform, camera, width, time, terrain[course.background]);
    const x = platform.x + Math.min(350, platform.w * .23);
    if (platform.ground && x >= camera - 45 && x <= camera + width + 45) {
      paintLantern(ctx, x, PLAYFIELD.floor);
    }
  }
  course.checkpoints.forEach((post, index) => {
    if (post >= camera - 45 && post <= camera + width + 45) {
      paintSign(ctx, post, index < run.checkpoint, time);
    }
  });
  if (course.goal < camera + width + 120) paintMailbox(ctx, course.goal + 10, time);
  for (const [x, w] of course.spikes) {
    if (x + w < camera || x > camera + width) continue;
    for (let i = 0; i < w - 8; i += 12) {
      polygon(ctx, "#8c634e", [[x + i, 545], [x + i + 6, 525], [x + i + 12, 545]]);
      polygon(ctx, "#d19163", [[x + i + 1, 544], [x + i + 6, 526], [x + i + 7, 544]]);
    }
  }
  for (const seed of run.seeds) {
    if (!seed.taken && seed.x >= camera - 23 && seed.x <= camera + width + 23) paintSeed(ctx, seed, time);
  }
  for (const enemy of run.enemies) {
    if (enemy.alive && enemy.x >= camera - 35 && enemy.x <= camera + width + 35) {
      paintEnemy(ctx, enemy, time);
    }
  }
  if (titleScreen) {
    const intro = { ...run.player, x: clamp(width * .66, 148, 779) };
    halo(ctx, intro.x + 12, intro.y + 12, 47, "#ecc3813d");
    paintGroundShadow(ctx, intro, course.platforms);
    paintCourier(ctx, intro, time, 1.35);
  } else {
    paintGroundShadow(ctx, run.player, course.platforms);
    paintCourier(ctx, run.player, time);
  }
  for (const mote of particles) {
    ctx.globalAlpha = Math.min(1, mote.life * 3);
    fill(ctx, mote.color, mote.x, mote.y, mote.size, mote.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
