import {playSfx} from '../sfx.js?v=11';
import {comb} from './visual.js?v=11';
export function createComb(env){let p=null,angle=.1;return {onDown(q){p=q;playSfx('comb')},onMove(q){if(p){env.hair.comb(p,q);angle+=(Math.max(-.5,Math.min(.5,(q.x-p.x)*.07))-angle)*.15}p=q},onUp(){p=null;env.react('happy')},drawOverlay(ctx){if(p)comb(ctx,p,angle)}}}
