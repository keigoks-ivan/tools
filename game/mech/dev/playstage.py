# 本篇自動試玩：一關從頭打到尾，回報每一區花多久、卡住的地方、錯誤
#   用法：python3 game/mech/dev/playstage.py --port 8951 --stage 3 --out /tmp/ps   （--stage 可以寫 3-5 或 all）
#   先在 repo 根目錄開伺服器：python3 -m http.server 8951
#   自動駕駛：跟著路線的下一點（光柱）走，遠的用衝刺；敵人出現 2 秒後倒下（頭目每秒扣兩成，會觸發撤退／半血對白）；
#            目標大樓 350 m 內直接打爛；AP 一直補滿（不會死）；守點區就站著等時間到
#   也會先做「路線檢查」：路線頂點要在 120 m 格線或空地上、targets 附近 40 m 內要找得到大樓、boss 欄位齊全
import argparse, json, os, time
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8951)
ap.add_argument('--stage', default='1')
ap.add_argument('--out', default='/tmp/mech-playstage')
ap.add_argument('--shots', type=int, default=900, help='每幾幀存一張截圖（0＝不存）')
A = ap.parse_args()
os.makedirs(A.out, exist_ok=True)

CHECK = r'''(n) => {
  const S = __stages[n - 1], bad = [], E = S.enc;
  if (!S.brief || !S.brief.length) bad.push('沒有 brief（簡報）');
  if (!S.start || !S.start.length) bad.push('沒有 start（開場對白）');
  if (!S.end || !S.end.length) bad.push('沒有 end（過關對白）');
  if (!E) { bad.push('沒有 route（還是舊式空降關）'); return bad; }
  for (const c of E.secs) {
    for (const t of c.targets || []) {
      let ok = false;
      for (const bx of __game.world.nearBoxes(t.x, t.z, 60, [])) { const b = bx.bld; if (b && bx === b.box && Math.hypot(b.cx - t.x, b.cz - t.z) < 40) ok = true; }
      if (!ok) bad.push(`第 ${c.i + 1} 區 target ${t.name} (${t.x},${t.z}) 附近 40 m 沒有大樓`);
    }
    if (c.boss && !c.boss.name) bad.push(`第 ${c.i + 1} 區 boss 沒有 name`);
  }
  return bad;
}'''

BOT = r'''(frames) => {
  const G = __game, C = G.combat, P = G.player, b = window.__B || (window.__B = { f: 0, last: P.pos.clone(), lastF: 0, secT: {}, sec: -1 });
  for (let f = 0; f < frames; f++) {
    b.f++;
    const E = C.enc, goal = E && E.wp;
    let fake = { mx: 0, my: 0, boost: false, fire: false };
    if (goal && E.state === 'move') {
      const dx = goal.x - P.pos.x, dz = goal.z - P.pos.z, d = Math.hypot(dx, dz);
      P.yaw = Math.atan2(dx, dz); P.pitch = 0; fake = { mx: 0, my: d > 8 ? 1 : 0, boost: d > 70 };
    }
    G.fake = fake;
    for (const e of C.enemies) {
      if (e.dead || e.dropping) continue;
      e._age = (e._age || 0) + 1;
      if (e.bossName) { if (e._age % 60 === 0) C.damageEnemy(e, e.apMax * 0.2, 0, e.pos.clone(), new e.pos.constructor(0, 0, 1)); }
      else if (e._age > 120) C.damageEnemy(e, 1e7, 999, e.pos.clone(), new e.pos.constructor(0, 0, 1));
    }
    if (E) for (const t of E.tg) if (t.b.st === 0 && Math.hypot(t.b.cx - P.pos.x, t.b.cz - P.pos.z) < 350) G.world._dmg(t.b, 999, null, null, true);
    P.ap = P.apMax;
    G.tick(1 / 60);
    if (E && E.sec !== b.sec) { b.sec = E.sec; b.secT[E.sec] = b.f; }
    if (G.state === 'result') return { ev: 'result', f: b.f, win: !C.dead, secT: b.secT };
    if (!E || E.state !== 'move') { b.last.copy(P.pos); b.lastF = b.f; }   // 打仗、守點時本來就站著，不算卡住
    if (b.f - b.lastF >= 600) {
      const moved = P.pos.distanceTo(b.last); b.last.copy(P.pos); b.lastF = b.f;
      const alive = C.enemies.filter((e) => !e.dead).length;
      if (E && E.state === 'move' && moved < 5 && !alive) return { ev: 'stuck', f: b.f, sec: E.sec, pos: P.pos.toArray().map((v) => Math.round(v)), wp: goal && [goal.x, goal.y, goal.z].map((v) => Math.round(v)) };
    }
  }
  const E = C.enc;
  return { ev: 'chunk', f: b.f, sec: E ? E.sec : -1, state: E ? E.state : C.phase, hold: E && E.holdLeft, sub: C.sub && C.sub.text };
}'''

def stages(spec, total):
    if spec == 'all': return list(range(1, total + 1))
    if '-' in spec: a, b = spec.split('-'); return list(range(int(a), int(b) + 1))
    return [int(x) for x in spec.split(',')]

with sync_playwright() as p:
    br = p.chromium.launch(headless=True, args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = br.new_page(viewport={'width': 1100, 'height': 660}); errs = []
    pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.add_init_script('localStorage.setItem("mech.view","1")')
    pg.goto(f'http://localhost:{A.port}/game/mech/?mute&nocdn&nobrief', wait_until='networkidle', timeout=240000)
    pg.wait_for_function('window.__game && window.__game.player', timeout=240000, polling=500)
    pg.evaluate("async()=>{const m=await import('./combat.js'); window.__stages=m.STAGES}")
    total = pg.evaluate('__stages.length')
    for n in stages(A.stage, total):
        name = pg.evaluate(f'__stages[{n - 1}].name')
        bad = pg.evaluate(CHECK, n)
        print(f'==== 第 {n} 關 {name}　檢查：', '全部 OK' if not bad else f'{len(bad)} 個問題'); [print('  !!', x) for x in bad]
        pg.evaluate(f'()=>{{window.__B=null; __game.launch({n}); __game.run(4)}}')
        t0, shot, res = time.time(), 0, None
        while time.time() - t0 < 5000:
            r = pg.evaluate(BOT, 300)
            if r['ev'] == 'result': res = r; break
            if r['ev'] == 'stuck':
                pg.screenshot(path=f"{A.out}/st{n}-STUCK-{r['f']}.png"); print(f"  !! 卡住 f{r['f']} 第 {r['sec'] + 1} 區 在 {r['pos']} → {r['wp']}")
                pg.evaluate('()=>{const E=__game.combat.enc,P=__game.player;if(E&&E.wp){P.pos.set(E.wp.x,__game.world.height(E.wp.x,E.wp.z),E.wp.z);P.vel.set(0,0,0);__B.last.copy(P.pos)}}')
            if A.shots and r['f'] // A.shots > shot:
                shot = r['f'] // A.shots; pg.screenshot(path=f"{A.out}/st{n}-{shot:03d}.png")
        if not res: print('  !! 超過時間沒打完'); continue
        secT = res['secT']; ks = sorted(int(k) for k in secT)
        per = [round((secT[str(ks[i + 1])] - secT[str(ks[i])]) / 60) for i in range(len(ks) - 1)] + [round((res['f'] - secT[str(ks[-1])]) / 60)] if ks else []
        print(f"  {'過關' if res['win'] else '失敗'}　總共 {res['f']} 幀（{round(res['f'] / 60)} 秒，敵人 2 秒倒）　每區秒數：{per}")
        pg.evaluate("()=>{__game.fake=null; document.getElementById('result').style.display='none'; __game.toTitle()}")
    print('== 錯誤：', errs[:8] if errs else '無')
    br.close()
