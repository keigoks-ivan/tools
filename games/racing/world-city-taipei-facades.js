// Original painted materials informed by Xinyi Road street photographs.
// The photographs are reference only; no photographed pixels or logos are used.
function noise(seed) {
  return () => { seed = (Math.imul(1664525, seed) + 1013904223) >>> 0; return seed / 4294967296; };
}

export function paintTaipeiFacade(c, width, height, index) {
  c.scale(width / 512, height / 1024);
  const w = 512, h = 1024, rand = noise(7193 + index * 339), office = index >= 4;
  const wall = ['#c1b6a0', '#a7b6a8', '#c39885', '#c6b17b', '#658891', '#849c90'][index];
  c.fillStyle = wall; c.fillRect(0, 0, w, h);
  if (!office) {
    const tileW = index === 2 ? 13 : 8, tileH = index === 2 ? 8 : 12;
    for (let y = 0; y < h; y += tileH) for (let x = 0; x < w; x += tileW) {
      c.fillStyle = `rgba(${rand() > .5 ? '255,252,236' : '55,60,55'},${.025 + rand() * .05})`;
      c.fillRect(x + .7, y + .7, tileW - 1.4, tileH - 1.4);
    }
    if (index === 1) { c.fillStyle = '#8d9b96'; c.fillRect(0, 0, 68, h); c.fillRect(451, 0, 61, h); }
    if (index === 3) for (let x = 0; x < w; x += 64) { c.fillStyle = 'rgba(66,63,55,.12)'; c.fillRect(x, 0, 1.3, h); }
  }
  const rows = office ? 8 : 6, cols = office ? 8 : index === 1 ? 3 : 4, cw = w / cols, ch = h / rows;
  for (let row = 0; row < rows; row++) {
    if (!office) {
      c.fillStyle = 'rgba(50,59,55,.22)'; c.fillRect(0, row * ch + ch - 18, w, 3);
      c.fillStyle = 'rgba(236,233,214,.42)'; c.fillRect(0, row * ch + ch - 14, w, 7);
    }
    for (let col = 0; col < cols; col++) {
      const inset = office ? 3 : index === 0 ? 10 : index === 1 ? cw * .31 : index === 2 ? cw * .30 : cw * .27;
      const x = col * cw + inset, y = row * ch + (office ? 5 : 29), ww = cw - inset * 2, hh = office ? ch - 20 : ch * (index === 2 ? .38 : index === 3 ? .67 : .56);
      c.fillStyle = 'rgba(33,39,35,.35)'; c.fillRect(x - 5, y - 3, ww + 13, hh + 14);
      c.fillStyle = office ? '#a4b1ad' : '#999f95'; c.fillRect(x - 4, y - 4, ww + 8, hh + 8);
      c.fillStyle = '#303c3a'; c.fillRect(x, y, ww, hh);
      const reflected = c.createLinearGradient(x, y, x, y + hh);
      reflected.addColorStop(0, office ? '#89a0a5' : '#77918f');
      reflected.addColorStop(.43, office ? '#667f83' : '#526d6a');
      reflected.addColorStop(1, office ? '#314c54' : '#273b37');
      c.fillStyle = reflected; c.fillRect(x + 3, y + 3, ww - 6, hh - 6);
      if (rand() > .47) {
        const lowered = hh * (.13 + rand() * .58);
        c.fillStyle = ['#c4bda6', '#a8b2a9', '#d1ccb5'][Math.floor(rand() * 3)]; c.fillRect(x + 4, y + 4, ww - 8, lowered);
        c.fillStyle = 'rgba(47,52,43,.19)'; for (let sy = y + 7; sy < y + lowered; sy += 4) c.fillRect(x + 4, sy, ww - 8, 1);
      } else if (rand() > .78) {
        c.fillStyle = 'rgba(185,147,93,.29)'; c.fillRect(x + 5, y + hh * .43, ww - 10, hh * .48);
      }
      const panes = office ? 2 : index === 0 ? 3 : 2;
      c.fillStyle = office ? '#a7b5b1' : '#b1b6ab';
      for (let pane = 1; pane < panes; pane++) c.fillRect(x + ww * pane / panes - 1, y, 2, hh);
      if (!office) c.fillRect(x, y + hh * .68, ww, 2);
      c.fillStyle = 'rgba(25,33,29,.44)'; c.fillRect(x - 4, y + hh + 5, ww + 12, 4);
      c.fillStyle = 'rgba(238,236,216,.60)'; c.fillRect(x - 5, y + hh + 2, ww + 12, 3);
      if (!office && index !== 3 && rand() > .65) {
        c.fillStyle = '#a5aaa0'; c.fillRect(x + ww - 25, y + hh + 15, 28, 18);
        c.fillStyle = '#727e73'; for (let line = 0; line < 5; line++) c.fillRect(x + ww - 22, y + hh + 18 + line * 2, 21, 1);
      }
      if (index === 2 && row % 3 === 1) {
        c.strokeStyle = '#a3a99f'; c.lineWidth = 1.4;
        for (let bar = 1; bar < 6; bar++) { c.beginPath(); c.moveTo(x + ww * bar / 6, y); c.lineTo(x + ww * bar / 6, y + hh); c.stroke(); }
      }
    }
  }
  for (let mark = 0; mark < (office ? 130 : 480); mark++) {
    c.fillStyle = `rgba(52,58,49,${rand() * (office ? .025 : .065)})`;
    c.fillRect(rand() * w, rand() * h, 1 + rand() * 4, 4 + rand() * 65);
  }
}

export function paintTaipeiStorefront(c, width, height) {
  c.scale(width / 512, height / 256);
  c.fillStyle = '#334941'; c.fillRect(0, 0, 512, 256);
  const room = c.createLinearGradient(0, 0, 0, 256); room.addColorStop(0, '#445649'); room.addColorStop(.36, '#867d58'); room.addColorStop(1, '#384b42');
  c.fillStyle = room; c.fillRect(10, 12, 492, 238);
  for (let shelf = 0; shelf < 3; shelf++) {
    c.fillStyle = '#695f49'; c.fillRect(23, 82 + shelf * 42, 281, 5);
    for (let item = 0; item < 16; item++) { c.fillStyle = ['#b6aa83', '#829b8a', '#9d8970'][item % 3]; c.fillRect(28 + item * 17, 66 + shelf * 42, 9 + item % 3, 16); }
  }
  c.fillStyle = '#d1c4a0'; c.fillRect(353, 55, 97, 109);
  c.fillStyle = '#627b66'; c.fillRect(367, 71, 69, 52);
  c.fillStyle = '#bcb698'; c.fillRect(49, 22, 138, 5); c.fillRect(278, 22, 147, 5);
  c.fillStyle = 'rgba(91,133,127,.24)'; c.fillRect(0, 0, 512, 256);
  c.fillStyle = 'rgba(166,192,179,.18)'; c.beginPath(); c.moveTo(25, 0); c.lineTo(117, 0); c.lineTo(277, 256); c.lineTo(177, 256); c.closePath(); c.fill();
  c.fillStyle = '#899b8c'; for (const x of [0, 248, 505]) c.fillRect(x, 0, 7, 256);
  c.fillRect(0, 248, 512, 8);
}

export function paintTaipeiPaving(c, size) {
  const rand = noise(65481); c.fillStyle = '#b7b7aa'; c.fillRect(0, 0, size, size);
  for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
    const x = (col + row % 2 * .5) * size / 4, y = row * size / 8;
    c.fillStyle = `rgba(${rand() > .45 ? '242,238,218' : '61,70,57'},${.035 + rand() * .075})`;
    c.fillRect(x + 1, y + 1, size / 4 - 2, size / 8 - 2);
    c.fillStyle = 'rgba(66,73,64,.19)'; c.fillRect(x, y, size / 4, 1); c.fillRect(x, y, 1, size / 8);
  }
  for (let i = 0; i < 620; i++) { c.fillStyle = 'rgba(53,60,51,.07)'; c.fillRect(rand() * size, rand() * size, .8, 1.2); }
}
