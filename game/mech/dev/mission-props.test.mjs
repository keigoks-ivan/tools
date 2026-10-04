import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { collectMissionItem, syncMissionProps } from '../zero/mission-props.mjs';
import { createFootOperation } from '../lastline/foot-ops.js';

const handle = () => ({ visible: true, installed: false, hide() { this.visible = false; }, reset() { this.visible = true; this.installed = false; }, install() { this.visible = true; this.installed = true; } });
test('拿取、固定設備安裝、同頁重玩與已完成章節的物件狀態', () => {
  const map = { items: { file: { h: handle() }, panel: { h: handle(), persistent: true } }, operationProps: { op: [handle(), handle()] } };
  const E = [{ id: 'documents', pickups: [{ id: 'file' }] }, { id: 'power', pickups: [{ id: 'panel' }] }];
  collectMissionItem(map.items.file); assert.equal(map.items.file.h.visible, false);
  collectMissionItem(map.items.panel); assert.equal(map.items.panel.h.visible, true); assert.equal(map.items.panel.h.installed, true);
  syncMissionProps(map, E, new Set(), new Set());
  assert.equal(map.items.file.h.visible, true); assert.equal(map.items.panel.h.installed, false);
  syncMissionProps(map, E, new Set(['documents', 'power', 'op']), new Set());
  assert.equal(map.items.file.h.visible, false); assert.equal(map.items.panel.h.installed, true);
  assert(map.operationProps.op.every(h => h.visible && h.installed));
  syncMissionProps(map, E, new Set(), new Set(['file']));
  assert.equal(map.items.file.h.visible, false); assert(map.operationProps.op.every(h => !h.installed));
});
test('實際 E 操作完成一站才切換設備，完成與dispose保留模型，重試可恢復', () => {
  const points = [[0, 0], [10, 0]].map(p => Object.assign(p, { label: '接通電源', seconds: .2 }));
  const E = { id: 'op', operation: { kind: 'console', points } }, props = [handle(), handle()];
  props[0].pin = new THREE.Vector3(0, 1, .8);
  const G = { player: { pos: new THREE.Vector3(), hurtT: 9 }, enemies: [], operationProps: { op: props }, hud: { pins: [], note() {} } };
  const input = { keys: new Set(['KeyE']) }, op = createFootOperation(E, G, input);
  op.update(.1); assert.equal(props[0].installed, false); assert.equal(G.hud.pins[0].p, props[0].pin);
  op.update(.1); assert.equal(props[0].installed, true); assert.equal(props[1].installed, false);
  G.player.pos.x = 10; op.update(.1); op.update(.1); assert(op.done); assert(props.every(h => h.installed));
  op.dispose(); assert(props.every(h => h.visible));
  createFootOperation(E, G, input); assert(props.every(h => !h.installed && h.visible));
});
