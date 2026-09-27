// 三人頁的隊友指示與快捷喊話（純 DOM，不動戰鬥程式）。
// - 隊友跑出畫面（或在鏡頭後面）時，畫面邊緣出現他代表色的箭頭與名字；倒地的隊友改成紅色閃爍「救我」。
// - 喊話：鍵盤 1／2／3 或畫面左側三顆按鈕，自己和隊友頭上冒出「救我！／這邊！／衝啊！」；人在畫面外時字掛在箭頭上。
import { cssColor } from '../3d-next/net/colors.js';
import { PINGS, PING_SHOW_MS } from '../3d-next/net/scores.js';

const HEAD = 2.05;          // 名牌上方一點（世界單位）
const EDGE_X = 0.9, EDGE_Y = 0.82;   // 箭頭貼邊的位置（NDC，留出 HUD 與搖桿的空間）

/** 世界座標 → 螢幕 NDC（-1..1）；在鏡頭後面時方向照樣正確，behind＝true */
export function projectPoint(camera, x, y, z) {
  const m = camera.matrixWorldInverse.elements, p = camera.projectionMatrix.elements;
  const vx = m[0] * x + m[4] * y + m[8] * z + m[12], vy = m[1] * x + m[5] * y + m[9] * z + m[13], vz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const cx = p[0] * vx + p[4] * vy + p[8] * vz + p[12], cy = p[1] * vx + p[5] * vy + p[9] * vz + p[13], cw = p[3] * vx + p[7] * vy + p[11] * vz + p[15];
  const w = Math.abs(cw) || 1e-6;
  return { x: cx / w, y: cy / w, behind: cw <= 0 };
}

/** NDC 點 → 貼在畫面邊框上的位置與角度；在畫面內且不在背後時回 null */
export function edgePoint(ndc, edgeX = EDGE_X, edgeY = EDGE_Y) {
  let { x, y } = ndc;
  if (!ndc.behind && Math.abs(x) <= edgeX && Math.abs(y) <= edgeY) return null;
  if (ndc.behind && Math.hypot(x, y) < 1e-3) y = -1;   // 正後方：指向下方
  const k = Math.max(Math.abs(x) / edgeX, Math.abs(y) / edgeY);
  x /= k; y /= k;
  return { x, y, angle: Math.atan2(-y, x) };
}

export function setupTeamOverlay({ coop, client, getCamera, canvas, doc = document }) {
  const layer = doc.createElement('div');
  layer.id = 'teamOverlay';
  layer.className = 'team-overlay';
  layer.setAttribute('aria-hidden', 'true');
  doc.body.appendChild(layer);

  // 喊話按鈕（手機用；桌機也看得到，旁邊標 1 2 3）
  const pad = doc.createElement('div');
  pad.id = 'pingPad';
  pad.className = 'ping-pad';
  pad.hidden = true;
  pad.innerHTML = Object.entries(PINGS).map(([kind, text]) => `<button type="button" data-ping="${kind}" aria-label="喊話：${text}"><kbd>${kind}</kbd>${text.replace('！', '')}</button>`).join('');
  doc.body.appendChild(pad);
  const press = kind => { if (coop.ping(kind)) navigator.vibrate?.(12); };
  pad.addEventListener('pointerdown', event => {
    const button = event.target.closest?.('[data-ping]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    press(+button.dataset.ping);
  });
  const onKey = event => {
    if (event.repeat || event.target.closest?.('input, textarea') || doc.body.dataset.mode !== 'play') return;
    const kind = { Digit1: 1, Digit2: 2, Digit3: 3, Numpad1: 1, Numpad2: 2, Numpad3: 3 }[event.code];
    if (kind) press(kind);
  };
  globalThis.addEventListener?.('keydown', onKey);

  const pings = new Map();   // id → { kind, until }
  const offPing = coop.onPing(({ id, kind, at }) => pings.set(id, { kind, until: at + PING_SHOW_MS }));

  const nodes = new Map();   // id → { arrow, bubble }
  function nodeFor(id) {
    let node = nodes.get(id);
    if (!node) {
      const arrow = doc.createElement('div');
      arrow.className = 'tm-arrow';
      arrow.innerHTML = '<i class="tm-tip"></i><span class="tm-label"></span>';
      const bubble = doc.createElement('div');
      bubble.className = 'tm-bubble';
      layer.append(arrow, bubble);
      node = { arrow, bubble, tip: arrow.firstChild, label: arrow.lastChild, text: '', shown: '' };
      nodes.set(id, node);
    }
    return node;
  }
  const hide = el => { if (el.style.display !== 'none') el.style.display = 'none'; };
  const show = el => { if (el.style.display !== 'block') el.style.display = 'block'; };

  let raf = 0;
  function frame() {
    raf = requestAnimationFrame(frame);
    const camera = getCamera?.();
    const playing = doc.body.dataset.mode === 'play' && !!client.room && !!camera;
    pad.hidden = !playing;
    layer.hidden = !playing;
    if (!playing) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    Object.assign(layer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    const t = performance.now();
    const ids = new Set(coop.playerIds());
    for (const [id, node] of nodes) if (!ids.has(id)) { node.arrow.remove(); node.bubble.remove(); nodes.delete(id); }
    for (const id of ids) {
      const node = nodeFor(id);
      const pos = coop.positionOf(id);
      const ping = pings.get(id);
      const pingText = ping && t < ping.until ? PINGS[ping.kind] : '';
      if (ping && !pingText) pings.delete(id);
      if (!pos) { hide(node.arrow); hide(node.bubble); continue; }
      const color = cssColor(coop.colorOf(id));
      const mine = id === client.you;
      const downed = coop.isDowned(id);
      const head = projectPoint(camera, pos.x, pos.y + HEAD, pos.z);
      const edge = mine ? null : edgePoint(head);
      const toPx = (x, y) => [(x * 0.5 + 0.5) * rect.width, (-y * 0.5 + 0.5) * rect.height];

      // 畫面外的隊友：邊緣箭頭（喊話時字掛在箭頭上）
      if (edge) {
        const [px, py] = toPx(edge.x, edge.y);
        const name = client.members.get(id)?.name || '隊友';
        const text = pingText ? `${name}：${pingText}` : downed ? `${name} 倒地` : name;
        if (node.text !== text) { node.label.textContent = text; node.text = text; }
        node.arrow.style.setProperty('--c', color);
        node.arrow.classList.toggle('down', downed);
        node.arrow.classList.toggle('pinged', !!pingText);
        node.arrow.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        node.tip.style.transform = `rotate(${edge.angle.toFixed(3)}rad)`;
        show(node.arrow);
      } else hide(node.arrow);

      // 畫面內：頭上的喊話泡泡
      if (pingText && !edge && !head.behind) {
        const [px, py] = toPx(head.x, head.y);
        if (node.shown !== pingText) { node.bubble.textContent = pingText; node.shown = pingText; node.bubble.classList.remove('pop'); void node.bubble.offsetWidth; node.bubble.classList.add('pop'); }
        node.bubble.style.setProperty('--c', color);
        node.bubble.style.transform = `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`;
        show(node.bubble);
      } else { hide(node.bubble); node.shown = ''; }
    }
  }
  raf = requestAnimationFrame(frame);

  return {
    dispose() {
      cancelAnimationFrame(raf);
      offPing?.();
      globalThis.removeEventListener?.('keydown', onKey);
      layer.remove(); pad.remove();
    },
  };
}
