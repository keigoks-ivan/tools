// A self-contained sortie in the existing Kobe drydock.
import { MECH6 as portControls, HATCH_ROUTE as gantry } from '../lastline/script.js';
export { LAYOUT, FOOT_EXTENT, FIELD_BOUNDS } from '../lastline/script.js';

export const SAVE_KEY = 'ironDemo';
export const FIRST_MECH = 2;
export const HATCH_ROUTE = [[30,64],[40,58],[40,46],[8,46],...gantry];
export const CHAPTERS = [
  { n: 1, name: '冷機啟動', en: 'COLD START', start: 'ch3', yaw: 0 },
  { n: 2, name: '逆潮出港', en: 'BREAKWATER', mech: true },
];
export const MECH_WALK = { ch: 1, after: 'F2', at: p => p.z > 41 };
export const LINES = {
  start: [['米拉', '後照鏡裡有兩盞藍燈。是你們的嗎？'], ['斑鳩', '我只剩一盞了。另一盞是獵犬。零號，棚裡那台蒼焰還能開。']],
  mech: [['獵犬', '一號機沿吊車軌道搜索。'], ['白鷺', '聽腳步聲。牠越過屋頂了。'], ['斑鳩', '牠去找車隊了。我還在。']],
  hatch: [['白鷺', '艙蓋已開。坐進去，零號。']],
};
export const ENCOUNTERS = [
  { id: 'F2', ch: 1, obj: '到吊架旁取回啟動保險絲', fight: '取回保險絲，清出通路', guide: [19, 40], route: [[8, 20], [10, 34]],
    trigger: p => Math.hypot(p.x - 19, p.z - 40) < 19,
    enemies: [{ type: 'trooper', x: 29, z: 43, yaw: .5, patrol: [[29,43],[34,49]] }],
    pickups: [{ id: 'fuse', text: '按 E／互動　取出保險絲' }], itemName: '保險絲',
    lines: [['白鷺', '工具箱在吊架底下。拿裡面的保險絲，西側配電箱就能啟動。']],
    done: [['零號', '拿到了。米拉，如果我出不來，就跟著斑鳩的燈。']] },
  { id: 'G2', ch: 1, obj: '裝回西側配電箱，啟動蒼焰', fight: '替蒼焰恢復供電', guide: [18, 62], route: [[38,46],[40,58],[30,64]],
    trigger: p => Math.hypot(p.x - 18, p.z - 62) < 7,
    enemies: [{ type: 'trooper', x: 31, z: 63, yaw: Math.PI }, { type: 'drone', x: 51, z: 74, y: 8 }],
    operation: { kind: 'console', radius: 2.4, points: [Object.assign([18,62], { label: '裝入保險絲', seconds: 1.5 })] },
    lines: [['米拉', '一號車載傷員，二號車載他們的家人。我答應過讓他們一起出港。']],
    done: [['白鷺', '電源回來了。從西側樓梯上黃色維修架，艙口就在蒼焰胸前。']] },
];

const start = { x: 40, z: 89, yaw: Math.PI };
export const routes = {
  sky: { title: '越過吊臂', sub: '升至二十五公尺，擊落兩架攔截機', obj: '起飛至吊車上空（高度 25 公尺）',
    go: [138,38,44], cp: [126,38,Math.PI/2], altitude: 25,
    list: [['heli',156,3,48],['heli',186,-28,56]], cue: 'zPursuit',
    talk: [['白鷺','切入飛行，爬過吊車。擊落攔截機，決戰時上空就乾淨了。',true]],
    lines: [['米拉','看見你飛過去了。全車的孩子都擠到了左邊窗戶。']] },
  pier: { title: '救出斑鳩', sub: '突破封鎖，讓斑鳩重新加入編隊', obj: '前往貨運道救援斑鳩',
    go: [168,-107,42], cp: [151,-94,Math.PI], list: [['tank',199,-119],['heavy',205,-100]], cue: 'lRescue',
    talk: [['斑鳩','我在貨運道。坦克堵著出口，幫我開一條路，我就跟你飛。',true]],
    lines: [['白鷺','綠色訊號在貨櫃後方。打掉路口的封鎖部隊。']] },
};
const follow = {
  sky: { title:'風中的黑盒', sub:'追上正在傘降的記錄器', obj:'飛向港池上空，接應失事機的記錄器',
    go:[213,18,38], cp:[204,22,Math.PI/2], list:[['jet',295,-17,85],['heli',269,22,65]], cue:'lAir',
    talk:[['白鷺','剛才那架的記錄器彈出來了。它收過夜鷺的編隊訊號。',true]],
    lines:[['零號','看見橘色傘了。我去接。'],['白鷺','錯過也能到路面撿。別讓追兵咬住你。']] },
  pier: { title:'把車帶出彎道', sub:'到頭車前方領路，和斑鳩打開路口', obj:'到醫療車前方與米拉會合',
    go:[240,-69,34], cp:[240,-84,0], list:[['grunt',270,-120],['tank',317,-120]], cue:'lConvoy',
    talk:[['米拉','我們停在轉角前。後車看不清路，讓我看著你的背影開。',true]],
    lines:[['斑鳩','路口交給我。你到頭車前方，把兩輛帶過右彎。']] },
};
export const sections = ['launch','distress','crossing','supply','ambush','commander'];
export const modules = {
  magazine: { point:[207,-237], name:'擴充彈匣' },
  shield: { point:[273,-243], name:'護盾電容' },
};
export function applyRoute(config, route) {
  if (!Object.hasOwn(routes, route)) return false;
  config.waves[1] = { ...routes[route], repair: .22 };
  config.waves[2] = { ...follow[route] };
  config.waves.at(-1).list = route === 'pier'
    ? [['ace',382,-156,52],['heli',415,-138,46]] : [['ace',382,-156,52]];
  return true;
}
export function readSortieCheckpoint(saved) {
  const fresh = { wave:0, route:null, module:null, recovered:false, corner:0 };
  if (saved?.chapter !== 2) return fresh;
  const route = Object.hasOwn(routes,saved.route) ? saved.route : null;
  let wave = sections.indexOf(saved.section);
  // The original sortie saved the commander at wave 2. Keep those pilots at the gate.
  if (wave < 0) {
    if (saved.section !== undefined) return fresh;
    wave = saved.wave === 1 ? 1 : 0;
    if (saved.wave === 2 && route) wave = sections.indexOf('commander');
  }
  if (wave > 1 && !route) return fresh;
  return { wave, route, module:wave >= 3 && Object.hasOwn(modules,saved.module) ? saved.module : null,
    recovered:wave >= 2 && route === 'sky' && saved.recovered === true,
    corner:wave >= 2 && route === 'pier' && [1,2].includes(saved.corner) ? saved.corner : 0 };
}
export function makeSortie() {
  return {
    demo: true, chapter: 2, final: true, name: '逆潮出港', en: 'BREAKWATER', label: '逆潮　／　機甲出擊',
    mission: new URL('./mission.mjs', import.meta.url).href,
    keys: portControls.keys.filter(([key]) => key !== 'B'), touch: portControls.touch.filter(([key]) => key !== 'tSupport'),
    start: { ...start, lines: [['零號', '米拉，打開前燈，我帶你們走。'], ['白鷺', '先把棚口的追兵引開。步槍開火，按住鎖定再鬆開就能發射飛彈。']] },
    restart: start, goal: ['駛出棚口', '沿軌道前往首個路標'],
    waves: [
      { title: '蒼焰出棚', sub: '以步槍和鎖定飛彈擊退追兵', obj: '駛出南側棚門', go: [40,38,21], cp: [40,48,Math.PI], list: [['grunt',22,10],['grunt',67,12]], cue: 'zSortie',
        lines: [['斑鳩','兩架在你正前方。我被卡在貨運道了，先顧你那邊。']] },
      { go: [40,38,21], cp: [40,38,Math.PI/2], list: [], obj: '選擇支援方向', cue: 'lConvoy' },
      { ...follow.sky },
      { title:'最後一節電池', sub:'靠近一座補給架，接上蒼焰', obj:'前往東側維修岔口',
        go:[240,-218,32], cp:[240,-196,Math.PI], list:[['grunt',196,-240],['heli',278,-215,58]], cue:'lBatteryRun', repair:.18,
        talk:[['米拉','我們把備用電池留在維修岔口了。兩座架子，只夠接通一座。',true]],
        lines:[['白鷺','橘架有六十發彈匣，藍架能讓盾提早回充。靠近要接的那一座。']] },
      { title:'第三盞藍燈', sub:'找出發送假訊號的重型指揮機', obj:'沿東側堤道追查冒用的車隊呼號',
        go:[357,-240,42], cp:[332,-240,Math.PI/2], list:[['grunt',381,-240],['heavy',423,-240],['grunt',360,-276]], cue:'lRadio',
        talk:[['米拉','有人用我的聲音，叫二號車往海裡開。我根本沒發話。',true]],
        lines:[['白鷺','重型機在轉發假呼號。兩架護衛靠它指揮，你可以直接打領隊。',true]] },
      { title: '防波堤上空', sub: '擊破封港指揮機・夜鷺', obj: '前往港口閘門迎擊夜鷺', go: [350,-120,62], cp: [325,-120,Math.PI/2], repair: .36,
        list: [['ace',382,-156,52]], boss: { ap: 1.35, airborne: true, name: '封港指揮機・夜鷺' }, cue: 'lCaptain',
        talk: [['米拉','兩輛都到閘口了。那台藍燈的機體又跟上來了。',true]],
        lines: [['白鷺','光束來之前會蓄光。開盾撐過第一輪，抓它收束的空檔。',true]] },
    ],
    bossDown: [['斑鳩','藍燈熄了。米拉，現在！',true]], down: [['白鷺','已回到上一個安全點。這次換個角度接戰。']],
    clear: ['航道打通', '醫療車通行'], end: [['米拉','一號車通過。二號車……也過了。'], ['乘客','媽媽，剛才在窗外的那個人，他也有地方回去嗎？']],
    fin: ['兩盞車燈，一起出港', '逆潮　／　試玩完'],
  };
}
