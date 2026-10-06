import { TABLE, clamp } from './physics.mjs?v=8';

const CORAL = '#f58b70', MINT = '#a7e6c8', CREAM = '#fff9dc';
export function createArena(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  let width = 0, height = 0, scale = 1, now = 0;
  let trail = [], effects = [], latestBall = null;
  const swings = new Map();
  function resize() {
    const rect = canvas.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width === width && rect.height === height) return;
    width = rect.width; height = rect.height; scale = Math.min(width * 0.39, height * 0.45);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  function project(x, y, z) {
    const perspective = 1 + z * 0.11;
    return { x: width / 2 + x * scale * perspective, y: height * 0.42 + z * scale * 0.40 - (y - TABLE.height) * scale * 0.64, scale: perspective };
  }
  function path(points) { ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); }
  function rectWorld(x1, z1, x2, z2, y, fill, stroke, line = 1) {
    path([project(x1, y, z1), project(x2, y, z1), project(x2, y, z2), project(x1, y, z2)]);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
  }
  function lineWorld(a, b, color, weight = 1) { const p = project(...a), q = project(...b); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = color; ctx.lineWidth = weight; ctx.stroke(); }
  function circle(p, radius, fill, stroke, weight = 1) { ctx.beginPath(); ctx.arc(p.x, p.y, radius, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = weight; ctx.stroke(); } }
  function text(value, x, y, color, size = 10, align = 'center', weight = 500) { ctx.font = `${weight} ${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y); }
  function floor() {
    const bg = ctx.createLinearGradient(0, 0, width, height); bg.addColorStop(0, '#091c24'); bg.addColorStop(.55, '#102f31'); bg.addColorStop(1, '#061a22'); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
    const light = ctx.createRadialGradient(width / 2, height * .36, 0, width / 2, height * .42, width * .65); light.addColorStop(0, '#79d4aa18'); light.addColorStop(1, '#05131c00'); ctx.fillStyle = light; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.setLineDash([3, 11]);
    for (let x = -3; x <= 3; x += .5) lineWorld([x, -.2, -3], [x, -.2, 3], '#c5e1ce05');
    for (let z = -3; z <= 3; z += .5) lineWorld([-3, -.2, z], [3, -.2, z], '#c5e1ce05'); ctx.restore();
    rectWorld(-1.55, -2.35, 1.55, 2.35, -.10, null, '#99bea517');
    const stripe = width < 500 ? 4 : 7;
    ctx.fillStyle = '#a7e6c811'; ctx.fillRect(15, height * .30, stripe, height * .25); ctx.fillStyle = '#f58b7011'; ctx.fillRect(width - 15 - stripe, height * .45, stripe, height * .25);
  }
  function table(options) {
    ctx.save(); ctx.shadowColor = '#000d'; ctx.shadowBlur = scale * .22; ctx.shadowOffsetY = scale * .20;
    rectWorld(-TABLE.halfWidth, -TABLE.halfLength, TABLE.halfWidth, TABLE.halfLength, TABLE.height - .11, '#071718'); ctx.restore();
    for (const x of [-.56, .56]) for (const z of [-.85, .85]) {
      const top = project(x, TABLE.height - .05, z), foot = project(x, .28, z + .08);
      ctx.beginPath(); ctx.moveTo(top.x, top.y); ctx.lineTo(foot.x, foot.y); ctx.strokeStyle = '#071d22'; ctx.lineWidth = 6; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(top.x + 1, top.y); ctx.lineTo(foot.x + 1, foot.y); ctx.strokeStyle = '#244244'; ctx.lineWidth = 1; ctx.stroke();
    }
    const sideFace = [project(TABLE.halfWidth, TABLE.height, -TABLE.halfLength), project(TABLE.halfWidth, TABLE.height, TABLE.halfLength), project(TABLE.halfWidth, TABLE.height - .07, TABLE.halfLength), project(TABLE.halfWidth, TABLE.height - .07, -TABLE.halfLength)];
    path(sideFace); ctx.fillStyle = '#123438'; ctx.fill();
    const front = [project(-TABLE.halfWidth, TABLE.height, TABLE.halfLength), project(TABLE.halfWidth, TABLE.height, TABLE.halfLength), project(TABLE.halfWidth, TABLE.height - .07, TABLE.halfLength), project(-TABLE.halfWidth, TABLE.height - .07, TABLE.halfLength)];
    path(front); ctx.fillStyle = '#103135'; ctx.fill();
    const top = ctx.createLinearGradient(0, height * .12, 0, height * .8); top.addColorStop(0, '#1d5c51'); top.addColorStop(.52, '#1b524a'); top.addColorStop(1, '#17433e');
    rectWorld(-TABLE.halfWidth, -TABLE.halfLength, TABLE.halfWidth, TABLE.halfLength, TABLE.height, top, '#e4eed7cb', 2);
    const depth = options.depth === 'short' ? .55 : 1.03, aimX = (options.aim ?? 0) * .59;
    if (options.started && !options.demo) {
      rectWorld(aimX - .13, -depth - .13, aimX + .13, -depth + .13, TABLE.height + .002, '#f6a18514', '#f6a18577');
      const target = project(aimX, TABLE.height, -depth);
      circle(target, 5, '#ffb39729', '#ffb397a0');
      text(options.language === 'en' ? 'TARGET' : '落點', target.x, target.y - 14, '#edb9a580', 8, 'center', 700);
    }
    if (options.mission === 'short') rectWorld(-.70, -.70, .70, -.35, TABLE.height + .002, '#a7e6c817', '#a7e6c84a');
    if (options.mission === 'switch') {
      rectWorld(-.70, -1.23, -.22, -.36, TABLE.height + .002, '#a7e6c810'); rectWorld(.22, -1.23, .70, -.36, TABLE.height + .002, '#a7e6c810');
    }
    lineWorld([0, TABLE.height + .004, -1.37], [0, TABLE.height + .004, 1.37], '#ecf2db70', 1);
    const near = project(0, TABLE.height, .85), far = project(0, TABLE.height, -.85);
    text('RALLY', near.x, near.y + 19, '#d8eadb0a', Math.max(19, scale * .2), 'center', 800);
    text('CENTRE COURT', far.x, far.y, '#d8eadb23', Math.max(7, scale * .048), 'center', 700);
  }
  function net() {
    for (let i = 0; i <= 14; i++) { const x = -.82 + i * 1.64 / 14; lineWorld([x, TABLE.height, 0], [x, TABLE.height + TABLE.net, 0], '#d4e3cd30', .7); }
    for (let i = 0; i <= 3; i++) lineWorld([-.82, TABLE.height + i * TABLE.net / 3, 0], [.82, TABLE.height + i * TABLE.net / 3, 0], '#d4e3cd3d', .7);
    lineWorld([-.85, TABLE.height + TABLE.net, 0], [.85, TABLE.height + TABLE.net, 0], '#f8f3d9cb', 2);
    for (const x of [-.85, .85]) lineWorld([x, TABLE.height - .03, 0], [x, TABLE.height + TABLE.net + .015, 0], '#b3c7b2', 3);
  }
  function paddle(match, side, options) {
    const color = side === 1 ? CORAL : MINT, x = side === 1 ? match.playerX : match.opponentX;
    const stance = match.stance(side), swing = swings.get(side), live = swing && now - swing.at < .42 && !swing.serve;
    const age = live ? now - swing.at : 1, movement = live ? Math.sin(Math.min(age / .4, 1) * Math.PI) : 0;
    const z = side * Math.min(stance.rootZ - .20, 1.86), marker = project(x, TABLE.height, z);
    ctx.save(); ctx.globalAlpha = .8; circle(marker, 20 * marker.scale, '#092529', `${color}66`, 1); circle(marker, 27 * marker.scale, null, `${color}16`); ctx.restore();
    const point = live ? project(swing.x, swing.y, swing.z) : project(x, .91, z - side * .13);
    ctx.save(); ctx.translate(point.x, point.y); const hand = side === 1 ? match.playerHand : match.opponentHand;
    ctx.rotate(side * ((hand === 'left' ? -.45 : .45) + movement * .7));
    ctx.fillStyle = '#947356'; ctx.beginPath(); ctx.roundRect(-3.1, 8, 6.2, 18, 2); ctx.fill();
    ctx.shadowColor = `${color}77`; ctx.shadowBlur = live ? 15 : 0; ctx.fillStyle = '#d7b894'; ctx.beginPath(); ctx.ellipse(0, 0, 14, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = color; ctx.beginPath(); ctx.ellipse(0, -1, 12.5, 15.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = '#ffffff38'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(-1, -1, 8, 11, 0, .8, 3.8); ctx.stroke(); ctx.restore();
    const profile = side === 1 ? match.playerProfile : match.opponentProfile;
    const name = profile === 'harimoto' ? 'HARIMOTO' : 'LIN';
    if (width >= 500) text(`${name} / ${hand === 'left' ? 'L' : 'R'}`, marker.x + 37 * marker.scale, marker.y + 3, `${color}b0`, 9, 'left', 700);
  }
  function ballShape(ball) {
    if (!ball) return;
    const p = project(ball.x, ball.y, ball.z), floorHeight = Math.abs(ball.x) <= TABLE.halfWidth && Math.abs(ball.z) <= TABLE.halfLength ? TABLE.height : .17;
    const shadow = project(ball.x, floorHeight, ball.z), elevation = Math.max(0, ball.y - floorHeight);
    ctx.save(); ctx.globalAlpha = Math.max(.12, .48 - elevation * .19); ctx.fillStyle = '#001313'; ctx.beginPath(); ctx.ellipse(shadow.x + 2, shadow.y + 3, (6 + elevation * 3) * p.scale, 3.0 * p.scale, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    const radius = Math.max(4.1, scale * TABLE.radius * 1.14) * p.scale;
    ctx.save(); ctx.shadowColor = '#fbf5d566'; ctx.shadowBlur = 13;
    const light = ctx.createRadialGradient(p.x - radius * .3, p.y - radius * .4, 0, p.x, p.y, radius); light.addColorStop(0, '#fffef0'); light.addColorStop(.65, CREAM); light.addColorStop(1, '#c9cbb1'); circle(p, radius, light); ctx.restore();
    circle({ x: p.x - radius * .3, y: p.y - radius * .35 }, radius * .15, '#ffffffaa');
  }
  function drawTrail() {
    if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i], p = project(a.x, a.y, a.z), q = project(b.x, b.y, b.z), life = clamp(1 - (now - b.at) / .22, 0, 1);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.strokeStyle = `rgba(${b.hitter === 1 ? '245,139,112' : '167,230,200'},${life * .28})`; ctx.lineWidth = 2.7 * life; ctx.stroke();
    }
  }
  function drawEffects() {
    effects = effects.filter(e => now - e.at < .65);
    for (const e of effects) {
      const age = (now - e.at) / .65, p = project(e.x, e.y ?? TABLE.height, e.z);
      ctx.save(); ctx.globalAlpha = (1 - age) * .7;
      if (e.type === 'bounce') { ctx.beginPath(); ctx.ellipse(p.x, p.y, 6 + age * 22, 3 + age * 11, 0, 0, Math.PI * 2); ctx.strokeStyle = e.side === 1 ? CORAL : MINT; ctx.lineWidth = 1.2; ctx.stroke(); }
      else { circle(p, 8 + age * 25, null, e.side === 1 ? CORAL : MINT, 1.5); for (let j = 0; j < 5; j++) { const angle = j * Math.PI * 2 / 5; circle({ x: p.x + Math.cos(angle) * age * 27, y: p.y + Math.sin(angle) * age * 27 }, 1.3, CREAM); } } ctx.restore();
    }
  }
  function serveBall(match) {
    if (!match.pendingServe) return null;
    const prep = match.pendingServe, p = clamp((match.clock - prep.startedAt) / .48, 0, 1);
    return { ...prep.target, y: prep.target.y + Math.sin(p * Math.PI) * .28 };
  }
  return {
    project, get dimensions() { return { width, height, scale }; },
    aimTarget(clientX, depth = 'long') { const rect = canvas.getBoundingClientRect(); const z = depth === 'short' ? -.55 : -1.03; return clamp((clientX - rect.left - width / 2) / (scale * (1 + z * .11) * .59), -1, 1); },
    reset() { trail = []; effects = []; latestBall = null; swings.clear(); },
    event(e, time) { if (e.type === 'swing') swings.set(e.side, { ...e, at: time }); if (e.type === 'hit' || e.type === 'bounce') effects.push({ ...e, side: e.type === 'bounce' ? e.hitter : e.side, at: time }); if (['point', 'over', 'feed', 'serve'].includes(e.type)) { trail = []; latestBall = null; } },
    render(match, time, options = {}) {
      resize(); now = time;
      if (match.ball && !options.paused && options.started && (latestBall !== match.ball || trail.at(-1)?.at < time - .014)) { latestBall = match.ball; trail.push({ x: match.ball.x, y: match.ball.y, z: match.ball.z, hitter: match.ball.hitter, at: time }); }
      trail = trail.filter(p => time - p.at < .22); floor(); table(options); drawTrail();
      const ball = match.ball ?? serveBall(match);
      if (ball?.z < 0) ballShape(ball); net(); drawEffects();
      paddle(match, -1, options); paddle(match, 1, options);
      if (ball?.z >= 0) ballShape(ball);
      const contact = options.contact;
      if (contact?.legal && contact.time < .48 && !match.playerSwing) {
        const p = project(contact.x, contact.y, contact.z), ready = options.ready;
        ctx.save(); ctx.setLineDash([3, 5]); circle(p, 17 + Math.max(0, contact.time) * 17, null, ready ? '#bdf8dabe' : '#d3ead333'); ctx.restore();
        if (ready) { circle(p, 3, MINT); }
      }
    },
  };
}
