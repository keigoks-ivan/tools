import * as THREE from 'three';

export const CODA_START = { x: 0, z: -66, yaw: 0 };
export const CODA_STOPS = [
  { step: 'archive', x: 0, z: -30, height: 0, radius: 13, name: '查閱停火交接站', action: '讀取交接紀錄' },
  { step: 'relay', x: 0, z: 88, height: 31, radius: 18, name: '飛抵上空中繼天線', action: '接收待處理訊號' },
  { step: 'backup', x: 0, z: 160, height: 0, radius: 13, name: '降落到備援中繼台', action: '切換港務醫療線' },
];
export const CODA_BYPASS = [
  { ...CODA_STOPS[2], step: 'isolate', name: '降落到受損的備援中繼台', action: '拉開手動斷電扳桿' },
  { step: 'bypass', x: 0, z: 196, height: 0, radius: 12, name: '前往路邊維修箱', action: '接通港務醫療旁路' },
];

const cabinetOffset = (stop) => stop.step === 'bypass' ? -10 : 10;

export function codaStationPoint(stop, world) {
  const x = stop.x + cabinetOffset(stop), z = stop.z;
  return new THREE.Vector3(x, world.height(x, z) + (stop.height ? 24.5 : stop.step === 'bypass' ? 2.85 : 2.4), z);
}

export const CODA_ARCHIVE = [['交接站', '市區停火，港區列為已清空。登記待撤：零人。'], ['白鷺', '天線還收到兩組短訊號。飛上去聽一下。']];
export const CODA_SCENES = {
  intercept: { title: '訊號遭截', lines: [['米拉', '港務醫療線呼叫。兩輛醫療車，還有六十──'], ['聯邦指揮部', '回報封存。攔截隊，帶蒼焰回來。']] },
  boss: { title: '封港指揮機・夜鷺', lines: [['白鷺', '那是聯邦的識別碼……不是獵犬。'], ['夜鷺', '蒼焰，立即降落。港區沒有活人。']] },
  reveal: { title: '隼留下的線路', lines: [['米拉', '兩輛醫療車，六十四人。我一個個點過了。'], ['白鷺', '兩份命令的簽章一樣。攔截我們的人，也下令封港。']] },
};

export function codaApproach(stop, player, ground) {
  const p = player.pos, distance = Math.hypot(p.x - stop.x, p.z - stop.z);
  const near = distance <= stop.radius && (stop.height ? Math.abs(p.y - ground - stop.height) <= 10 : player.grounded && Math.abs(p.y - ground) <= 4);
  return { distance, near };
}

// 尾聲道具只建一次；維修箱和斷電扳桿沿用同一組幾何與材質。
export function codaStations(scene, world) {
  const root = new THREE.Group(), cube = new THREE.BoxGeometry(), lamp = new THREE.SphereGeometry(1, 8, 6);
  const frame = new THREE.MeshStandardMaterial({ color: 0x303f44, metalness: .68, roughness: .49 });
  const shell = new THREE.MeshStandardMaterial({ color: 0x6d7471, metalness: .4, roughness: .58 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x182226, metalness: .3, roughness: .7 });
  const glow = (color) => new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const amber = glow(0xff9c40), cold = glow(0x76eeff), dark = glow(0x9d3830);
  const ring = new THREE.RingGeometry(.94, 1, 44).rotateX(-Math.PI / 2);
  const marker = new THREE.MeshBasicMaterial({ color: 0x8ef3ff, transparent: true, opacity: .74, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const part = (group, mat, x, y, z, w, h, d, geo = cube) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(w, h, d); group.add(m); return m;
  };
  const stations = [...CODA_STOPS, CODA_BYPASS[1]].map((o) => {
    const g = new THREE.Group(), p = new THREE.Vector3(o.x, world.height(o.x, o.z), o.z);
    g.name = `harbor-coda-${o.step}`;
    g.position.copy(p); root.add(g);
    const x = cabinetOffset(o), baseY = world.height(o.x + x, o.z) - p.y;
    let housing, broken = null, antenna = null, disconnect = null, light;
    if (o.step === 'bypass') {
      part(g, frame, x, baseY + .18, 0, 4.2, .36, 2.9);
      housing = part(g, shell, x, baseY + 1.88, 0, 3.4, 3.08, 1.9);
      part(g, frame, x, baseY + 3.53, 0, 3.65, .22, 2.1);
      part(g, trim, x + 1.72, baseY + 2.25, 0, .14, 1.7, 1.52);
      part(g, amber, x + 1.82, baseY + 1.76, 0, .12, .17, 1.04);
      light = part(g, dark, x + 1.84, baseY + 2.85, 0, .2, .23, .36, lamp);
    } else {
      part(g, frame, x, baseY + .34, 0, 7.3, .68, 4.7);
      housing = part(g, shell, x, baseY + 2.4, 0, 6.1, 3.5, 3.4);
      part(g, frame, x, baseY + 4.23, 0, 6.5, .36, 3.8);
      part(g, trim, x - 3.1, baseY + 2.85, -.15, .14, 1.23, 2.5);
      part(g, frame, x - 3.2, baseY + 1.7, 1.05, .21, .16, .72);
      light = part(g, dark, x - 3.25, baseY + (o.height ? 24.5 : 3.08), 0, .3, .26, .43, lamp);
    }
    if (o.height) {
      for (const dx of [-1.6, 1.6]) part(g, frame, x + dx, baseY + 14, 0, .34, 20, .34);
      for (const y of [9, 15, 21, 23.5]) part(g, shell, x, baseY + y, 0, 3.6, .3, .33);
      part(g, trim, x, baseY + 24.5, 0, 3.9, 1.3, 2.1);
    } else if (o.step === 'backup') {
      antenna = new THREE.Group(); antenna.position.set(x + 1.6, baseY + 4.1, 0); g.add(antenna);
      part(antenna, frame, 0, 1, 0, .27, 2, .27);
      part(antenna, shell, 0, 2.1, 0, 2.2, .28, .24);
      broken = new THREE.Group(); g.add(broken);
      part(broken, frame, x - 3.1, baseY + 1.91, -.73, .25, 1.46, 1.2);
      part(broken, shell, x - 3.65, baseY + 1.9, -.35, .15, 1.45, .92).rotation.y = -.69;
      disconnect = part(broken, amber, x - 3.31, baseY + 1.85, -.87, .15, .68, .23);
    }
    const zone = part(g, marker, 0, o.height || .28, 0, o.radius * .65, 1, o.radius * .65, ring);
    zone.userData.noAO = true;
    return { g, housing, antenna, broken, disconnect, light, zone };
  });
  let index = -1, guide = false, damaged = false;
  function refresh() {
    const backup = stations[2];
    backup.housing.material = damaged ? trim : shell;
    backup.broken.visible = damaged;
    backup.antenna.rotation.z = damaged ? -.95 : 0;
    backup.disconnect.rotation.x = index > 2 ? .55 : -.55;
    stations[3].g.visible = damaged;
    stations.forEach(({ light, zone }, i) => {
      light.material = i === 2 && damaged ? dark : i === index ? amber : i < index && i !== 1 ? cold : dark;
      zone.visible = guide && i === index;
    });
  }
  refresh();
  root.visible = false; scene.add(root);
  return {
    hide() { root.visible = false; },
    show(step, withGuide = true) {
      index = step; guide = withGuide;
      root.visible = true; refresh();
    },
    setBackupDamaged(value) { damaged = !!value; refresh(); },
  };
}
