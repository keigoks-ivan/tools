import { directions } from "../little-arcade.js";

export function parseRoom(rows) {
  const cells = rows.join("");
  const columns = rows[0].length;
  const crates = [];
  const mats = new Set();
  let player;
  for (const [pos, cell] of [...cells].entries()) {
    if ("bx".includes(cell)) crates.push(pos);
    if ("oxq".includes(cell)) mats.add(pos);
    if ("pq".includes(cell)) player = pos;
  }
  return { cells, columns, rows: rows.length, mats, start: { player, crates, pushes: 0, face: "right" } };
}

export function stepRoom(room, state, move) {
  const direction = directions[move];
  if (!Array.isArray(direction)) return null;
  const [dx, dy] = direction;
  function ahead(from) {
    const x = from % room.columns + dx;
    const y = Math.floor(from / room.columns) + dy;
    if (x < 0 || x >= room.columns || y < 0 || y >= room.rows) return -1;
    const pos = y * room.columns + x;
    return "#-".includes(room.cells[pos]) ? -1 : pos;
  }
  const player = ahead(state.player);
  if (player < 0) return null;
  const crate = state.crates.indexOf(player);
  const face = dx ? move : state.face;
  if (crate < 0) return { ...state, player, face };
  const next = ahead(player);
  if (next < 0 || state.crates.includes(next)) return null;
  const crates = [...state.crates];
  crates[crate] = next;
  return { player, crates, pushes: state.pushes + 1, face };
}

export function solvedRoom(room, state) {
  return state.crates.every((crate) => room.mats.has(crate));
}
