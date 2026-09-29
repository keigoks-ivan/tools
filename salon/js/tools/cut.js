import {playSfx} from '../sfx.js?v=11';
import {scissors} from './visual.js?v=11';
export function createCut(env){let p=null,stamp=0,moved=0;return {onDown(q){p=q},onMove(q){if(!p)return;let count=env.hair.cut(p,q,env.H);if(count){moved=performance.now();env.react(count>7?'surprise':'happy');if(performance.now()-stamp>140){playSfx('snip');stamp=performance.now()}}p=q},onUp(){p=null},drawOverlay(ctx){if(p)scissors(ctx,p,performance.now()-moved<220)}}}
