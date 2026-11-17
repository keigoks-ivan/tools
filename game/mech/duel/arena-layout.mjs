const halfTurn = ({x, z, ...cover}) => ({...cover, x: -x, z: -z});
const west = [
  {x: -107, z: 0, width: 39, depth: 19, height: 13, kind: 'stack', color: 0x654334},
  {x: -113, z: -70, width: 58, depth: 43, height: 21, kind: 'shed', color: 0x696c63},
  {x: -43, z: 43, width: 49, depth: 20, height: 12, kind: 'stack', color: 0x2e6269},
  {x: -71, z: 104, width: 37, depth: 22, height: 9, kind: 'stack', color: 0x8a6550},
  {x: -164, z: 76, width: 30, depth: 16, height: 8, kind: 'stack', color: 0x637471},
];

export const ARENA = {
  bounds: {minX: -230, maxX: 230, minZ: -160, maxZ: 160, ceiling: 98},
  spawn: [{x: -170, z: 0, yaw: Math.PI / 2}, {x: 170, z: 0, yaw: -Math.PI / 2}],
  cover: [...west, ...west.map(halfTurn)],
  relay: {x: 0, z: 0, radius: 20},
};
