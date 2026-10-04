// 世界座標 [x,y,z]；車輛只走服務道路，北野庭園保留步行。
const P=(x,z,y=0)=>[x,y,z];
const arc=(x,z,r,a,b)=>Array.from({length:17},(_,i)=>{
  const t=a+(b-a)*i/16;return P(x+Math.cos(t)*r,z+Math.sin(t)*r);
});
const join=(...routes)=>routes.flat().filter((p,i,a)=>!i||p.some((v,k)=>Math.abs(v-a[i-1][k])>1e-6));
const reverse=route=>route.slice().reverse().map(p=>p.slice());
const mouth=arc(125,16,8,Math.PI/2,0);
const southTurn=arc(141,-62,8,Math.PI,Math.PI*1.5);
const zeroPatrol=join([P(94,24),P(125,24)],mouth,[P(133,-36)]);
const gateApproach=join([P(133,-36),P(133,-62)],southTurn,[P(210,-70)]);
const zeroFull=join(zeroPatrol,gateApproach,[P(300,-70)]);
const zeroKitano=join(reverse(zeroFull).slice(0,-1),[P(104,24)]);
const manifestA=join([P(-140,-240),P(-140,-262)],arc(-132,-262,8,Math.PI,Math.PI*1.5),[P(-80,-270)]);
const manifestB=[P(-80,-270),P(60,-270)];
const manifestMedical=join([P(60,-270),P(132,-270)],arc(132,-262,8,-Math.PI/2,0),[P(140,-80)]);
const manifest=join(manifestA,manifestB,manifestMedical);
const channelRelay=[P(380,-120),P(582,-120)];
const channelIntercept=join([P(582,-120)],arc(582,-130,10,Math.PI/2,0),[P(592,-300)]);
const channel=join(channelRelay,channelIntercept);
const shuttleDock=join([P(400,-360),P(582,-360)],arc(582,-350,10,-Math.PI/2,0));
const shuttleHangar=join([P(592,-350),P(592,-220),P(592,-130)],arc(582,-130,10,0,Math.PI/2),[P(440,-120)]);
const shuttle=join(shuttleDock,shuttleHangar);
// AI 的 patrol 沿用既有 [x,z]；這些人接受支線時就在路邊駐守。
const guard=(x,z,yaw,patrol,type='trooper')=>({type,x,y:0,z,yaw,patrol,alert:false});
const freeze=o=>{
  if(o&&typeof o==='object'){for(const v of Object.values(o))freeze(v);Object.freeze(o);}return o;
};

export const VEHICLE_ROUTES=freeze({
  zero_patrol:{map:'zero',vehicleType:'patrol',vehicleSpawn:P(94,24),vehicleYaw:Math.PI/2,
    sites:{repair:P(96,22),roadblock:P(138,-36),gate:P(210,-75),park:P(300,-75)},
    parking:{repair:P(94,24),roadblock:P(133,-36),gate:P(210,-70),park:P(300,-70)},
    driveRoutes:{patrol:zeroPatrol,gateApproach,return:[P(210,-70),P(300,-70)]},
    encounters:{roadblock:{enemies:[guard(133,-65,0,[[133,-65],[133,-58]]),guard(136,-68,0,[[136,-68],[136,-61]]),
      guard(148,-70,-Math.PI/2,[[148,-70],[155,-70]]),guard(158,-72,-Math.PI/2,[[158,-72],[151,-72]],'officer')]}}},
  zero_kitano:{map:'zero',vehicleType:'patrol',vehicleSpawn:P(300,-70),vehicleYaw:-Math.PI/2,
    sites:{load:P(300,-75),garden:P(194.5,58,8.415),unload:P(300,-75)},
    parking:{load:P(300,-70),garden:P(104,24),unload:P(300,-70)},
    driveRoutes:{kitano:zeroKitano,return:reverse(zeroKitano)},
    walkRoutes:{garden:[P(104,24),P(104,26),P(130,26,.035),P(186,26,6.475),P(194,26,7.395),P(195.5,43,8.42),P(194.5,58,8.415)]}},
  lastline_manifest:{map:'lastline',vehicleType:'apc',vehicleSpawn:P(-140,-240),vehicleYaw:Math.PI,
    sites:{load:P(-140,-235),gateA:P(-80,-275),gateB:P(60,-275),medical:P(145,-80)},
    parking:{load:P(-140,-240),gateA:P(-80,-270),gateB:P(60,-270),medical:P(140,-80)},
    driveRoutes:{gateA:manifestA,gateB:manifestB,medical:manifestMedical,return:reverse(manifest)},
    encounters:{defend:{enemies:[guard(140,-112,0,[[140,-112],[140,-118]]),guard(137,-120,0,[[137,-120],[137,-126]]),
      guard(143,-125,0,[[143,-125],[143,-131]]),guard(140,-135,0,[[140,-135],[140,-129]],'officer')]}}},
  lastline_channel:{map:'lastline',vehicleType:'patrol',vehicleSpawn:P(380,-120),vehicleYaw:Math.PI/2,
    sites:{repair:P(380,-125),relay:P(580,-125),intercept:P(590,-300),park:P(380,-115)},
    parking:{repair:P(380,-120),relay:P(582,-120),intercept:P(592,-300),park:P(380,-120)},
    driveRoutes:{relay:channelRelay,intercept:channelIntercept,return:reverse(channel)},
    encounters:{intercept:{enemies:[guard(592,-268,Math.PI,[[592,-268],[592,-262]]),guard(590,-260,Math.PI,[[590,-260],[590,-254]]),
      guard(593.5,-250,Math.PI,[[593.5,-250],[593.5,-256]]),guard(590,-242,Math.PI,[[590,-242],[590,-248]],'officer')]}}},
  lastline_shuttle:{map:'lastline',vehicleType:'apc',vehicleSpawn:P(400,-360),vehicleYaw:Math.PI/2,
    sites:{load:P(400,-365),dock:P(590,-350),gate:P(590,-345),hangar:P(440,-115)},
    parking:{load:P(400,-360),dock:P(592,-350),gate:P(592,-350),hangar:P(440,-120)},
    driveRoutes:{dock:shuttleDock,hangar:shuttleHangar,return:reverse(shuttle)},
    encounters:{defend:{enemies:[guard(592,-318,Math.PI,[[592,-318],[592,-312]]),guard(590,-308,Math.PI,[[590,-308],[590,-302]]),
      guard(593.5,-300,Math.PI,[[593.5,-300],[593.5,-306]]),guard(590,-292,Math.PI,[[590,-292],[590,-298]],'officer')]}}},
});

export function vehicleRouteLength(route) {
  return route.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-route[i][0],p[2]-route[i][2]),0);
}

export function vehicleRoutePoses(route) {
  return route.map((p,i)=>{
    const a=route[Math.max(0,i-1)],b=route[Math.min(route.length-1,i+1)];
    let x=b[0]-p[0],z=b[2]-p[2],d=Math.hypot(x,z);
    if(d){x/=d;z/=d;}
    if(i){const ax=p[0]-a[0],az=p[2]-a[2],ad=Math.hypot(ax,az);if(ad){x+=ax/ad;z+=az/ad;}}
    return {x:p[0],y:p[1],z:p[2],yaw:Math.atan2(x,z)};
  });
}
