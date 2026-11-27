import { bottom, eachObject, height, tile, width } from "./course.js";

const themes = [
  { grass: "#a4d87e", trim: "#80b96d", water: "#73ccdb", deep: "#48adb9", road: "#e0c495", edge: "#c7a777" },
  { grass: "#97ce9e", trim: "#70b886", water: "#6cc6cd", deep: "#429da9", road: "#dec4a7", edge: "#bca283" },
  { grass: "#c0ce7e", trim: "#99b670", water: "#87c6ca", deep: "#5aaaaf", road: "#ddb583", edge: "#c69a67" },
  { grass: "#91baab", trim: "#70a798", water: "#6da4ca", deep: "#557eb4", road: "#c7b5b7", edge: "#aa93a2" }
];

function shape(ctx, x, y, w, h, radius, fill, stroke = null) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

function oval(ctx, x, y, rx, ry, fill) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
}

function line(ctx, x1, y1, x2, y2, stroke, size = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineWidth = size;
  ctx.lineCap = "round";
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function flower(ctx, x, y, color) {
  for (const [dx, dy] of [[0,-3], [3,0], [0,3], [-3,0]]) oval(ctx, x + dx, y + dy, 2.1, 2.1, color);
  oval(ctx, x, y, 1.7, 1.7, "#eabb64");
}

function field(ctx, game, theme, time) {
  for (const [row, lane] of game.course.lanes.entries()) {
    const top = row * tile;
    const y = top + tile / 2;
    const type = lane.type;
    if (type === "grass" || type === "nest") {
      ctx.fillStyle = theme.grass;
      ctx.fillRect(0, top, width, tile);
      ctx.fillStyle = theme.trim;
      ctx.fillRect(0, top, width, 4);
      ctx.fillRect(0, top + tile - 4, width, 4);
      for (let col = 0; col < width / tile; col++) {
        const x = col * tile + 10 + ((row * col * 7) % 25);
        const dotY = y + ((row * 11 + col * 7) % 25) - 12;
        if ((row + col) % 3 === 0) flower(ctx, x, dotY, "#fff1ca");
        else oval(ctx, x, dotY, 7, 2.4, theme.trim);
      }
      if (row === bottom) {
        shape(ctx, width / 2 - 24, y - 23, 48, 47, 13, "#fff8cfad", "#8baa68");
        line(ctx, width / 2 - 8, y + 2, width / 2, y - 6, "#566f4a");
        line(ctx, width / 2, y - 6, width / 2 + 8, y + 2, "#566f4a");
      }
    } else if (type === "cart") {
      ctx.fillStyle = theme.road;
      ctx.fillRect(0, top, width, tile);
      ctx.fillStyle = theme.edge;
      ctx.fillRect(0, top, width, 3);
      ctx.fillRect(0, top + tile - 3, width, 3);
      for (let x = 14; x < width; x += 50) line(ctx, x, y + 1, x + 24, y + 1, "#fff4d788", 2.7);
    } else {
      const water = ctx.createLinearGradient(0, top, 0, top + tile);
      water.addColorStop(0, theme.deep);
      water.addColorStop(.52, theme.water);
      water.addColorStop(1, theme.deep);
      ctx.fillStyle = water;
      ctx.fillRect(0, top, width, tile);
      for (let col = -1; col < 8; col++) {
        const x = col * 86 + (row % 2 ? 28 : 0) + Math.sin(time * .75 + col + row) * 9;
        const dy = (col % 3) * 7;
        line(ctx, x, y - 6 + dy, x + 19, y - 6 + dy, "#ffffff62", 1.7);
        line(ctx, x + 21, y + 4 + dy, x + 29, y + 4 + dy, "#ffffff44", 1.25);
      }
    }
  }
}

function log(ctx, x, y, length) {
  oval(ctx, x, y + 17, length * .48, 9, "#2555754b");
  shape(ctx, x - length / 2, y - 16, length, 30, 13, "#b98251", "#704b34");
  shape(ctx, x - length / 2 + 7, y - 12, length - 14, 17, 8, "#d5a46d");
  line(ctx, x - length * .33, y - 3, x + length * .30, y - 3, "#8e603d", 1.5);
  line(ctx, x - length * .21, y + 6, x + length * .38, y + 6, "#9a693f", 1.4);
  for (const side of [-1, 1]) oval(ctx, x + side * (length / 2 - 8), y - 1, 6, 11, "#e6b57e");
}

function ferry(ctx, x, y, length) {
  oval(ctx, x, y + 15, length * .47, 9, "#2555754b");
  shape(ctx, x - length / 2, y - 18, length, 35, 16, "#c68454", "#734b35");
  shape(ctx, x - length / 2 + 8, y - 11, length - 16, 20, 9, "#e7bc83");
  for (const offset of [-.27, 0, .27]) shape(ctx, x + length * offset - 4, y - 11, 8, 21, 3, "#a36b4c");
  line(ctx, x - length * .4, y + 11, x + length * .4, y + 11, "#f4d6ae", 2.8);
}

function stone(ctx, x, y, length) {
  const rock = length / 3;
  for (let i = -1; i <= 1; i++) {
    const center = x + i * rock * .94;
    oval(ctx, center, y + 11, rock * .51, 10, "#2b627e67");
    oval(ctx, center, y + (i % 2) * 2, rock * .52, 17, "#9eaeb3");
    oval(ctx, center - 6, y - 8, rock * .24, 4, "#d8e0d7");
  }
}

function pad(ctx, x, y, length, phase, reduced) {
  const visible = phase < 3.65;
  const warning = phase >= 3.15;
  const dim = visible && warning && !reduced && Math.floor(phase * 13) % 2 === 0;
  ctx.save();
  if (!visible) ctx.globalAlpha = .21;
  else if (dim) ctx.globalAlpha = .54;
  const width = length / 2;
  for (const side of [-1, 1]) {
    const cx = x + side * width * .44;
    ctx.beginPath();
    ctx.ellipse(cx, y, width * .55, 19, side * .11, .31, Math.PI * 2 - .27);
    ctx.lineTo(cx, y);
    ctx.closePath();
    ctx.fillStyle = warning ? "#89b969" : "#70bf78";
    ctx.fill();
    ctx.strokeStyle = "#3d835e";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    line(ctx, cx, y, cx - 12, y - 12, "#d5ee9f", 1.3);
  }
  if (visible) flower(ctx, x, y - 11, "#f7cbd5");
  ctx.restore();
}

function cart(ctx, x, y, length, facing, scheme) {
  const colors = [["#e58d72", "#955446"], ["#efc86d", "#9a763f"], ["#86b3d3", "#53768a"]];
  const [base, edge] = colors[scheme % colors.length];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  oval(ctx, 0, 14, length * .46, 7, "#785a4761");
  for (const side of [-1, 1]) oval(ctx, side * length * .29, 9, 8, 9, "#64534e");
  shape(ctx, -length/2, -11, length, 25, 8, base, edge);
  shape(ctx, -length*.27, -21, length*.52, 19, 8, base, edge);
  shape(ctx, 1, -17, length*.16, 8, 3, "#eaf3e0");
  oval(ctx, length*.42, -3, 4.3, 3.7, "#fff0a7");
  line(ctx, -length*.38, 2, length*.3, 2, "#fff2ca8c", 2);
  ctx.restore();
}

function duckling(ctx, image, x, y, size, direction) {
  ctx.save();
  ctx.translate(x, y);
  if (direction === "right") ctx.scale(-1, 1);
  if (image.complete && image.naturalWidth) {
    const ratio = image.naturalWidth / image.naturalHeight;
    ctx.drawImage(image, -size * ratio / 2, -size / 2, size * ratio, size);
  } else {
    oval(ctx, 5, 6, size * .4, size * .26, "#ffd15d");
    oval(ctx, -7, -6, size * .28, size * .3, "#ffdc73");
    oval(ctx, -size * .43, -2, size * .17, size * .08, "#e57840");
    oval(ctx, -size * .24, -7, 1.7, 2.2, "#452d21");
  }
  ctx.restore();
}

export function makePainter(canvas, reduced) {
  const ctx = canvas.getContext("2d");
  const image = new Image();
  image.src = "./assets/duck.webp";
  let lastWidth;
  const paint = (game, resize = false) => {
    if (resize || !lastWidth) {
      const pixelWidth = Math.round(canvas.getBoundingClientRect().width * Math.min(2, window.devicePixelRatio || 1));
      if (pixelWidth > 0 && lastWidth !== pixelWidth) {
        lastWidth = pixelWidth;
        canvas.width = pixelWidth;
        canvas.height = Math.round(height * pixelWidth / width);
        ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
      }
    }

    const theme = themes[Math.floor(game.course.index / 6)];
    const time = game.time;
    field(ctx, game, theme, reduced.matches ? 0 : time);
    for (const col of game.course.nests) {
      const x = (col + .5) * tile;
      oval(ctx, x, 33, 26, 18, "#7a593c");
      oval(ctx, x, 28, 25, 15, "#c99a64");
      oval(ctx, x, 28, 18, 10, game.home.has(col) ? "#e2bc75" : "#f7dc9e");
      for (let i = -2; i <= 2; i++) line(ctx, x + i * 6, 40, x + i * 6 + 7, 43, "#ecd095", 1);
      if (game.home.has(col)) duckling(ctx, image, x, 26, 32, "left");
      else {
        ctx.fillStyle = "#705233";
        ctx.font = "850 15px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("★", x, 34);
      }
    }
    for (const lane of game.course.lanes) {
      if (lane.type === "grass" || lane.type === "nest") continue;
      const y = (lane.row + .5) * tile;
      eachObject(lane, time, (x, phase, i) => {
        switch (lane.type) {
          case "log": log(ctx, x, y, lane.length); break;
          case "ferry": ferry(ctx, x, y, lane.length); break;
          case "stone": stone(ctx, x, y, lane.length); break;
          case "pad": pad(ctx, x, y, lane.length, phase, reduced.matches); break;
          case "cart": cart(ctx, x, y, lane.length, Math.sign(lane.speed), lane.row + i); break;
        }
      });
    }
    if (game.mode === "clear" || game.mode === "lost") return;
    const flight = game.flight;
    const player = game.player;
    const fraction = flight ? Math.min(1, flight.elapsed / flight.duration) : 0;
    const x = flight ? flight.fromX + (flight.x - flight.fromX) * fraction : player.x;
    const row = flight ? flight.fromRow + (flight.row - flight.fromRow) * fraction : player.row;
    const y = (row + .5) * tile;
    const lift = reduced.matches ? 0 : Math.sin(fraction * Math.PI) * 13;
    if (game.flash > 0 && !reduced.matches) ctx.globalAlpha = .58 + game.flash * .8;
    oval(ctx, x, y + 15, 15, 4.2, "#33665468");
    duckling(ctx, image, x, y - 4 - lift, 45, player.face);
    ctx.globalAlpha = 1;
  };
  paint.onSpriteLoad = (draw) => image.addEventListener("load", draw);
  return paint;
}
