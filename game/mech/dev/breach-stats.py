# 破牆伏擊取點統計：每關每個含 breach 的區段抽樣 N 次，數大樓／岩壁／碉堡／掩體／衝入／側／空降各幾次
#   用法：python3 game/mech/dev/breach-stats.py --port 8981 --stage all --n 30
import argparse, collections
from playwright.sync_api import sync_playwright
ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8981)
ap.add_argument('--stage', default='all')
ap.add_argument('--n', type=int, default=30)
A = ap.parse_args()
JS = r'''([n, N]) => {
  const G = __game, out = [];
  G.launch(n); G.run(4); const C = G.combat;
  const enc = C.enc; if (!enc) return out;
  const E = enc.E, P = G.player;
  const pa = (s) => { let i = 1; while (i < E.pts.length - 1 && E.pts[i].s < s) i++; const a = E.pts[i-1], b = E.pts[i], L = b.s - a.s || 1, f = (s - a.s) / L; return { x: a.x + (b.x-a.x)*f, z: a.z + (b.z-a.z)*f, dx: (b.x-a.x)/L, dz: (b.z-a.z)/L }; };
  E.secs.forEach((c, si) => {
    const all = [c.pre, ...c.waves].flat();
    if (!all.some((o) => o.where === 'breach')) return;
    enc.sec = si; enc.prog = c.s - c.trig;
    const q = pa(Math.max(0, c.s - c.trig));
    const cnt = {};
    for (let k = 0; k < N; k++) {
      P.pos.set(q.x, G.world.height(q.x, q.z), q.z); P.yaw = Math.atan2(q.dx, q.dz);
      enc.used.clear();
      const at = enc.place({ kind: 'brawler', where: 'breach', k: 0 });
      cnt[at.how || 'bld?'] = (cnt[at.how || 'bld?'] || 0) + 1;
    }
    out.push({ sec: si + 1, cnt });
  });
  return out;
}'''
with sync_playwright() as p:
    br = p.chromium.launch(args=['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'])
    pg = br.new_page(viewport={'width': 800, 'height': 500}); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.add_init_script('localStorage.setItem("mech.view","1")')
    pg.goto(f'http://localhost:{A.port}/game/mech/?mute&nocdn&nobrief', wait_until='networkidle', timeout=240000)
    pg.wait_for_function('window.__game && window.__game.player', timeout=240000, polling=500)
    pg.evaluate("async()=>{const m=await import('./combat.js'); window.__stages=m.STAGES}")
    total = pg.evaluate('__stages.length')
    st = list(range(1, total + 1)) if A.stage == 'all' else [int(x) for x in A.stage.split(',')]
    tot = collections.Counter()
    for n in st:
        if not pg.evaluate(f'!!__stages[{n-1}].enc'): continue
        name = pg.evaluate(f'__stages[{n-1}].name')
        for r in pg.evaluate(JS, [n, A.n]):
            tot.update(r['cnt']); print(f"stage {n} {name} 區{r['sec']}: {dict(r['cnt'])}")
        pg.evaluate("()=>{__game.toTitle&&__game.toTitle()}")
    s = sum(tot.values()); print('TOTAL', dict(tot), f"drop% = {100*tot['drop']/max(1,s):.1f}")
    print('errors', errs[:5])
    br.close()
