// 國土地理院 DEM10B，離線取樣為 257²、1 公尺量化高度。出典與範圍見 source.json。
export const KOBE_RELIEF = { size: 257, x0: -12000, x1: 12000, z0: -14000, z1: 1000, anchorX: -180, anchorZ: 540 };
export function decodeKobeRelief(buffer) {
  if (buffer.byteLength !== KOBE_RELIEF.size ** 2 * 2) throw new Error('Invalid Kobe elevation field');
  const view=new DataView(buffer), data=new Uint16Array(buffer.byteLength/2);
  for(let i=0;i<data.length;i++)data[i]=view.getUint16(i*2,true);
  return data;
}
export function kobeElevation(data,x,z) {
  const {size,x0,x1,z0,z1}=KOBE_RELIEF;
  const u=Math.max(0,Math.min(size-1,(x-x0)/(x1-x0)*(size-1))),v=Math.max(0,Math.min(size-1,(z-z0)/(z1-z0)*(size-1)));
  const ix=Math.min(size-2,Math.floor(u)),iz=Math.min(size-2,Math.floor(v)),fx=u-ix,fz=v-iz,a=iz*size+ix;
  return (data[a]*(1-fx)+data[a+1]*fx)*(1-fz)+(data[a+size]*(1-fx)+data[a+size+1]*fx)*fz;
}
export function kobeCityHeight(data,x,z) {
  // 現有作戰街區仍為平地；山麓之外使用實際海拔，沒有放大峰高。
  const r=Math.hypot(x,z), t=Math.max(0,Math.min(1,(r-820)/580));
  return kobeElevation(data,x,z)*t*t*(3-2*t);
}
