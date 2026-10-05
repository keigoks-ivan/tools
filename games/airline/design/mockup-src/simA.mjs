import {newGame,applyDecisions,simulateTurn,fleetNeeded} from "../../model.mjs"; import fs from "fs";
const [mode,turns,spec,out]=[process.argv[2],+process.argv[3],JSON.parse(process.argv[4]),process.argv[5]];
let s=newGame({mode,hub:"TPE",seed:7});
const routes=spec.map(([city,type,weekly,fare])=>({city,type,weekly,fare}));
let last;
for(let t=0;t<turns;t++){
 const need=fleetNeeded(s,routes); const have={}; for(const a of s.fleet) have[a.type]=(have[a.type]||0)+1;
 const lease={}; for(const [k,v] of Object.entries(need)) if(v>(have[k]||0)) lease[k]=v-(have[k]||0);
 const dec={routes, fleet:{lease}, eventChoices:{}}; if(t>=2) dec.hedge=0.5;
 for (const e of (await import("../../model.mjs")).pendingEvents(s)) { if(e.choices) dec.eventChoices[e.id]=e.choices[0].id; }
 const r=applyDecisions(s,dec); if(r.errors.length) console.log(t,JSON.stringify(r.errors).slice(0,300)); s=r.state;
 const o=simulateTurn(s); s=o.state; last=o.report;
}
const r=last;
console.log(r.labelZh,"cash",r.company.cash,"margin",r.company.margin.toFixed(3),"lf",r.company.loadFactor.toFixed(2),"be",r.company.breakEvenLF.toFixed(2),"fleet",r.company.fleet,"fuel",r.company.fuelIndex,"rev",r.company.revenue,"profit",r.company.profit,"xfer",r.company.transferPax, "pax", r.company.pax);
for(const x of r.routes) console.log(" ",x.city,x.type,x.weekly,x.fare,"pax",x.pax,"lf",x.lf.toFixed(2),"be",x.breakEvenLF.toFixed(2),"rev",x.revenue,"profit",x.profit,"fare$",Math.round(x.avgFare),"xfer",x.transferPax,"want",x.wantPax,"riv",JSON.stringify(x.rivals),"|",x.reasonZh);
console.log(JSON.stringify(r.events.map(e=>e.zh))); console.log(JSON.stringify(s.fleet.map(a=>a.type+(a.own||a.mode||''))));
console.log(s.history.map(h=>[Math.round(h.cash/1e4),h.margin.toFixed(3)].join(":")).join(" "));
fs.writeFileSync(out,JSON.stringify({company:r.company,routes:r.routes,label:r.labelZh,events:r.events,history:s.history,fleet:s.fleet,hedge:s.hedge}));
