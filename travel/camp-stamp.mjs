// Handbook stamp for a camp card: type label and city colour, both taken from the shared camps data.
// Program name keywords win over categories, because a name like "Holiday Swim Camp" is more specific than category "sport".
const NAME_WORDS=[[/swim/i,'游泳'],[/robot/i,'機器人'],[/magic(?!\))/i,'魔術']];
const CATEGORY_WORDS={stem:'STEM',english:'英文',sport:'運動',outdoor:'戶外',arts:'藝術',multi_activity:'綜合',leadership:'領導力',other_language:'語言'};
export function campStampText(program){
 const name=String(program?.name||''),hit=NAME_WORDS.find(([re])=>re.test(name));
 if(hit)return hit[1];
 const cat=(program?.category||[]).find(k=>CATEGORY_WORDS[k]);
 return cat?CATEGORY_WORDS[cat]:'營隊';
}
export function campStampCity(location){
 const where=`${location?.city||''} ${location?.state||''}`;
 return /Kuala Lumpur/i.test(where)?'kl':/Penang|Pulau Pinang/i.test(where)?'pen':'';
}
export const campStampMarkup=c=>{const city=campStampCity(c.locationData),t=campStampText(c.programData);return `<span class="camp-stamp"${city?` data-city="${city}"`:''} aria-hidden="true">${t}</span>`;};
