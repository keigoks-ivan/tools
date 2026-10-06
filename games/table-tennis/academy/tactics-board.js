// Authored teaching diagrams. Coordinates and timings are illustrative, not video tracking.
const scenarios = {
  short: {
    title: ['短球：上步，送球，再退回', 'Short ball: step in, return, recover'],
    description: ['短球不只是在台內伸手。先把腳帶向球，接發時選擇可控制的落點，再退出台邊，為下一板留空間。', 'A short receive starts with positioning. Move toward the ball, choose a controlled placement and step away from the table to make room for the next return.'],
    steps: [
      ['讀長短', 'Read length', '先分辨球是否會在己方台面再落一次。圖中來球只是短球教學示例，不是合法發球過程的重建。', 'Read whether the ball would bounce again on your half. This incoming route illustrates a short ball, not a reconstructed legal service.'],
      ['上步到位', 'Step in', '前腳靠近台邊，讓觸球點在身體前方。腳步帶近距離，手臂才不必勉強伸長。', 'Bring the front foot toward the table so the contact stays in front. Footwork closes the gap before the arm reaches.'],
      ['選擇落點', 'Choose placement', '送向空檔是這個情境的目標。低球可用推切；有高度與空間時才考慮擰拉，這條平面球路不辨別實際旋轉。', 'The open space is the target here. Push a low ball; consider a flick when height and room permit. A plan-view route does not identify actual spin.'],
      ['退出台邊', 'Move out', '接完不要停在台內。用短步退回可左右移動的位置，球拍回到身前。', 'Do not remain over the table after returning. Take a short recovery step to a position that allows movement in either direction.'],
      ['準備下一板', 'Read the next ball', '恢復站位不是回到固定中心，而是依剛才落點與對手可能的回球方向補位。', 'Recovery is not a fixed return to the middle. Cover the likely reply created by your placement.'],
    ],
    routes: [[[350,100],[315,409],[299,474]], [[299,474],[394,160],[419,102]], [[419,102],[370,425],[400,530]]],
    near: [[320,558],[299,524],[299,524],[341,555],[365,556]], far: [[350,47],[350,47],[389,47],[404,47],[390,47]],
    target: [394,160], topics: ['receive','push','flick','footwork'], frameTopic: 'receive', spin: ['短球來球', 'Short incoming ball'],
  },
  change: {
    title: ['長球：先壓住，再改變線路', 'Long ball: establish pressure, then change the line'],
    description: ['先把一側打清楚，觀察對手是否偏向那裡，再把下一板送到另一側。落點改變時，自己的還原方向也要跟著改。', 'Establish a placement and read whether the opponent shifts toward it. Send the next ball to the other side, then recover for the new angle.'],
    steps: [
      ['先讀站位', 'Read the position', '球出台時留出揮拍空間。先看對手的位置，別在球還沒到時就決定全力變線。', 'Make room for a long ball and read the opponent. Avoid deciding on a full-power change before the ball arrives.'],
      ['建立壓迫', 'Establish pressure', '第一板送回可連續銜接的一側，重點是把球打到有目的的位置，而非每一板都追求邊線。', 'Place the first return on a side you can sustain. Purposeful placement matters more than aiming at an edge on every ball.'],
      ['等待可用球', 'Wait for the opportunity', '腳步隨來球做小幅調整。對手被帶往一側，仍須先確認自己站穩、來球高度足夠。', 'Adjust with small steps. Even when the opponent moves to one side, check your balance and the incoming height first.'],
      ['改送另一側', 'Change the line', '示意目標區顯示另一側空間。變線會改變下一板的角度，擊球後要即刻補回可能被打開的空檔。', 'The marked zone shows space on the other side. A new line creates a new reply angle; cover the opening immediately.'],
      ['跟隨落點還原', 'Recover with the placement', '還原點跟著戰術走。不要把變線理解成只扭手腕，也不要在擊球後停住看球。', 'Let placement guide recovery. A change of line is more than a wrist twist; keep moving after contact.'],
    ],
    routes: [[[400,101],[272,438],[250,526]], [[250,526],[285,160],[251,102]], [[251,102],[284,438],[265,526]], [[265,526],[399,182],[430,102]]],
    near: [[309,558],[276,558],[276,558],[284,558],[342,558]], far: [[390,47],[304,47],[277,47],[287,47],[412,47]],
    target: [399,182], topics: ['tactics','forehand','backhand','footwork'], frameTopic: 'forehand', spin: ['連續落點', 'Sustained placement'],
  },
  lift: {
    title: ['下旋起板：先站穩，再接下一板', 'Opening against backspin: balance before the next ball'],
    description: ['低的下旋長球需要向前上方的摩擦與可控速度。起板不代表這個回合已結束：對手回球更快，下一次準備要提早開始。', 'A low, long backspin ball calls for a controlled forward-and-upward action. The opening does not finish the rally; prepare early for the quicker reply.'],
    steps: [
      ['辨識來球', 'Read the incoming ball', '本情境預先設定來球為下旋。實戰要綜合對手動作、球路與落桌反應判讀，不能只靠俯視線條。', 'Backspin is an authored condition here. In play, read the opponent, flight and bounce together; a plan-view line cannot establish spin.'],
      ['調整站位', 'Set the position', '留出觸球空間，膝髖協調降低重心。腳步點只表示站位方向，不是量測到的膝角或重心高度。', 'Make room and lower the stance with coordinated knees and hips. The dots show positioning, not measured knee angles or centre-of-mass height.'],
      ['摩擦起板', 'Open with topspin', '先以摩擦和過網穩定性建立進攻。2D 圖中目標是較深落點；向上發力的動作與實際球高須回到教學文字和影片核對。', 'Use spin and reliable clearance to establish the attack. The diagram targets depth; upward action and real height need the lesson and footage for context.'],
      ['收拍就準備', 'Prepare as you finish', '起板後把球拍帶回身前，不再維持低球起板的大引拍，改為能銜接上旋回球的準備。', 'Bring the paddle in front as you finish. Do not retain the large preparation used for the low ball; reset for the topspin reply.'],
      ['銜接回合', 'Continue the rally', '跟著對手回球移位，保留正反手選擇。這個示例呈現銜接目的，不代表兩位選手的實際使用率。', 'Move with the reply and keep both strokes available. This illustrates the purpose of a transition, not either player’s measured frequency.'],
    ],
    routes: [[[365,102],[283,440],[266,526]], [[266,526],[390,159],[424,102]], [[424,102],[383,431],[409,531]]],
    near: [[320,558],[280,558],[280,558],[336,558],[379,558]], far: [[365,47],[365,47],[408,47],[416,47],[390,47]],
    target: [390,159], topics: ['forehand','backhand','tactics'], frameTopic: 'forehand', spin: ['下旋 → 上旋起板', 'Backspin → topspin opening'],
  },
};
const topicNames = { receive:['接發球','Receive'], push:['推切','Push'], flick:['擰拉','Flick'], footwork:['步法','Footwork'], tactics:['戰術','Tactics'], forehand:['正手','Forehand'], backhand:['反手','Backhand'] };
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t=clamp(value); return t*t*(3-2*t); };
const interpolate = (a,b,t) => a.map((v,i)=>v+(b[i]-v)*t);
const routePoint = (points,t) => { const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1])), total=lengths.reduce((a,b)=>a+b,0); let distance=clamp(t)*total; for(let i=0;i<lengths.length;i++){if(distance<=lengths[i]||i===lengths.length-1)return interpolate(points[i],points[i+1],distance/lengths[i]);distance-=lengths[i];}return points.at(-1); };

export function createTacticsBoard(getLanguage) {
  const $=id=>document.getElementById(id), root=$('tacticsBoard');
  let selected='short', playing=!matchMedia('(prefers-reduced-motion: reduce)').matches, progress=0, previous=performance.now(), visible=false, currentStep=-1;
  const duration=8, index=()=>getLanguage()==='zh'?0:1, text=values=>values[index()];
  root.innerHTML=`<svg viewBox="0 0 640 630" role="img" aria-labelledby="boardSvgTitle boardSvgDescription"><title id="boardSvgTitle"></title><desc id="boardSvgDescription"></desc><defs><pattern id="courtGrid" width="40" height="40" patternUnits="userSpaceOnUse"><path d="M40 0H0V40" fill="none" stroke="#93b6a316" stroke-width="1"/></pattern></defs><rect x="68" y="14" width="504" height="601" fill="url(#courtGrid)"/><rect x="110" y="21" width="420" height="584" rx="2" fill="none" stroke="#8fac9740"/><rect x="208" y="100" width="224" height="402" rx="1" fill="#386958" stroke="#d4e9da" stroke-width="3"/><path d="M320 100V502" fill="none" stroke="#d4e9da" stroke-width="1.5"/><rect x="197" y="295" width="246" height="12" fill="#d0e0c6"/><path d="M198 299H444M198 303H444" stroke="#446654" stroke-width="1"/><g id="boardTarget"><circle r="33" fill="#f3bf7530" stroke="#f0bb7d" stroke-width="1.5" stroke-dasharray="5 5"/><circle r="4" fill="#f0bb7d"/></g><g id="boardRoutes"></g><g id="boardFeet"></g><g id="boardFar"><circle r="17" fill="#b6ddc5" stroke="#e5f0df" stroke-width="2"/><text text-anchor="middle" y="5" font-size="13" font-family="Arial" fill="#183a31">2</text></g><g id="boardNear"><circle r="18" fill="#ee8967" stroke="#f4cab2" stroke-width="2"/><text text-anchor="middle" y="5" font-size="13" font-family="Arial" fill="#183a31">1</text></g><g id="boardBall"><circle r="12" fill="#ffddba" opacity=".12"/><circle r="6" fill="#fff2d8" stroke="#f3a572" stroke-width="1.5"/></g><text id="boardFarName" x="320" y="79" text-anchor="middle" font-size="11" fill="#bad4c3" font-family="Arial"></text><text id="boardNearName" x="320" y="597" text-anchor="middle" font-size="11" fill="#bad4c3" font-family="Arial"></text><text id="boardSpin" x="89" y="321" fill="#dfb491" font-size="10" font-family="Arial" transform="rotate(-90 89 321)"></text></svg>`;
  const mapPoint = point => $('boardPlayer').value==='lin' ? [640-point[0],point[1]] : point;
  const move = (id,point) => {const [x,y]=mapPoint(point);$(id).setAttribute('transform',`translate(${x} ${y})`);};
  const path = points => points.map((p,i)=>`${i?'L':'M'}${mapPoint(p).join(' ')}`).join(' ');
  function draw() {
    const scenario=scenarios[selected], step=Math.min(4,Math.floor(progress*5)), routePosition=progress*scenario.routes.length, routeIndex=Math.min(scenario.routes.length-1,Math.floor(routePosition)), routeProgress=routePosition-routeIndex;
    move('boardBall',routePoint(scenario.routes[routeIndex],routeProgress));
    for(const [side,id] of [['near','boardNear'],['far','boardFar']]){const phase=progress*4, part=Math.min(3,Math.floor(phase));move(id,interpolate(scenario[side][part],scenario[side][part+1],smooth(phase-part)));}
    $('boardRoutes').querySelectorAll('path').forEach((node,i)=>{node.setAttribute('stroke',i===routeIndex?'#f09671':'#96baa1');node.setAttribute('opacity',i===routeIndex?'.95':i<routeIndex?'.38':'.12');node.setAttribute('stroke-width',i===routeIndex?'3':'1.5');});
    $('boardTimeline').value=Math.round(progress*1000);$('boardTime').textContent=`${(progress*duration).toFixed(1)}s`;
    if(currentStep!==step){currentStep=step;stepLabels();}
  }
  function stepLabels() {
    const step=scenarios[selected].steps[Math.max(0,currentStep)], lang=index();
    $('boardStepNumber').textContent=String(currentStep+1).padStart(2,'0');$('boardStep').textContent=step[lang];$('boardExplanation').textContent=step[lang+2];
    $('boardSteps').querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===currentStep)));
  }
  function labels() {
    const scenario=scenarios[selected], names={short:['短球接發','Short receive'],change:['長球變線','Change the line'],lift:['下旋起板','Open against backspin']};
    $('boardScenarios').innerHTML=Object.keys(scenarios).map(id=>`<button data-board-scenario="${id}" aria-pressed="${id===selected}">${text(names[id])}</button>`).join('');
    $('boardTitle').textContent=text(scenario.title);$('boardDescription').textContent=text(scenario.description);$('boardSpin').textContent=text(scenario.spin);
    $('boardPlay').textContent=playing?text(['暫停','Pause']):text(['播放','Play']);$('boardTimeline').setAttribute('aria-label',text(['教學情境時間','Teaching scenario timeline']));
    $('boardSteps').innerHTML=scenario.steps.map((step,i)=>`<button data-board-step="${i}" aria-pressed="${i===currentStep}" aria-label="${step[index()]}">${String(i+1).padStart(2,'0')}</button>`).join('');
    const near=$('boardPlayer').value==='lin';$('boardNearName').textContent=text(near?['1 / 林 · 左手教學角色','1 / Lin · left-handed example']:['1 / 張本 · 右手教學角色','1 / Harimoto · right-handed example']);$('boardFarName').textContent=text(['2 / 假想對手','2 / Illustrative opponent']);
    $('boardSvgTitle').textContent=text(scenario.title);$('boardSvgDescription').textContent=text(['俯視球桌，以球路、腳步與目標區示意一個教學情境。不是影片追蹤。','A plan-view table with illustrative routes, footwork and a target area. This is not video tracking.']);
    $('boardReferenceLinks').innerHTML=scenario.topics.map(id=>`<a href="#lesson-${id}">${text(topicNames[id])} →</a>`).join('')+`<a href="#frame-study" data-frame-topic="${scenario.frameTopic}">${text(['原始影格對照','Compare the original frames'])} →</a>`;
    stepLabels();
  }
  function configure(id=selected) {
    selected=scenarios[id]?id:'short';progress=0;currentStep=0;
    const scenario=scenarios[selected];move('boardTarget',scenario.target);
    $('boardRoutes').innerHTML=scenario.routes.map(points=>`<path d="${path(points)}" fill="none" stroke="#f09671" stroke-width="2" stroke-linejoin="round"/>`).join('');
    $('boardFeet').innerHTML=['near','far'].map(side=>`<path d="${path(scenario[side])}" fill="none" stroke="#b9dfc2" stroke-width="1.5" stroke-dasharray="4 6" opacity=".6"/>${scenario[side].map(point=>{const [x,y]=mapPoint(point);return `<circle cx="${x-7}" cy="${y+19}" r="3" fill="#b9dfc2" opacity=".35"/><circle cx="${x+7}" cy="${y+19}" r="3" fill="#b9dfc2" opacity=".35"/>`;}).join('')}`).join('');
    labels();draw();
  }
  $('boardScenarios').addEventListener('click',event=>{const button=event.target.closest('[data-board-scenario]');if(button)configure(button.dataset.boardScenario);});
  $('boardSteps').addEventListener('click',event=>{const button=event.target.closest('[data-board-step]');if(button){playing=false;progress=(Number(button.dataset.boardStep)+.05)/5;currentStep=-1;draw();labels();}});
  $('boardPlay').addEventListener('click',()=>{playing=!playing;labels();});
  $('boardTimeline').addEventListener('input',()=>{playing=false;progress=Number($('boardTimeline').value)/1000;currentStep=-1;draw();labels();});
  $('boardPlayer').addEventListener('change',()=>configure());
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;}).observe(root.closest('.tactics-shell'));
  configure();
  function frame(now){requestAnimationFrame(frame);const dt=Math.min((now-previous)/1000,.08);previous=now;if(!playing||!visible||document.hidden)return;progress=(progress+dt*Number($('boardSpeed').value)/duration)%1;draw();}
  requestAnimationFrame(frame);
  return { setLanguage:labels, select:(stroke,player)=>{if(['lin','harimoto'].includes(player))$('boardPlayer').value=player;configure(['flick','push','serve','receive'].includes(stroke)?'short':['forehand','backhand'].includes(stroke)?'lift':'change');} };
}
