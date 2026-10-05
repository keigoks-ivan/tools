// 內嵌 SVG 圖示（24x24，線條 1.8）
const s = (p, extra = '') => `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${p}</svg>`;
export const icon = {
  shop: s('<path d="M4 9.5 5.6 4.5h12.8L20 9.5"/><path d="M4 9.5c0 1.5 1.1 2.5 2.5 2.5S9 11 9 9.5c0 1.5 1.1 2.5 3 2.5s3-1 3-2.5c0 1.5 1.1 2.5 2.5 2.5S20 11 20 9.5"/><path d="M5.5 12v7.5h13V12"/><path d="M10 19.5v-4h4v4"/>'),
  factory: s('<path d="M3.5 20V10l5.5 3.5V10l5.5 3.5V6.5h3.5V20z"/><path d="M7 16.5h1.5M11 16.5h1.5M15.5 16.5H17"/>'),
  warehouse: s('<path d="M3.5 9.5 12 4l8.5 5.5V20h-17z"/><path d="M8 20v-6h8v6M8 17h8"/>'),
  lab: s('<path d="M9.5 4h5M10.5 4v5.2L5.4 18a1.6 1.6 0 0 0 1.4 2.4h10.4a1.6 1.6 0 0 0 1.4-2.4l-5.1-8.8V4"/><path d="M8 14.5h8"/>'),
  ad: s('<path d="M4 10v4h3l7 4V6L7 10z"/><path d="M17.5 9.5a4 4 0 0 1 0 5"/><path d="M7 14l1.2 5h2.4L9.6 15"/>'),
  coin: s('<circle cx="12" cy="12" r="8"/><path d="M12 7.5v9M9.5 9.8c0-1 1.2-1.6 2.5-1.6s2.5.6 2.5 1.6-1.2 1.4-2.5 1.7-2.5.7-2.5 1.7 1.2 1.6 2.5 1.6 2.5-.6 2.5-1.6"/>'),
  trend: s('<path d="M4 17l5-5 3.5 3L20 7"/><path d="M15 7h5v5"/>'),
  value: s('<path d="M4 20V10M10 20V5M16 20v-7M21 20H3"/>'),
  cal: s('<rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>'),
  pause: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M7 4.8v14.4a1 1 0 0 0 1.5.9l11.6-7.2a1 1 0 0 0 0-1.7L8.5 3.9A1 1 0 0 0 7 4.8z"/></svg>',
  play2: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 5.5v13a.9.9 0 0 0 1.4.8l8-6.5a.9.9 0 0 0 0-1.4l-8-6.5A.9.9 0 0 0 3 5.5zM12 5.5v13a.9.9 0 0 0 1.4.8l8-6.5a.9.9 0 0 0 0-1.4l-8-6.5a.9.9 0 0 0-1.4.7z"/></svg>',
  play4: '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M1.5 6v12a.8.8 0 0 0 1.3.6l6-6a.8.8 0 0 0 0-1.2l-6-6A.8.8 0 0 0 1.5 6zM8.5 6v12a.8.8 0 0 0 1.3.6l6-6a.8.8 0 0 0 0-1.2l-6-6A.8.8 0 0 0 8.5 6zM15.5 6v12a.8.8 0 0 0 1.3.6l6-6a.8.8 0 0 0 0-1.2l-6-6a.8.8 0 0 0-1.3.6z"/></svg>',
  tariff: s('<path d="M5 19c0-8 5-13 14-14 0 9-5 14-14 14z"/><path d="M5 19c3-3 6-5.5 9.5-7.5"/>'),
  close: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  star: '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2 6.3 20.3l1.2-6.4L2.8 9.5l6.4-.8z" fill="currentColor"/></svg>',
  bolt: s('<path d="M13 3 5 13.5h5.5L10 21l8-10.5h-5.5z"/>'),
};
