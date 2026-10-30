import {RESOURCES,OPPORTUNITIES} from './network-data.mjs?v=20261030-19';
import {cleanNetworkState,effectiveResources,effectiveFacts,evaluateOpportunity} from './network-core.mjs?v=20261030-19';

export const SETUP_STORE='imq-reward-setup-v1';
export const SETUP_GOALS=[
  {id:'flight',title:'換機票與升等',note:'從可累積的里程與點數出發',icon:'↗'},
  {id:'status',title:'拿會籍與禮遇',note:'查看會籍配對、挑戰與申請入口',icon:'✦'},
  {id:'hotel',title:'用點數住飯店',note:'比較轉點、住宿用途與雙重累積',icon:'⌂'},
  {id:'all',title:'先看全部',note:'先探索，再決定下一步',icon:'⊕'}
];
export const SETUP_STEPS=[
  {id:'cards',label:'信用卡',title:'你有哪些信用卡？',note:'選確切卡別，可以複選，沒有就直接下一步。持卡不代表已取得贈送會籍。',groups:['信用卡']},
  {id:'status',label:'會籍',title:'目前已經拿到哪些會籍？',note:'每個計畫選目前等級。還在申請或不確定，就選「沒有」。',groups:['酒店會籍','航空會籍']},
  {id:'points',label:'點數',title:'手上有哪些里程與點數？',note:'選填，可以直接完成。餘額不填不當作零，也不會推算可訂機位或房況。',groups:['點數與帳戶']}
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

// 設定第一步的發卡機構分組；依資源代號前綴，對不到的歸「其他與海外發卡」
export const CARD_ISSUERS=[['ctbc','中國信託'],['amex','美國運通'],['hsbc','滙豐'],['cube','國泰世華'],['dbs','星展'],['other','其他與海外發卡']];
export function cardIssuer(id){const prefix=id.split('-')[0];return CARD_ISSUERS.some(([key])=>key===prefix&&key!=='other')?prefix:'other';}
// 「我的路線」分組：起點相符／起點對上但缺條件／有段條款待核／其他（沒有起點、已排除、截止或未生效）
export function planGroups(goal,saved,today){
  const inventory=cleanNetworkState(saved),resources=effectiveResources(inventory),facts=effectiveFacts(inventory);
  for(const [id,amount] of Object.entries(inventory.balances))if(amount===0)resources.delete(id);
  const groups={ready:[],missing:[],unverified:[],other:[]};
  for(const op of OPPORTUNITIES.filter(op=>goal==='all'||op.goal===goal)){
    const inputs=[...new Set([...op.any,...op.all,...(op.allGroups||[]).flat()])],anchors=inputs.filter(id=>resources.has(id));
    const check=evaluateOpportunity(op,resources,facts,today),item={op,check,anchors};
    if(!anchors.length||['blocked','closed','scheduled'].includes(check.state))groups.other.push(item);
    else if(check.state==='connected')groups.ready.push(item);
    else if(['lead','conflict'].includes(check.state))groups.unverified.push(item);
    else groups.missing.push(item);
  }
  const order=list=>list.sort((a,b)=>b.anchors.length-a.anchors.length||a.check.missing.length-b.check.missing.length||a.op.id.localeCompare(b.op.id));
  Object.values(groups).forEach(order);
  return groups;
}
