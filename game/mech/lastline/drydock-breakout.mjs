export function drydockBreakoutConfig(base, checkpoint = {}) {
  return {
    chapter: 4, breakout: true, name: '修船棚突圍', en: 'DRYDOCK BREAKOUT', label: '機甲序章　修船棚突圍',
    mission: base.mission, keys: base.keys, touch: base.touch, flee: base.flee, bossDown: base.bossDown,
    support: checkpoint.support, customsClue: checkpoint.customsClue ?? null,
    start: { x: 40, z: 89, yaw: Math.PI, lines: [
      ['白鷺', '系統回來了，蒼焰。從南側大門離棚，走吊車軌道。'],
      ['米拉', '兩輛救護車都留在貨運道。雷達把我們鎖在原地，再開下去會把敵機引過來。'],
    ] },
    restart: { x: 40, z: 89, yaw: Math.PI },
    goal: ['駕駛蒼焰離開修船棚', '從前方的南門出棚，打開接應路'],
    waves: [
      {
        title: '奪回吊車配電站', sub: '清除巡邏機，接通岸線中繼', obj: '接通吊車配電站',
        go: [40, 38, 12], cp: [40, 43, Math.PI], music: 4,
        list: [['grunt', 20, 15], ['grunt', 62, 15]],
        lines: [['白鷺', '這座配電站還有電。近地接通控制箱，我就能用港口的備用頻道。', true]],
        operation: { kind: 'console', radius: 11, points: [Object.assign([40, 32], { label: '接通吊車配電站', seconds: 3.5 })] },
      },
      {
        title: '奪回港區頻道', sub: '起飛並守住空中中繼區，擊落攔截直升機', obj: '守住空中中繼區',
        go: [138, 38, 32], cp: [126, 38, Math.PI / 2], music: 5, repair: .12,
        list: [['heli', 144, 14, 48], ['heli', 162, -25, 46]],
        talk: [['白鷺', '備用頻道通了，低處還是被貨櫃擋住。沿軌道去下一個標記，再起飛。']],
        lines: [['白鷺', '升到約三十四公尺，留在中繼區。你守住這幾秒，我把撤離訊號傳出去。', true], ['獵犬港區分隊', '偵測到未授權頻道。兩架攔截機，切斷中繼。']],
        operation: { kind: 'defend', radius: 15, points: [Object.assign([138, 38], { altitude: 34, label: '掩護空中訊號中繼', seconds: 9 })] },
      },
      {
        title: '打通接應路口', sub: '降到貨運道，擊退封鎖部隊並守住接應點', obj: '守住地面接應點',
        go: [163, -105, 30], cp: [153, -97, Math.PI], music: 5, repair: .16,
        list: [['heavy', 202, -88], ['grunt', 183, -100]],
        talk: [['米拉', '收到訊號了。兩輛車都在貨運道，重裝機卡在路口。我們等你打通再過去。']],
        lines: [['零號', '蒼焰落地。米拉，等我確認路口，再開車。', true]],
        operation: { kind: 'defend', radius: 24, points: [Object.assign([170, -120], { label: '守住車隊接應點', seconds: 10 })] },
      },
    ],
    down: [['白鷺', '回到最後一個安全點。重來一次，我們得把兩輛車都接出來。']],
    clear: ['接應路口已打通', '貨運醫療車開始移動'],
    end: [['零號', '米拉，來吧。路口我守住了。'], ['米拉', '收到。一號車發動，二號車跟在後面。六十四個人都在車上。']],
    fin: ['兩輛車都到了', '第 4 章　最後一班撤離車'],
  };
}
