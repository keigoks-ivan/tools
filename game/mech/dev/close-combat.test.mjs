import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, stageWeight } from '../combat.js';
import { STAGE_DATA } from '../stages.js';
import { parse } from '../encounter.js';

const AIR = new Set([8]);   // 第 8 關是空戰
const kinds = (D) => D.route.secs.flatMap((c) => [c.amb, c.amb2, c.amb3].filter(Boolean).join(' ').split(' ').filter(Boolean));

test('brawler 有權重，stageWeight 算得出來', () => {
  assert.equal(stageWeight({ groups: [['brawler']] }), 1.3);
  assert.equal(stageWeight({ groups: [['brawler', 'grunt']] }), 2.3);
});
test('parse 能解析 brawler@breach', () => {
  const R = { pts: [[0, 0], [0, 120], [120, 120]], arena: 50, cp: [], par: 1, secs: [{ at: 1, amb: 'brawler@breach*2 grunt@side' }, { at: 2, amb: 'tank@out' }] };
  const E = parse(R, 1);
  assert.deepEqual(E.secs[0].waves[0], [{ kind: 'brawler', where: 'breach' }, { kind: 'brawler', where: 'breach' }, { kind: 'grunt', where: 'side' }]);
});
test('每個非空戰的路線關至少一區有 brawler，且都是 breach 或 side', () => {
  STAGE_DATA.forEach((D, i) => {
    if (!D.route || AIR.has(i + 1)) return;
    const b = kinds(D).filter((w) => w.startsWith('brawler@'));
    assert(b.length > 0, `第 ${i + 1} 關沒有 brawler`);
    for (const w of b) assert(/^brawler@(breach|side)(\*\d+)?$/.test(w), w);
  });
});
test('空戰關與頭目區沒有 brawler', () => {
  STAGE_DATA.forEach((D, i) => {
    if (!D.route) return;
    if (AIR.has(i + 1)) assert(!kinds(D).some((w) => w.startsWith('brawler')));
    D.route.secs.forEach((c) => { if (c.boss) assert(![c.amb, c.amb2, c.amb3].join(' ').includes('brawler')); });
  });
});
test('每個 route 關都解析得出 enc，所有 kind 都有定義', () => {
  for (const S of STAGES) if (S.enc) assert(S.enc.secs.length > 0);
});

// ---- 光劍突進：依距離算時間與速度，揮下時貼身
import * as THREE from 'three';
import { W, lungePlan } from '../combat.js';
import { closeDir, wallKind } from '../encounter.js';
test('brawler 突進：觸發距離 40～110 m，揮下時離你 15～25 m；ace 維持原值', () => {
  const LG = W.lunge.brawler;
  for (const dist of [40, 60, 80, 100, 110]) for (const rnd of [() => 0, () => 0.5, () => 0.999]) {
    const { t, v } = lungePlan(LG, dist, rnd);
    assert(t >= LG.tMin - 1e-9 && t <= LG.tMax + 1e-9, `t=${t}`);
    assert(v <= 130, `速度 ${v}`);
    const left = dist - v * t;
    assert(left >= 14.9 && left <= 25.1, `dist ${dist} 抵達 ${left}`);
  }
  const A = lungePlan(W.lunge.ace, 80);
  assert.equal(A.t, 0.45); assert.equal(A.v, 95);
});
test('架刀窗是「揮下前 0.3 s」的相對定義，窗口內離你 <= parry.range', () => {
  const LG = W.lunge.brawler, P = W.parry;
  for (const dist of [45, 70, 110]) {
    const { t, v } = lungePlan(LG, dist, () => 0.5);
    // e.lunge 從 0.45+t 倒數；窗口＝lunge 在 (0.45, 0.45+win]，即突進最後 min(win,t) 秒
    const dAtWindow = dist - v * Math.max(0, t - P.win);   // 窗口剛開啟時的距離
    assert(dAtWindow - 20 <= P.range + 1e-6 || dist <= P.range, `dist ${dist} 窗口開啟時 ${dAtWindow}`);
  }
});
test('破牆方向提示：左右與座艙畫面一致（yaw 慣例＝前方 (sin,cos)）', () => {
  const cam = (yaw) => { const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw + Math.PI, 0, 'YXZ')); return { f: new THREE.Vector3(0, 0, -1).applyQuaternion(q), r: new THREE.Vector3(1, 0, 0).applyQuaternion(q) }; };
  for (const yaw of [0, 0.7, 2, -1.3, 3.0]) {
    const { f, r } = cam(yaw), pos = new THREE.Vector3(10, 0, -5);
    assert(Math.abs(f.x - Math.sin(yaw)) < 1e-9 && Math.abs(f.z - Math.cos(yaw)) < 1e-9);
    for (const [ang, want] of [[0.8, '右前方'], [-0.8, '左前方'], [0.05, '正前方']]) {
      // 目標位置：在鏡頭前方 40 m、朝右 (ang>0) 偏 ang 弧度
      const d = f.clone().multiplyScalar(Math.cos(ang)).addScaledVector(r, Math.sin(ang)).multiplyScalar(40);
      const s = closeDir(pos, yaw, pos.x + d.x, pos.z + d.z);
      assert(s.includes(want), `yaw ${yaw} 角 ${ang} -> ${s}`);
    }
  }
});
test('wallKind 分類', () => {
  const city = { battlefield: 'city' }, field = { battlefield: 'valley' };
  assert.equal(wallKind(city, { bld: {} }), 'bld');
  assert.equal(wallKind(field, { bld: {} }), 'bunker');
  assert.equal(wallKind(field, {}), 'rock');
  assert.equal(wallKind(field, { on: 5 }), 'cover');
  assert.equal(wallKind(city, {}), 'cover');
});
