const footRewards = [
  'alarm', 'permit', 'engineer', 'evidence', 'medics', 'medicine', 'manifest', 'power',
  'relay', 'frequency', 'auth', 'crane', 'cooling', 'boot', 'crew',
];
const vehicleRewards = [
  'oxygen-reserve', 'safe-cargo', 'channel-warning', 'quiet-channel', 'ground-crew', 'shuttle-tools',
];

export function escortSupport(ledger, savedProfile) {
  const source = savedProfile === undefined ? ledger : savedProfile, support = {};
  for (const id of footRewards) if (source?.[id] === true) support[id] = true;
  if (Array.isArray(source?.vehicleSupport)) {
    const earned = vehicleRewards.filter(id => source.vehicleSupport.includes(id));
    if (earned.length) support.vehicleSupport = earned;
  }
  const receipt = source?.broadcast;
  if (typeof receipt?.evidence === 'boolean' && typeof receipt.manifest === 'boolean') {
    support.broadcast = { evidence: receipt.evidence, manifest: receipt.manifest };
  }
  return support;
}

function adjustPoint(waves, wave, index, seconds, label = waves[wave].operation.points[index].label) {
  const W = waves[wave], points = [...W.operation.points], point = points[index];
  points[index] = Object.assign([...point], point, { seconds, label });
  waves[wave] = { ...W, operation: { ...W.operation, points } };
}

function addRadio(waves, index, speaker, text) {
  const W = waves[index];
  waves[index] = { ...W, lines: [...W.lines, [speaker, text, true]] };
}

export function applyEscortSupport(config, support) {
  const waves = [...config.waves];
  const plan = { ...config, support, waves, start: { ...config.start, lines: config.start.lines.map(line => [...line]) } };
  const sideMissions = support.vehicleSupport || [];
  const drydock = support.crane && support.cooling && support.boot;
  const groundCrew = sideMissions.includes('ground-crew');
  const tools = sideMissions.includes('shuttle-tools');
  const repair = (drydock ? .06 : 0) + (groundCrew ? .04 : 0) + (tools ? .02 : 0);
  if (repair) {
    for (let i = 1; i < waves.length; i++) {
      waves[i] = { ...waves[i], repair: Math.min(.33, waves[i].repair + repair) };
    }
    const supplies = drydock && (groundCrew || tools) ? '修船棚和地面隊的備料' : drydock ? '修船棚的備料' : '接駁隊交來的備料';
    addRadio(waves, 1, '白鷺', `${supplies}都在。每到安全路口，蒼焰可以多修一些裝甲。`);
  }

  if (config.chapter === 4 && support.alarm) {
    const W = waves[1];
    waves[1] = { ...W, reinforce: W.reinforce.slice(0, -1) };
    addRadio(waves, 1, '白鷺', '海關警報斷線了。貨櫃場的第二支增援還沒收到呼叫。');
  }

  if (config.chapter === 5) {
    const record = support.evidence ? '清除命令原始簽章' : '海關現場紀錄';
    const payload = support.manifest ? `${record}和轉運名單` : record;
    plan.start.lines[2] = ['白鷺', `到兩座現場控制站，把${payload}送到城外。`];
    plan.goal = [`把${record}傳到城外`, config.goal[1]];
    plan.end = [['白鷺', `港外收到${payload}了。出口電源還在砲陣手裡。`], ...config.end.slice(1)];
    if (!support.evidence) plan.fin = ['港外收到廣播', config.fin[1]];
    adjustPoint(waves, 1, 0, support.evidence ? 4 : 6, support.evidence ? '上傳清除命令原始簽章' : '上傳海關現場紀錄');
    const upload = waves[1], defense = waves[2];
    waves[1] = { ...upload, lines: [['白鷺', '車隊到位。到路旁的控制站上傳紀錄，再接備援頻道。'], ...upload.lines.slice(1)] };
    if (!support.evidence) {
      waves[2] = { ...defense, lines: [defense.lines[0], ['零號', '城裡還有人。讓港外聽見。', true], ...defense.lines.slice(2)] };
    }
    if (support.evidence) addRadio(waves, 1, '白鷺', '海關原檔已核驗，接上控制站就能直接傳送。');
    if (support.relay) {
      adjustPoint(waves, 1, 1, 2, '接合港務預備頻道');
      addRadio(waves, 1, '楠', '港務站替你留了頻道。第二座控制站直接接上就好。');
    }
  }

  if (config.chapter === 6) {
    if (support.engineer) {
      adjustPoint(waves, 1, 0, 2, '依配電圖接通旁路');
      addRadio(waves, 1, '楠', '從鐵道帶出的配電圖派上用場了。第一座控制站用圖上標的迴路。');
    }
    if (support.crew) {
      adjustPoint(waves, 2, 0, 20);
      addRadio(waves, 2, '楠', '修船棚出來的地面隊已到對面接應。我們能更快過裝卸場。');
    }
  }

  if (config.chapter === 7) {
    if (support.permit) {
      adjustPoint(waves, 0, 0, 2, '西側・核對轉運授權');
      addRadio(waves, 0, '白鷺', '拘留室帶出的轉運授權可用在西側站。');
    }
    if (support.auth) {
      adjustPoint(waves, 0, 1, 2, '東側・用隼的備援離線驗證');
      addRadio(waves, 0, '白鷺', '東側站認得隼的備援授權，可以在本地完成驗證。');
    }
    const secondsSaved = (support.medics ? 4 : 0) + (support.manifest ? 4 : 0)
      + (sideMissions.includes('oxygen-reserve') ? 3 : 0) + (sideMissions.includes('safe-cargo') ? 2 : 0);
    if (secondsSaved) {
      const transfer = waves[1].operation.points[0];
      adjustPoint(waves, 1, 0, Math.max(17, transfer.seconds - secondsSaved));
      if (support.medics) addRadio(waves, 1, '米拉', '你救出的醫療隊在隔離區接手。我們兩輛車一起卸傷員。');
      if (support.manifest) addRadio(waves, 1, '米拉', '按海關名單的分組下車，接應隊已經點過名了。');
      if (sideMissions.includes('oxygen-reserve') || sideMissions.includes('safe-cargo')) {
        addRadio(waves, 1, '米拉', '裝甲車先送到的氧氣和物資就在隔離區，傷員可以直接交接。');
      }
    }
    if (support.broadcast) {
      const W = waves[2];
      waves[2] = { ...W, reinforce: W.reinforce.slice(0, -1) };
      addRadio(waves, 2, '白鷺', '港外收到廣播，救援隊封住側道。追來的第二隊增援被擋在外面。');
    }
  }

  return plan;
}
