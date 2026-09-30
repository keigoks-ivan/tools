# 前傳自動試玩：跟著畫面上的指示走（光柱路線／任務標記），敵人出現 1.5 秒後自動倒下，任務目標走近就炸掉，看到「按 E」就按
#   用法：python3 game/mech/zero/dev/playtest.py --port 8951 --ch 1 --to 5 --out /tmp/pt
#   先在 repo 根目錄開伺服器：python3 -m http.server 8951
#   另外會先做一次「指示檢查」：每一段的導引終點要落在觸發範圍裡、路線點不能卡在牆裡
#   輸出：每一章花了幾幀（60 幀＝1 秒，敵人秒倒，所以是「走路＋任務」的下限）、卡住／沒指示的地方（附截圖）、錯誤
import argparse, json, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8951)
ap.add_argument('--ch', type=int, default=1)
ap.add_argument('--to', type=int, default=5)
ap.add_argument('--out', default='/tmp/zero-playtest')
ap.add_argument('--shots', type=int, default=600, help='每幾幀存一張截圖（0＝不存）')
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)

CTL = '''window.__raf=[];window.requestAnimationFrame=(fn)=>{__raf.push(fn);return __raf.length};window.cancelAnimationFrame=()=>{};window.__step=(n=1)=>{for(let i=0;i<n;i++){const q=__raf.splice(0);for(const f of q)f(performance.now());}};'''

CHECK = r'''() => {
  const S = __S, bad = [];
  for (const E of S.ENCOUNTERS) {
    if (E.trigger && !E.after && E.guide) {
      const [x, z, y = 0] = E.guide;
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, p = { x: x + Math.cos(a) * 0.8, z: z + Math.sin(a) * 0.8, y }; if (!E.trigger(p)) { bad.push(`${E.id}: guide ${x},${z} 不在觸發範圍裡`); break; } }
    }
    for (const key of ['route', 'nextRoute']) for (const w of E[key] || []) {
      const y = w[2] ?? 0, q = new T.Vector3(w[0], y, w[1]);
      if (__solid.pushOut(q, 0.3, y, y + 1.7, 0.45) && Math.hypot(q.x - w[0], q.z - w[1]) > 1.2) bad.push(`${E.id}: ${key} 點 ${w} 在東西裡面`);
    }
    for (const id of E.targets || []) if (!__map.targets[id]) bad.push(`${E.id}: target ${id} 地圖上沒有`);
    for (const P of E.pickups || []) if (!__map.items[P.id]) bad.push(`${E.id}: item ${P.id} 地圖上沒有`);
  }
  for (const C of S.CHAPTERS) {
    if (!C.end) continue;
    const E = S.ENCOUNTERS.find((e) => e.id === C.end.after); if (!E) { bad.push(`第 ${C.n} 章 end.after=${C.end.after} 找不到`); continue; }
    const m = E.mark; if (!m) continue;
    for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; if (!C.end.at({ x: m.x + Math.cos(a) * 0.8, z: m.z + Math.sin(a) * 0.8, y: 0 })) { bad.push(`第 ${C.n} 章結尾 mark 不在 end.at 裡`); break; } }
  }
  return bad;
}'''

BOT = r'''(frames) => {
  const G = __G, P = G.player;
  const b = window.__B || (window.__B = { f: 0, last: P.pos.clone(), lastF: 0, idle: 0, shotF: 0, hist: [] });
  for (let f = 0; f < frames; f++) {
    b.f++;
    const alive = G.enemies.filter((e) => !e.dead);
    // 要去哪：光柱路線的下一點；打仗中沒有路線時，去最近的任務標記（要炸的、要撿的）
    let goal = G.hud.obj && G.hud.obj.p ? G.hud.obj.p : null, pin = null;
    if (!goal && G.hud.pins.length) { pin = G.hud.pins.slice().sort((a, c) => a.p.distanceTo(P.pos) - c.p.distanceTo(P.pos))[0]; goal = pin.p; }
    // 換了新的目標點：重新計算「有沒有在動」（不然剛出現的指示會被當成卡住）
    const gk = goal ? goal.x.toFixed(1) + ',' + goal.z.toFixed(1) : '';
    if (gk !== b.gk) { b.gk = gk; b.last.copy(P.pos); b.lastF = b.f; }
    let c = {};
    if (goal) {
      const dx = goal.x - P.pos.x, dz = goal.z - P.pos.z;
      P.yaw = Math.atan2(dx, dz); P.pitch = -0.05; c = { my: Math.hypot(dx, dz) > 0.6 ? 1 : 0, sprint: true };
      b.hist.push(P.pos.clone()); if (b.hist.length > 30) b.hist.shift();
      if (b.side > 0) { b.side--; c = { my: 0.3, mx: b.dir, sprint: false }; }
      else if (b.hist.length === 30 && b.hist[0].distanceTo(P.pos) < 0.25 && Math.hypot(dx, dz) > 1.5) { b.dir = -(b.dir || -1); b.side = 45; b.hist.length = 0; }
      // 任務目標：走到 6 m 內就當作開槍炸掉
      if (pin) for (const T of Object.values(__map.targets)) if (T.obj && T.obj.alive && T.obj.pos.distanceTo(P.pos) < 6) G.destruct.hit(T.obj, 1e4, T.obj.pos.clone(), new window.T.Vector3(0, 0, 1));
    }
    window.__botCtl = c;
    for (const e of alive) { e._age = (e._age || 0) + 1; if (e._age > 90) e.damage(1e5, new window.T.Vector3(0, 0, 1), 'head', null); }
    __step(1);
    if (window.__m6) return { ev: 'mech', f: b.f };
    if (G.hud.prompt) return { ev: 'prompt', text: G.hud.prompt, f: b.f, ch: __flow.chapter };
    if (b.f - b.shotF >= (window.__SHOTS || 1e9)) { b.shotF = b.f; return { ev: 'shot', f: b.f, ch: __flow.chapter, obj: G.objText, sub: G.objSub, pos: P.pos.toArray().map((v) => +v.toFixed(1)) }; }
    if (b.f - b.lastF >= 180) {
      const moved = P.pos.distanceTo(b.last); b.last.copy(P.pos); b.lastF = b.f;
      const tgt = goal ? Math.hypot(goal.x - P.pos.x, goal.z - P.pos.z) : null;
      const info = { f: b.f, ch: __flow.chapter, obj: G.objText, sub: G.objSub, pos: P.pos.toArray().map((v) => +v.toFixed(1)), active: __flow.active };
      if (goal && moved < 0.6 && tgt > 1.5 && !alive.length) return { ev: 'stuck', tgt: goal.toArray().map((v) => +v.toFixed(1)), ...info };
      // 守點計時中、敵人還沒到：本來就沒有指示，不算
      if (!goal && !alive.length && !__flow.active.length) { b.idle++; if (b.idle >= 4) return { ev: 'noguide', ...info }; } else b.idle = 0;
      if (goal && tgt <= 1.5 && !alive.length) { b.wait = (b.wait || 0) + 1; if (b.wait >= 4) return { ev: 'arrived-nothing', ...info }; } else b.wait = 0;
    }
  }
  return { ev: 'chunk', f: b.f, ch: __flow.chapter };
}'''

with sync_playwright() as p:
    br = p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = br.new_page(viewport={'width': 1100, 'height': 660}); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.add_init_script(CTL)
    pg.goto(f'http://localhost:{A.port}/game/mech/zero/?ch={A.ch}&god&mute&nocdn', wait_until='networkidle', timeout=240000)
    pg.wait_for_function('window.__G?.playing', timeout=240000, polling=500)
    pg.evaluate("async()=>{const T=await import('three');window.T=T;T.Clock.prototype.getDelta=()=>1/60;__step(30)}")
    if A.shots: pg.evaluate(f'window.__SHOTS={A.shots}')
    bad = pg.evaluate(CHECK)
    print('== 指示檢查：', '全部 OK' if not bad else f'{len(bad)} 個問題'); [print('  !!', x) for x in bad]
    log, chF, lastCh, lastF, t0, n = [], {}, A.ch, 0, time.time(), 0
    while time.time() - t0 < 3000:
        try: r = pg.evaluate(BOT, 600)
        except Exception as e:
            if 'navigat' in str(e).lower() or 'context' in str(e).lower(): log.append('（頁面跳走了）'); break
            raise
        ch = r.get('ch', lastCh)
        if ch != lastCh: chF[lastCh] = r['f'] - lastF; lastF = r['f']; log.append(f'-- 第 {lastCh} 章結束（{chF[lastCh]} 幀）→ 第 {ch} 章'); lastCh = ch
        if ch and ch > A.to: break
        ev = r['ev']
        if ev == 'mech': chF[lastCh] = r['f'] - lastF; log.append('-- 進第 6 章（機體）'); break
        if ev == 'prompt':
            log.append(f"f{r['f']} 按 E：{r['text']}"); pg.keyboard.press('e'); pg.evaluate('__step(2)')
            if '駕駛艙' in r['text']:
                pg.evaluate('__step(30)'); chF[lastCh] = r['f'] - lastF; log.append('-- 進駕駛艙'); break
        elif ev == 'shot':
            n += 1; pg.screenshot(path=f"{A.out}/s{n:03d}-ch{r['ch']}.png"); log.append(f"f{r['f']} 截圖 s{n:03d} 第{r['ch']}章 {r['obj']}｜{r['sub']} {r['pos']}")
        elif ev == 'stuck':
            pg.screenshot(path=f"{A.out}/STUCK-{r['f']}.png"); log.append(f"!! 卡住 f{r['f']} 第{r['ch']}章 {r['obj']} 在 {r['pos']} → {r['tgt']}")
            pg.evaluate('()=>{const P=__G.player,o=__G.hud.obj||(__G.hud.pins[0]&&{p:__G.hud.pins[0].p});if(o){P.pos.set(o.p.x,Math.max(0,o.p.y-1.2),o.p.z);P.vel.set(0,0,0);__B.last.copy(P.pos)}}')
        elif ev == 'noguide':
            pg.screenshot(path=f"{A.out}/NOGUIDE-{r['f']}.png"); log.append(f"?? 沒有指示 f{r['f']} 第{r['ch']}章 「{r['obj']}」{r['sub']} 在 {r['pos']} active={r['active']}")
            pg.evaluate('()=>{__B.idle=0}'); pg.evaluate('__step(600)')
        elif ev == 'arrived-nothing':
            log.append(f"?? 到了但沒反應 f{r['f']} 第{r['ch']}章 「{r['obj']}」{r['sub']} 在 {r['pos']} active={r['active']}")
            pg.evaluate('()=>{__B.wait=0}'); pg.evaluate('__step(300)')
    print('\n'.join(log))
    print('== 每章幀數（60 幀＝1 秒，敵人秒倒）：', json.dumps(chF))
    print('== 錯誤：', errs[:8] if errs else '無')
    br.close()
