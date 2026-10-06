// Original vector controls; local image atlases are decorative, never game data.
const paths = {
  airport: '<path d="M6 27V15l12-8 12 8v12H6Z"/><path d="M11 27v-9h14v9M18 7V3m-4 0h8"/>',
  network: '<circle cx="18" cy="18" r="13"/><ellipse cx="18" cy="18" rx="6" ry="13"/><path d="M6 13h24M6 23h24"/>',
  routes: '<path d="m4 20 12-3 3-12 4-1-1 12 9 3v3l-10-1-1 8-3 1-1-9-9 2Z"/>',
  fleet: '<path d="m3 13 12-3 2-6 3-1v7l11 3v3l-11-1-1 6h-3l-1-6-12 1Z"/><path d="M6 25h24M10 30h16"/>',
  missions: '<path d="M8 31V5m0 1h21l-4 7 4 7H8"/><path d="m14 12 3 3 5-5"/>',
  hub: '<path d="m8 28 13-13M7 6l8 2 1 8-8-1-2-8m17-2 5 5-4 4-5-5m-4 17 5 5"/><circle cx="7" cy="29" r="3"/>',
  lounge: '<path d="m18 4 4 8 9 1-7 7 2 10-8-5-8 5 2-10-7-7 9-1Z"/>',
  tank: '<ellipse cx="18" cy="9" rx="11" ry="5"/><path d="M7 9v18c0 6 22 6 22 0V9M7 19c0 6 22 6 22 0"/>',
  cash: '<circle cx="18" cy="18" r="13"/><path d="M23 11h-7a4 4 0 0 0 0 8h4a4 4 0 0 1 0 8h-7M18 7v24"/>',
  margin: '<path d="M6 29V18h5v11m5 0V12h5v17m5 0V6h5v23M5 11l9-6 7 1 7-4"/>',
  xp: '<path d="m18 3 4 9 10 1-8 7 3 11-9-6-9 6 3-11-8-7 10-1Z"/>',
  play: '<path d="m12 6 18 12-18 12Z"/>',
  pause: '<path d="M10 7h5v22h-5Zm11 0h5v22h-5Z"/>',
  continue: '<path d="M8 12a12 12 0 1 1-1 12M8 4v9H1"/><path d="m15 12 9 6-9 6Z"/>',
  passport: '<rect x="7" y="4" width="22" height="28" rx="4"/><circle cx="18" cy="15" r="6"/><path d="M12 15h12m-6-6v12M13 27h10"/>',
};
export function gameIcon(name) {
  return `<svg class="game-icon" viewBox="0 0 36 36" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || paths.routes}</svg>`;
}
export function brandCrest() {
  return `<svg class="brand-crest" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54" fill="#d9f6ef" stroke="#ffcf86" stroke-width="5"/><circle cx="60" cy="60" r="44" fill="#177a9c"/><path d="M21 69q39-20 79-4M26 83q32-16 70-7" fill="none" stroke="#85d9d4" stroke-width="3"/><path d="m23 54 27-5 8-28 10-2-1 28 29 9-1 7-28-4-3 23-8 2-4-25-26 6Z" fill="#fff6df" stroke="#f9c77c" stroke-width="2"/><circle cx="85" cy="34" r="6" fill="#f5a58b"/></svg>`;
}
export function regionalArt(region, className = '') {
  const cell = {asia:0,middleEast:1,europe:2,northAmerica:3,southAmerica:4,africa:5,oceania:6}[region] ?? 0;
  return `<span class="regional-art ${className}" aria-hidden="true" style="background-position:${(cell%3)*50}% ${Math.floor(cell/3)*50}%"></span>`;
}
