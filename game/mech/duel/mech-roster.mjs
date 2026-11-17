// Cosmetic choices only. Combat values and collision shapes live in rules.mjs.
export const MECHS = Object.freeze([
  Object.freeze({id:'cangyan',name:'蒼焰',code:'M-07',style:'戰機頭盔 · 雙推進艙',livery:[1,1,1]}),
  Object.freeze({id:'bailu',name:'白鷺',code:'M-07R',style:'窄幅面罩 · 後掠肩甲',livery:[5.4,4.45,3.75]}),
  Object.freeze({id:'tiechao',name:'鐵潮',code:'M-07G',style:'感測頭座 · 防護重甲',livery:[1.80,1.29,.77]}),
]);
export const DEFAULT_MECH = MECHS[0].id;
export const isMechId = value => MECHS.some(mech => mech.id === value);
export const mechInfo = value => MECHS.find(mech => mech.id === value) ?? MECHS[0];
