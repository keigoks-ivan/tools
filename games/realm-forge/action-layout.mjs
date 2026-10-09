const GRID_KEYS = 'qwertasdfgzxcvb';

/** Reserve shortcuts first, then place every remaining action in a free cell. */
export function layoutActions(actions, columns = 5) {
  const width = Number.isInteger(columns) && columns > 0 ? columns : 5;
  const shortcuts = new Set(), occupied = new Set();
  const result = actions.map(action => {
    const original = typeof action.key === 'string' ? action.key.trim() : '';
    const normalized = original.toLowerCase();
    const key = normalized && !shortcuts.has(normalized) ? original : '';
    if (key) shortcuts.add(normalized);
    return { ...action, key, row:undefined, column:undefined };
  });
  const place = (action, slot) => {
    occupied.add(slot);
    action.column = slot % width + 1;
    action.row = Math.floor(slot / width) + 1;
  };
  for (const action of result) {
    const slot = action.key.length === 1 ? GRID_KEYS.indexOf(action.key.toLowerCase()) : -1;
    if (slot >= 0) place(action, slot);
  }
  let free = 0;
  for (const action of result) {
    if (action.row !== undefined && action.column !== undefined) continue;
    while (occupied.has(free)) free++;
    place(action, free++);
  }
  return result;
}
