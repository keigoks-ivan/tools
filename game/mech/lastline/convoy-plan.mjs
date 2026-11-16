const validClue = value => value === 'shift-log' || value === 'fax-copy' ? value : null;

export function customsClueForEscort(operations, checkpoint) {
  // 第四章檢查點的車隊位置要配回當時的道路。舊快照沿用原路。
  return validClue(checkpoint?.chapter === 4 ? checkpoint.customsClue : operations?.customsClue);
}

export function customsConvoyConfig(base, clue) {
  if (base.chapter !== 4 || !validClue(clue)) return base;
  const waves = [...base.waves], transfer = waves[2];
  const seconds = transfer.operation.points[0].seconds;
  if (clue === 'shift-log') {
    const stop = [600, -120];
    waves[2] = {
      ...transfer, title: '海側轉運道', obj: '海側轉運道', sub: '沿東側護送車隊，掩護岸邊轉車',
      go: [...stop, transfer.go[2]], cp: [578, -120, Math.PI / 2],
      list: [['grunt', 548, -150], ['heli', 590, -220, 70], ['heavy', 650, -40]],
      reinforce: [['grunt', 662, -200]],
      talk: [['白鷺', '值勤紀錄標出了東側貨運道的換班時間。米拉，沿海側轉運道走，繞開筒倉。']],
      lines: [['米拉', '兩輛車都到了。靠岸邊月台先轉移傷員，蒼焰，幫我們守住路口。']],
      operation: { ...transfer.operation, points: [Object.assign([607, -120], { label: '掩護海側月台轉車', seconds })] },
    };
    const route = [...base.route]; route[2] = stop;
    return { ...base, customsClue: clue, route, waves };
  }
  waves[2] = {
    ...transfer, title: '筒倉維修接應', obj: '筒倉維修接應', sub: '守住車隊，掩護港務維修組',
    talk: [['白鷺', '傳真底聯的識別號對上了港務備件單。維修組帶著備件，在筒倉岸線等車隊。']],
    lines: [...transfer.lines, ['米拉', '維修組拿到備件了。守住這一段，他們就能補好車隊的耐久。']],
    operation: { ...transfer.operation, convoyRepair: 25,
      points: transfer.operation.points.map(point => Object.assign([...point], { label: '掩護港務維修組', seconds: point.seconds })) },
  };
  return { ...base, customsClue: clue, waves };
}
