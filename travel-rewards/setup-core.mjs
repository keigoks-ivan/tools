import {RESOURCES,OPPORTUNITIES} from './network-data.mjs?v=20261027-16';
import {cleanNetworkState,effectiveResources,effectiveFacts,evaluateOpportunity} from './network-core.mjs?v=20261027-16';

export const SETUP_STORE='imq-reward-setup-v1';
export const SETUP_GOALS=[
  {id:'flight',title:'換機票與升等',note:'從可累積的里程與點數出發',icon:'↗'},
  {id:'status',title:'拿會籍與禮遇',note:'查看會籍配對、挑戰與申請入口',icon:'✦'},
  {id:'hotel',title:'用點數住飯店',note:'比較轉點、住宿用途與雙重累積',icon:'⌂'},
  {id:'all',title:'先看全部',note:'先探索，再決定下一步',icon:'⊕'}
];
export const SETUP_STEPS=[
  {id:'cards',label:'信用卡',title:'你有哪些信用卡？',note:'選確切卡別，可複選。持卡不代表已取得贈送會籍。',groups:['信用卡']},
  {id:'status',label:'會籍',title:'目前已核准哪些會籍？',note:'每個計畫只選目前等級。不確定或尚未核准，就留空。',groups:['酒店會籍','航空會籍']},
  {id:'points',label:'點數',title:'手上有哪些里程與點數？',note:'餘額可以不填；未填不當作零，也不會推算可訂機位或房況。',groups:['點數與帳戶']},
  {id:'goal',label:'目標',title:'這次想先達成什麼？',note:'選一個方向，接著看與你已填起點相關的候選路線。',groups:[]}
];
export function setupResources(step){return RESOURCES.filter(item=>SETUP_STEPS.find(value=>value.id===step)?.groups.includes(item.group));}
export function cleanSetupPreference(value){
  if(value?.version!==1||!['completed','skipped'].includes(value.outcome))return null;
  return {version:1,outcome:value.outcome,goal:SETUP_GOALS.some(goal=>goal.id===value.goal)?value.goal:null};
}
export function setupMatches(goal,saved,today){
  if(!SETUP_GOALS.some(item=>item.id===goal))return [];
  const inventory=cleanNetworkState(saved),resources=effectiveResources(inventory),facts=effectiveFacts(inventory);
  for(const [id,amount] of Object.entries(inventory.balances))if(amount===0)resources.delete(id);
  return OPPORTUNITIES.filter(op=>goal==='all'||op.goal===goal).flatMap(op=>{
    const inputs=[...new Set([...op.any,...op.all,...(op.allGroups||[]).flat()])],anchors=inputs.filter(id=>resources.has(id)&&inventory.balances[id]!==0).length;
    if(!anchors)return [];
    const check=evaluateOpportunity(op,resources,facts,today);
    if(['blocked','closed','scheduled'].includes(check.state))return [];
    return [{op,check,score:(check.state==='connected'?100:check.state==='missing'?50:30)+Math.min(anchors,9)-check.missing.length}];
  }).sort((a,b)=>b.score-a.score||a.op.id.localeCompare(b.op.id));
}
