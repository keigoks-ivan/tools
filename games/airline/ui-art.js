// Inline SVG illustrations: the airliner in brand blue (pale-sky body, tail with porcelain crackle, ink-navy engines and wordmark).
export const airlinerSVG = (opts = {}) => {
  const id = opts.id || 'ac';
  const brand = String(opts.brand || 'SKYGLAZE').replace(/[<&]/g, '');
  const body = 'M36 84 C70 86 110 90 150 90 L470 90 C540 90 590 102 618 120 C590 138 540 148 470 148 L200 148 C130 148 70 126 36 98 Z';
  const tail = 'M62 86 L32 18 C58 16 84 18 98 22 L156 90 Z';
  // porcelain crackle: irregular polygon network clipped to the fin
  const crackle = 'M44 30 L66 44 L58 62 L72 74 M66 44 L88 36 L96 56 L80 66 L72 74 M88 36 L92 24 M96 56 L122 62 L110 80 M58 62 L40 66 M80 66 L100 84 M122 62 L138 78 M52 40 L44 30 M70 26 L66 44 M104 36 L96 56';
  return `<svg class="airliner" viewBox="0 0 660 230" role="img" aria-label="${opts.label || '天青航空客機'}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <clipPath id="${id}-body"><path d="${body}"/></clipPath>
    <clipPath id="${id}-fin"><path d="${tail}"/></clipPath>
    <linearGradient id="${id}-g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#DCEAF6"/><stop offset=".55" stop-color="#BCD5EC"/><stop offset="1" stop-color="#9DBFE0"/></linearGradient>
    <linearGradient id="${id}-t" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="#9DC0E3"/><stop offset="1" stop-color="#6E9CCB"/></linearGradient>
  </defs>
  <g fill="none" stroke="#1E3550" stroke-width="1.7" stroke-linejoin="round" stroke-linecap="round">
    <path d="M338 90 L292 66 L312 66 L392 90 Z" fill="#cfe0f1"/>
    <path d="M150 90 L112 70 L130 70 L180 90 Z" fill="#cfe0f1"/>
    <path d="${body}" fill="url(#${id}-g)"/>
    <g clip-path="url(#${id}-body)"><path d="M0 128 C160 122 330 134 660 118" stroke="#6E9CCB" stroke-width="1.3" opacity=".7"/></g>
    <path d="${body}"/>
    <path d="${tail}" fill="url(#${id}-t)"/>
    <g clip-path="url(#${id}-fin)"><path d="${crackle}" stroke="#4F7DB0" stroke-width=".8" opacity=".45" transform="translate(1.2 -1)"/><path d="${crackle}" stroke="#24497A" stroke-width="1.7" opacity=".55"/></g>
    <path d="${tail}"/>
    <path d="M140 128 L88 150 L112 150 L190 134 Z" fill="#A9C9E8"/>
    <path d="M300 126 L226 196 L254 196 L388 132 Z" fill="#A9C9E8"/>
    <rect x="276" y="150" width="62" height="26" rx="13" fill="#1E3550"/>
    <path d="M281 157 q-4 6 0 12" stroke="#A9C9E8" stroke-width="1.4"/>
    <g fill="#1E3550" stroke="none" opacity=".55">${Array.from({ length: 19 }, (_, i) => `<circle cx="${178 + i * 15.2}" cy="106" r="2.5"/>`).join('')}</g>
    <path d="M566 102 L596 107 L600 115 L572 113 Z" fill="#1E3550" opacity=".85" stroke="none"/>
    <path d="M520 92 L520 146 M146 92 L146 144" stroke-width=".9" opacity=".3"/>
  </g>
  <text x="128" y="141" font-family="'Noto Serif TC','Songti TC',serif" font-size="19" font-weight="700" letter-spacing="2" fill="#1E3550" stroke="none">天青航空</text><text x="208" y="140" font-family="system-ui,sans-serif" font-size="8.5" letter-spacing="2.6" fill="#2F5D8C" stroke="none">${brand}</text>
</svg>`;
};
export const cloudLines = `<svg class="clouds" viewBox="0 0 400 60" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" opacity=".5"><path d="M10 40 h90 M40 28 h120 M180 46 h140 M250 20 h100"/></g></svg>`;
