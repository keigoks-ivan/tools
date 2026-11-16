import * as THREE from 'three';

export const CODA_START = { x: 0, z: -66, yaw: 0 };
export const CODA_STOPS = [
  { step: 'archive', x: 0, z: -30, height: 0, radius: 13, name: '查閱停火交接站', action: '讀取交接紀錄' },
  { step: 'relay', x: 0, z: 88, height: 31, radius: 18, name: '飛抵上空中繼天線', action: '接收待處理訊號' },
  { step: 'backup', x: 0, z: 160, height: 0, radius: 13, name: '降落到備援中繼台', action: '切換港務醫療線' },
];

export const CODA_LINES = [
  [['交接站', '市區停火，港區列為已清空。登記待撤：零人。'], ['白鷺', '等等，天線還收到兩組短訊號。飛上去聽一下。']],
  [['米拉', '這裡是港務醫療線！兩台車都還在，六十……'], ['聯邦指揮部', '頻道已封存。蒼焰請返回，準備接收回收指令。'], ['白鷺', '指揮部切斷了上行。前面有備援台，我們改走隼留下的醫療線。']],
  [['米拉', '……聽得到嗎？兩輛醫療車，六十四人。我一個個點過了。'], ['白鷺', '封港命令是我們這邊簽的。米拉，車先別動。'], ['零號', '六十四。我聽到了。等我。']],
];

export function codaApproach(stop, player, ground) {
  const p = player.pos, distance = Math.hypot(p.x - stop.x, p.z - stop.z);
  const near = distance <= stop.radius && (stop.height ? Math.abs(p.y - ground - stop.height) <= 10 : player.grounded && Math.abs(p.y - ground) <= 4);
  return { distance, near };
}

// 僅在尾聲首次啟用時建立。兩座地面設備與一支天線共用幾何與材質。
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
  const stations = CODA_STOPS.map((o) => {
    const g = new THREE.Group(), p = new THREE.Vector3(o.x, world.height(o.x, o.z), o.z);
    g.position.copy(p); root.add(g);
    const x = 10, baseY = world.height(o.x + x, o.z) - p.y;
    part(g, frame, x, baseY + .34, 0, 7.3, .68, 4.7);
    part(g, shell, x, baseY + 2.4, 0, 6.1, 3.5, 3.4);
    part(g, frame, x, baseY + 4.23, 0, 6.5, .36, 3.8);
    part(g, trim, x - 3.1, baseY + 2.85, -.15, .14, 1.23, 2.5);
    part(g, frame, x - 3.2, baseY + 1.7, 1.05, .21, .16, .72);
    if (o.height) {
      for (const dx of [-1.6, 1.6]) part(g, frame, x + dx, baseY + 14, 0, .34, 20, .34);
      for (const y of [9, 15, 21, 23.5]) part(g, shell, x, baseY + y, 0, 3.6, .3, .33);
      part(g, trim, x, baseY + 24.5, 0, 3.9, 1.3, 2.1);
    } else if (o.step === 'backup') {
      part(g, frame, x + 1.6, baseY + 5.1, 0, .27, 2, .27);
      part(g, shell, x + 1.6, baseY + 6.2, 0, 2.2, .28, .24);
    }
    const light = part(g, dark, x - 3.25, baseY + (o.height ? 24.5 : 3.08), 0, .3, .26, .43, lamp);
    const zone = part(g, marker, 0, o.height || .28, 0, o.radius * .65, 1, o.radius * .65, ring);
    zone.userData.noAO = true;
    return { light, zone };
  });
  root.visible = false; scene.add(root);
  return {
    hide() { root.visible = false; },
    show(index) {
      root.visible = true;
      stations.forEach(({ light, zone }, i) => {
        light.material = i === index ? amber : i < index && i !== 1 ? cold : dark;
        zone.visible = i === index;
      });
    },
  };
}
