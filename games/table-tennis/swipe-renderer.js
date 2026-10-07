import { COURT } from './swipe-match.mjs?v=9';

const CORAL = '#f58b70', MINT = '#b1e4cb', CREAM = '#fff9e6';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createSwipeArena(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Canvas 2D is unavailable');
  const backdrop = document.createElement('canvas'), bg = backdrop.getContext('2d');
  let width = 0, height = 0, ratio = 1, scaleX = 1, scaleZ = 1, centerY = 0, now = 0;
  let trail = [], paddleTrails = { player: [], opponent: [] }, effects = [], pending = [];
  let previousPhase = 'idle', slow = false;

  function project(x, z) { return { x: width / 2 + x * scaleX, y: centerY + z * scaleZ }; }
  function worldPath(context, points, close = false) {
    context.beginPath();
    points.forEach(([x, z], index) => { const p = project(x, z); if (index) context.lineTo(p.x, p.y); else context.moveTo(p.x, p.y); });
    if (close) context.closePath();
  }
  function worldRect(context, x1, z1, x2, z2, fill, stroke, weight = 1) {
    worldPath(context, [[x1,z1],[x2,z1],[x2,z2],[x1,z2]], true);
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = weight; context.stroke(); }
  }
  function ellipse(context, point, rx, ry, fill, stroke, weight = 1) {
    context.beginPath(); context.ellipse(point.x, point.y, rx, ry, 0, 0, Math.PI * 2);
    if (fill) { context.fillStyle = fill; context.fill(); }
    if (stroke) { context.strokeStyle = stroke; context.lineWidth = weight; context.stroke(); }
  }
  function text(context, value, x, y, color, size, align = 'center', weight = 500) {
    context.font = `${weight} ${size}px system-ui,sans-serif`; context.textAlign = align; context.fillStyle = color; context.fillText(value, x, y);
  }
  function paintBackdrop() {
    bg.setTransform(ratio, 0, 0, ratio, 0, 0);
    const floor = bg.createLinearGradient(0, 0, width, height);
    floor.addColorStop(0, '#0a2529'); floor.addColorStop(.53, '#12372f'); floor.addColorStop(1, '#092329');
    bg.fillStyle = floor; bg.fillRect(0, 0, width, height);
    const wash = bg.createRadialGradient(width * .46, height * .34, 0, width / 2, height * .48, Math.max(width, height) * .68);
    wash.addColorStop(0, '#bfeec71a'); wash.addColorStop(1, '#a9caba00'); bg.fillStyle = wash; bg.fillRect(0, 0, width, height);
    const x = COURT.halfWidth, z = COURT.halfLength;
    bg.save(); bg.setLineDash([2, 12]);
    for (let line = -1.25; line <= 1.25; line += .25) {
      worldPath(bg, [[line,-2],[line,2]]); bg.strokeStyle = '#d8edcd05'; bg.lineWidth = 1; bg.stroke();
    }
    bg.restore();
    worldRect(bg, -1.17, -1.93, 1.17, 1.93, null, '#b1d7b719');
    for (const side of [-1,1]) {
      const p = project(side * 1.17, -1.7), q = project(side * 1.17, 1.7);
      bg.fillStyle = side === -1 ? '#b1e4cb0d' : '#f58b700d'; bg.fillRect(p.x - 2, p.y, 4, q.y - p.y);
    }
    // The raised edges are decoration; all moving objects share the flat x/z map.
    bg.save(); bg.shadowColor = '#000b'; bg.shadowBlur = 24; bg.shadowOffsetY = 16;
    worldRect(bg, -x, -z, x, z, '#0a211d'); bg.restore();
    const frontLeft = project(-x, z), frontRight = project(x, z);
    bg.beginPath(); bg.moveTo(frontLeft.x, frontLeft.y); bg.lineTo(frontRight.x, frontRight.y); bg.lineTo(frontRight.x, frontRight.y + 9); bg.lineTo(frontLeft.x, frontLeft.y + 9); bg.closePath(); bg.fillStyle = '#0d3028'; bg.fill();
    for (const footX of [-x * .74, x * .74]) {
      const leg = project(footX, z * .70); bg.fillStyle = '#061b18'; bg.fillRect(leg.x - 5, leg.y + 13, 10, Math.max(14, height * .025));
    }
    const top = bg.createLinearGradient(0, project(0,-z).y, 0, project(0,z).y);
    top.addColorStop(0, '#337b60'); top.addColorStop(.5, '#246650'); top.addColorStop(1, '#1d5646');
    worldRect(bg, -x, -z, x, z, top, '#e2e9ce', 2.2);
    bg.save();
    worldRect(bg, -x + .025, -z + .03, x - .025, z - .03, null, '#d6e8ce30');
    worldPath(bg, [[0,-z],[0,z]]); bg.strokeStyle = '#d8e9cc55'; bg.lineWidth = 1; bg.stroke();
    for (let row = -z + .06; row < z; row += .045) {
      worldPath(bg, [[-x + .015,row],[x - .015,row]]); bg.strokeStyle = '#eeffdd03'; bg.lineWidth = 1; bg.stroke();
    }
    bg.restore();
    const middle = project(0, 0), left = project(-x - .035,0), right = project(x + .035,0);
    bg.fillStyle = '#09251e'; bg.fillRect(left.x, middle.y - 4, right.x - left.x, 8);
    bg.strokeStyle = '#eaf2d7d9'; bg.lineWidth = 2.5; bg.beginPath(); bg.moveTo(left.x,middle.y - 2); bg.lineTo(right.x,middle.y - 2); bg.stroke();
    bg.strokeStyle = '#9dbca880'; bg.lineWidth = 1; bg.beginPath(); bg.moveTo(left.x,middle.y + 3); bg.lineTo(right.x,middle.y + 3); bg.stroke();
    for (const post of [left,right]) { bg.fillStyle = '#b8d3b7'; bg.fillRect(post.x - 2, middle.y - 8, 4, 17); }
    const word = project(0, z * .65);
    text(bg, 'RALLY', word.x, word.y, '#e1edcf0b', clamp(scaleX * .18, 23, 52), 'center', 800);
    const topWord = project(0, -z * .62);
    text(bg, 'SWIPE / DUEL', topWord.x, topWord.y, '#d6ebd12d', width < 500 ? 7 : 9, 'center', 650);
  }
  function resize() {
    const rect = canvas.getBoundingClientRect(), nextRatio = Math.min(window.devicePixelRatio || 1, 2);
    if (rect.width === width && rect.height === height && ratio === nextRatio) return;
    width = rect.width; height = rect.height; ratio = nextRatio;
    if (!width || !height) return;
    scaleZ = Math.max(1, (height - Math.min(78, height * .17)) / 3.90);
    scaleX = Math.max(1, (width - Math.min(18, width * .045)) / 2.55);
    centerY = height * .5;
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    backdrop.width = canvas.width; backdrop.height = canvas.height; paintBackdrop();
  }
  function directionOf(paddle, side) {
    return Math.hypot(paddle.vx || 0, paddle.vz || 0) > .16 ? Math.atan2(paddle.vz, paddle.vx) : side === 1 ? -Math.PI / 2 : Math.PI / 2;
  }
  function paddleShape(paddle, side, language) {
    if (!paddle) return;
    const radius = paddle.radius ?? COURT.paddleRadius, point = project(paddle.x,paddle.z), color = side === 1 ? CORAL : MINT;
    const velocity = Math.hypot(paddle.vx || 0, paddle.vz || 0), angle = directionOf(paddle,side);
    ellipse(ctx, {x:point.x + 1,y:point.y + 6}, radius * scaleX, radius * scaleZ, '#001b1680');
    ctx.save(); ctx.translate(point.x, point.y); ctx.scale(scaleX, scaleZ); ctx.rotate(angle);
    // The blade edge is the exact collision circle; the dark handle is secondary.
    ctx.beginPath(); ctx.roundRect(-radius * 1.85,-radius * .19,radius * 1.08,radius * .38,radius * .10); ctx.fillStyle = '#805f4580'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI * 2); ctx.fillStyle = '#ddbe92'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,0,radius * .955,0,Math.PI * 2); ctx.fillStyle = color; ctx.fill();
    ctx.beginPath(); ctx.arc(-radius * .025,-radius * .04,radius * .79,0,Math.PI * 2); ctx.strokeStyle = '#fff9e533'; ctx.lineWidth = .005; ctx.stroke();
    ctx.beginPath(); ctx.arc(0,0,radius * .87,-.79,.79); ctx.strokeStyle = '#fff7e5bc'; ctx.lineWidth = .012; ctx.stroke();
    if (velocity > .35) {
      ctx.beginPath(); ctx.moveTo(radius * .34,0); ctx.lineTo(radius * .70,0); ctx.moveTo(radius * .54,-radius * .13); ctx.lineTo(radius * .70,0); ctx.lineTo(radius * .54,radius * .13); ctx.strokeStyle = '#16372b66'; ctx.lineWidth = .010; ctx.stroke();
    }
    ctx.restore();
    const mark = side === 1 ? (language === 'en' ? 'YOU' : '你') : 'AI';
    text(ctx, mark, point.x, point.y + side * (radius * scaleZ + 16), `${color}c0`, width < 500 ? 8 : 9, 'center', 700);
  }
  function drawPaddleTrails() {
    for (const [key,color] of [['player','245,139,112'],['opponent','177,228,203']]) {
      const points = paddleTrails[key];
      for (let i=1;i<points.length;i++) {
        const a=project(points[i-1].x,points[i-1].z), b=project(points[i].x,points[i].z), life=clamp(1-(now-points[i].at)/.17,0,1);
        ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=`rgba(${color},${life*.14})`;ctx.lineWidth=Math.max(1,12*life);ctx.lineCap='round';ctx.stroke();
      }
    }
    ctx.lineCap='butt';
  }
  function drawBallTrail() {
    for (let i=1;i<trail.length;i++) {
      const a=project(trail[i-1].x,trail[i-1].z),b=project(trail[i].x,trail[i].z),life=clamp(1-(now-trail[i].at)/.24,0,1);
      const color=trail[i].hitter===1?'247,164,128':'207,242,210';
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=`rgba(${color},${life*.37})`;ctx.lineWidth=1+life*2;ctx.lineCap='round';ctx.stroke();
    }
    ctx.lineCap='butt';
  }
  function ballShape(ball, clock) {
    if (!ball) return;
    const point=project(ball.x,ball.z), radius=COURT.ballRadius, rx=radius*scaleX, ry=radius*scaleZ, bodyRadius=Math.max(4.5,ry);
    ellipse(ctx,{x:point.x + 1,y:point.y + 5},rx*.94,ry*.66,'#061c18a0');
    ctx.save();
    if (slow) {
      const pulse=1+.05*Math.sin(now*7);
      ellipse(ctx,point,rx*3.7*pulse,ry*3.7*pulse,'#fff0bc0b','#f3dda84d',1);
      ellipse(ctx,point,rx*2.2,ry*2.2,'#fff3d91f');
    }
    // A round sphere stays readable; the ellipse marks its planar collision footprint.
    ellipse(ctx,point,rx,ry,'#fff9d70d','#fff9dd24',.7);
    ctx.shadowColor='#fff9dc82';ctx.shadowBlur=slow?16:10;
    const light=ctx.createRadialGradient(point.x-bodyRadius*.25,point.y-bodyRadius*.35,0,point.x,point.y,bodyRadius);
    light.addColorStop(0,'#fffef4');light.addColorStop(.6,CREAM);light.addColorStop(1,'#dbd6b7');
    ellipse(ctx,point,bodyRadius,bodyRadius,light,'#fff9e7cb',.65);ctx.restore();
    const spin=Number.isFinite(ball.spin)?ball.spin:0;
    if (Math.abs(spin)>.08) {
      ctx.save();ctx.translate(point.x,point.y);ctx.scale(bodyRadius,bodyRadius);ctx.rotate(clock*spin*2);
      ctx.beginPath();ctx.arc(0,0,.55,-.75,.75);ctx.strokeStyle='#809e823b';ctx.lineWidth=.17;ctx.stroke();ctx.restore();
    }
    ellipse(ctx,{x:point.x-bodyRadius*.24,y:point.y-bodyRadius*.30},bodyRadius*.17,bodyRadius*.17,'#ffffffd9');
  }
  function drawEffects(language) {
    for (const effect of effects) {
      const age=now-effect.at, duration=effect.type==='hit'?.45:.55;
      if(age<0||age>duration)continue;
      const life=1-age/duration,p=project(effect.x,effect.z),color=effect.side===1?CORAL:MINT;
      ctx.save();ctx.globalAlpha=life*.72;
      if(effect.type==='hit') {
        const radius=.05+age*.43;
        ellipse(ctx,p,radius*scaleX,radius*scaleZ,null,color,1.5);
        const direction=Math.atan2(effect.vz||0,effect.vx||0), strength=clamp(effect.power??.5,0,1);
        for(let j=-1;j<=1;j++) {
          const angle=direction+j*.33, distance=.06+age*(.60+strength*.7);
          const a=project(effect.x+Math.cos(angle)*distance*.55,effect.z+Math.sin(angle)*distance*.55),b=project(effect.x+Math.cos(angle)*distance,effect.z+Math.sin(angle)*distance);
          ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.strokeStyle=j===0?CREAM:color;ctx.lineWidth=j===0?2:1;ctx.stroke();
        }
        if(effect.side===1&&strength>.72&&age<.36)text(ctx,language==='en'?'DRIVE':'強擊',p.x,p.y-25,color,9,'center',700);
      } else if (effect.type==='wall') {
        ellipse(ctx,p,(.025+age*.22)*scaleX,(.025+age*.22)*scaleZ,null,CREAM,1);
      }
      ctx.restore();
    }
  }
  function consumeEvents(match) {
    for (const event of pending) {
      if (['ready','serve','point','over','reset'].includes(event.type)) trail=[];
      if (event.type==='hit'||event.type==='wall') {
        const x=Number.isFinite(event.x)?event.x:match.ball?.x,z=Number.isFinite(event.z)?event.z:match.ball?.z;
        if(Number.isFinite(x)&&Number.isFinite(z))effects.push({...event,x,z,at:Number.isFinite(event.at)?event.at:now});
      }
    }
    pending=[];
  }
  function record(match, paused) {
    if(paused)return;
    if(match.ball&&match.phase==='rally'&&(!trail.length||now-trail.at(-1).at>=.012))trail.push({...match.ball,at:now});
    for(const key of ['player','opponent']) {
      const paddle=match[key],points=paddleTrails[key];
      if(paddle&&Math.hypot(paddle.vx||0,paddle.vz||0)>.3&&(!points.length||now-points.at(-1).at>=.014))points.push({x:paddle.x,z:paddle.z,at:now});
      paddleTrails[key]=points.filter(point=>now-point.at<.17).slice(-18);
    }
    trail=trail.filter(point=>now-point.at<.24).slice(-24);effects=effects.filter(effect=>now-effect.at<.6).slice(-12);
  }

  const observer=new ResizeObserver(resize);observer.observe(canvas);
  resize();
  return {
    resize,project,
    get dimensions(){return {width,height,scaleX,scaleZ};},
    get bounds(){const a=project(-COURT.halfWidth,-COURT.halfLength),b=project(COURT.halfWidth,COURT.halfLength);return {left:a.x,top:a.y,right:b.x,bottom:b.y};},
    screenToWorld(clientX,clientY){resize();const rect=canvas.getBoundingClientRect();return {x:(clientX-rect.left-width/2)/scaleX,z:(clientY-rect.top-centerY)/scaleZ};},
    reset(){trail=[];paddleTrails={player:[],opponent:[]};effects=[];pending=[];previousPhase='idle';slow=false;},
    event(event){pending.push({...event});if(pending.length>30)pending.shift();},
    render(match,options={}) {
      resize();if(!width||!height)return;
      now=Number.isFinite(match.wallClock)?match.wallClock:match.clock??0;
      slow=match.phase==='rally'&&match.timeScale<.99;
      if(previousPhase!==match.phase&&match.phase!=='rally')trail=[];
      previousPhase=match.phase;consumeEvents(match);record(match,options.paused);
      ctx.clearRect(0,0,width,height);ctx.drawImage(backdrop,0,0,width,height);
      drawPaddleTrails();drawBallTrail();drawEffects(options.language);
      paddleShape(match.opponent,-1,options.language);paddleShape(match.player,1,options.language);
      ballShape(match.ball,match.gameClock??match.clock??now);
    },
  };
}
