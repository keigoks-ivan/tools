// Baked game environments. The airport is an illustrative shared scene, not a replica of the selected airport.
import { tr } from './ui-util.js?v=19';

export function airportPicture(className = '') {
  return `<picture class="${className}"><source media="(max-width:700px)" srcset="./art/v3/airport-dusk-mobile.webp?v=19"><img src="./art/v3/airport-dusk.webp?v=19" width="1536" height="1024" decoding="async" alt="${tr('黃昏的天青機場，燈光亮起的航廈、跑道與機隊','SKYGLAZE airport at dusk, with illuminated terminal, runway and aircraft')}"></picture>`;
}

export function orbitBackdrop() {
  return `<div class="orbit-world" aria-hidden="true"><div class="orbit-halo"></div><div class="orbit-ring ring-one"></div><div class="orbit-ring ring-two"></div><div class="sky-dust"></div><div class="sky-cloud cloud-one"></div><div class="sky-cloud cloud-two"></div></div><div class="network-sector" aria-hidden="true"><span>SKYGLAZE / FLIGHT CONTROL</span><i>180 PORTS · WORLD NETWORK</i></div>`;
}
