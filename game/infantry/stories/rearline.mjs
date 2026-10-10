const b=(zh,en)=>({zh,en});
const radio=(speaker,zh,en)=>({speaker,text:b(zh,en)});

export const REARLINE_STORIES={
  underground:{
    title:b("熄燈之後，名字還在","When the Lights Go Out, the Names Remain"),
    deck:b("地下工廠失去主電源，封鎖命令卻仍在執行。灰線必須守住撤離通道，也替尚未離開的勞工保住能證明身分與責任的紀錄。","The underground works have lost main power, but their lockdown orders remain in force. Greyline must hold an evacuation route and preserve the records that establish the remaining workers' identities and the responsibility for their confinement."),
    timeLabel:b("撤離第六日・22:10","Evacuation, Day Six · 22:10"),
    location:b("東區地下工廠・升降機撤離廳與動力層","Eastern Underground Works · Evacuation Lift Hall and Machinery Level"),
    background:[
      {
        title:b("一張仍在生效的封鎖單","A Lockdown Order Still in Force"),
        paragraphs:[
          b("最後一部機甲離開地下入口時，履帶把積水推成兩條黑色的浪。鋼鐵黃昏分隊奉命支援地面撤離，留在這裡的步兵只分到備用電池、手寫平面圖與一份過時的輪班表。兩小時後主電源中斷，排風扇逐一停下，緊急照明把每個路口染成同樣的紅色。工廠原本用來隔離事故的封鎖命令，卻沒有隨著供電一起解除。",
            "The last mech drove away from the underground entrance, its tracks pushing the standing water into two black waves. The Iron Dusk detachment had orders to support the surface evacuation. The infantry left behind received spare batteries, a hand-drawn floor plan and an outdated shift roster. Two hours later, main power failed. Ventilation fans stopped one after another, and emergency lighting made every junction the same shade of red. The lockdown order originally intended to contain industrial accidents remained in effect."),
          b("夜班工程師周芷安在遠端電話裡說，封鎖並非單純故障。有人把軍事接管令寫進工廠的安全程序，讓仍在下層的人被列為不得離區的財產。值勤主管已經撤走，簽核欄只剩難以辨認的縮寫。灰線抵達時，升降機撤離廳還有斷續的通訊；工人看得見出口的位置，卻不知道誰有權准許他們使用那條路。",
            "Night engineer Zhou Zhi'an reported over a remote telephone that the lockdown was more than a malfunction. Someone had inserted a military takeover order into the factory's safety procedures, classifying those still below as property that could not leave the zone. The duty supervisors had already departed. Their signatures were reduced to illegible initials. When Greyline arrived, the evacuation lift hall still had intermittent communications. The workers knew where the exit lay, but no one knew who was authorized to let them use it.")
        ]
      },
      {
        title:b("工號後面的事情","What the Worker Numbers Conceal"),
        paragraphs:[
          b("陳隼接上的舊線路傳回一份勞工索引，裡面除了工號，還有欠薪、傷病、家屬聯絡方式和封鎖期間的缺勤紀錄。指揮部最初要求清掉整套資料，免得接管部隊利用地址追查人員；沈禾立即指出，失去紀錄的人也可能失去傷病證明與補償依據。保護隱私和保留證據都是真實的需要，沒有一句口號能把兩者合成同一件事。",
            "The old line Chen Sun restored carried an index of workers. Beyond their identification numbers, it contained unpaid wages, medical records, family contacts and absences recorded during the lockdown. Command initially requested that the entire archive be erased so the takeover force could not use its addresses to trace people. Shen He pointed out that erasing it could also destroy evidence of injury and claims for compensation. Privacy and evidence both mattered. A slogan could not make them the same thing."),
          b("林岳把爭議記進值勤簿，要求留存封鎖命令與責任人的簽核，私人資料則交由遠端文書分封保管。周芷安同意協助整理，但不替任何勞工放棄追索權，也不把完整名單公開在軍用頻道。這個決定已由現場勤務人員作出；灰線的工作，是讓通道與通訊能維持足夠久，使人員先脫離封鎖，證據也不必在槍聲中倉促銷毀。",
            "Lin Yue entered the dispute in the duty log. He asked that the lockdown orders and the responsible officials' approvals be preserved, while personal information was separated and sealed by clerks working remotely. Zhou agreed to help organize it. She would not waive anyone's right to seek redress, or broadcast the complete roster over a military channel. The duty personnel had made that decision. Greyline's task was to keep the route and communications open long enough for the workers to leave confinement without the evidence being hastily destroyed under fire.")
        ]
      },
      {
        title:b("灰線以下的聲音","Voices Below Greyline"),
        paragraphs:[
          b("進攻部隊正沿交會通道向動力層集中，狹窄路口把步槍聲反覆送回撤離廳。林岳把左右兩條通路交給隊員掩護，自己保留中央的觀察位置；沈禾只把確認過的傷員數交給地面醫療站，拒絕替失聯者寫上死亡。陳隼每隔一段時間重讀同一份名單，好讓電話另一端的人知道，這裡仍有人記得他們，而不是只記得設備編號。",
            "The attacking force was converging on the machinery level through intersecting passages. The narrow junctions carried rifle fire back into the evacuation hall again and again. Lin assigned his soldiers to cover the two side approaches and retained a central observation position. Shen reported only confirmed casualties to the surface aid station, refusing to mark missing people as dead. Chen periodically read the same roster back over the line, so those listening would know that someone here remembered them as people rather than equipment numbers."),
          b("值勤圖上標出兩條需要步兵負責的路線。一條以升降機撤離廳為中心，準備承受情報預估的四輪攻勢；另一條沿入口隔離門、動力機械區與封鎖控制台建立三段安全區域。工人撤離與資料整理由遠方人員回報，小隊眼前的每一段路仍要靠掩體、射界和彼此的呼應爭取。灰線接手的是這座工廠當下的命令，交接時間從此刻開始計算。",
            "The duty map marks two routes requiring infantry responsibility. One centers on the evacuation lift hall, preparing for the four attacks anticipated by intelligence. The other establishes three secure sectors through the isolation door, machinery bay and lockdown console. Personnel elsewhere report the evacuation and archive work. Every stretch before the squad still depends on cover, firing lanes and coordination. Greyline is taking responsibility for the factory's current orders. Its handover time begins now.")
        ]
      }
    ],
    cast:[
      {id:"lin",name:b("林岳","Lin Yue"),role:b("步兵班長","Squad Leader"),detail:b("林岳曾在工廠事故救援中帶班，知道一張安全命令如何救人，也如何被用來讓人無法離開。他把封鎖簽名抄進值勤簿，要求小隊先保住通路，任何責任都不能用停電作為事後的藉口。","Lin has led rescue teams during factory accidents. He knows how a safety order can save lives, and how it can be used to prevent people from leaving. He copies the lockdown approvals into his duty log and keeps the squad focused on the route. A blackout must not become an excuse that erases responsibility.")},
      {id:"shen",name:b("沈禾","Shen He"),role:b("隨隊軍醫","Squad Medic"),detail:b("沈禾從工人診療紀錄看見長期累積的傷病，反對把病歷當成需要一起清除的行政雜項。她在遠端確認醫療接收，也照料小隊；她堅持每個名字旁的狀態都必須有依據，不讓猜測變成永久紀錄。","Shen sees years of accumulated illness and injury in the workers' medical files. She opposes treating those records as administrative clutter to be erased. She confirms medical reception remotely while caring for the squad, and insists that every status written beside a name be supported by evidence rather than guesswork.")},
      {id:"chen",name:b("陳隼","Chen Sun"),role:b("通訊兵","Signals Specialist"),detail:b("陳隼熟悉老式工業線路，卻不把重新接通的電話當成可靠到可以省略核對的設備。他分開傳送人員索引與私人地址，逐筆讀回接收結果，並保存中斷時間，讓後續調查知道哪些空白來自斷線。","Chen understands old industrial wiring, but does not mistake a restored telephone for a reason to stop checking messages. He sends identity indexes separately from private addresses, reads acknowledgments back one by one, and records interruptions so later investigators can distinguish a communications gap from a missing entry.")},
      {id:"local",name:b("周芷安","Zhou Zhi'an"),role:b("工廠夜班工程師・遠端聯絡","Factory Night Engineer · Remote Contact"),detail:b("周芷安留在另一處值勤室整理輪班資料，靠備援電話與灰線聯絡。她知道工號與真人之間常隔著一個被漏填的欄位，願意作證說明封鎖程序，但要求保留勞工自行決定是否公開私人資料的權利。","Zhou remains in a separate duty room organizing shift records and contacts Greyline through a backup telephone. She knows that an omitted field can separate a worker number from a real person. She will testify about the lockdown procedure, while preserving the workers' right to decide whether their private information becomes public.")}
    ],
    stakes:[
      b("撤離廳一旦失守，下層人員的通訊與接收就會再度中斷，遠方醫療站也無法確認還有誰正在等待。","If the hall falls, communications and reception for those below will be interrupted again. The distant aid station will lose its ability to confirm who is still waiting."),
      b("勞工資料同時是保護與風險：人員地址需要保密，封鎖責任、欠薪與傷病證據則不能被一起抹去。","The archive offers protection and creates risk. Personal addresses need privacy, while evidence of confinement, unpaid wages and injury must not be erased with them."),
      b("機甲已奉命轉往地面，小隊必須用步兵的射界維持通路，不能把自己的責任交給尚未收到的救援承諾。","The mechs have orders on the surface. The squad must hold the route with infantry firing lanes, rather than entrusting its responsibility to a rescue promise that has not arrived.")
    ],
    defend:{
      brief:[
        b("升降機撤離廳是下層目前唯一仍有穩定回報的接收點。四輪攻勢將從不同通道逼近，灰線要守住廳前與左右路口，讓遠端勤務人員持續核對撤離名單。林岳要求看清側翼再換位；沈禾提醒你，補給與護盾恢復都需要時間，任何短暫安靜都不能當成整場戰鬥已經結束。",
          "The evacuation lift hall is the only reception point below that still provides consistent reports. Four attacks will approach through different passages. Greyline must hold the hall frontage and both junctions while duty personnel elsewhere check the evacuation roster. Lin asks the squad to examine its flanks before changing position. Shen warns that resupply and shield recovery take time. A brief silence does not mean the battle has ended."),
        b("周芷安正在別處把勞工索引與私人資料分開封存，陳隼只轉送核對所需的工號與接收狀態。廳前的安全區域一旦穩住，遠端勤務才能把接收與文書工作逐項進行。四輪攻勢全部停止後，撤離廳才有條件移交，值勤簿也必須如實記下誰守住了通路，以及為此付出的代價，讓下一班能接續尚未完成的責任。",
          "Elsewhere, Zhou is separating and sealing the worker index and private records. Chen relays only the identification numbers and reception statuses needed for verification. A secure hall frontage allows remote duty staff to continue reception and paperwork item by item. Only after all four attacks have ended can the hall be handed over. The duty log must accurately record who held the route and what it cost, so the next shift can continue the responsibilities still unfinished.")
      ],
      deploy:[
        radio("lin","灰線，升降機撤離廳由我們接手。先把兩側通道看住，遠端核對不能再斷。","Greyline, we're taking over the evacuation lift hall. Watch both passages. Remote verification must stay connected."),
        radio("local","這裡是周芷安，名單正在分封。你們守住廳前，我會逐筆回報接收狀態。","Zhou Zhi'an here. We're separating the records. Hold the hall frontage and I'll report reception statuses one by one.")
      ],
      stages:[
        [
          radio("chen","第一輪接觸確認，入口通道有步槍聲。撤離頻道仍通，先別讓中央射界堵住。","First contact confirmed. Rifles in the entrance passage. The evacuation channel is live; keep the central firing lane clear."),
          radio("lin","灰線，中央留人觀察，左右交叉掩護。別因為正面有動靜就丟掉轉角。","Greyline, keep someone observing the center and cover across the sides. Movement ahead is no reason to abandon a corner."),
          radio("shen","地面已接到第一份工號回報。先用掩體擋住火力，我們才能繼續核對傷員。","The surface has acknowledged the first worker report. Use cover to contain the fire so casualty checks can continue.")
        ],
        [
          radio("lin","第二輪正在壓向交會通道，注意兩側換位。灰線，把隊友的射界留出來。","The second attack is pressing the passage junctions. Watch movement on both sides and leave your squad clear firing lanes."),
          radio("chen","側線雜訊升高，但接收沒有停。我會用工號核對，不把私人地址送進頻道。","The side line is getting noisy, but reception continues. I'll verify worker numbers and keep private addresses off this channel."),
          radio("local","下層仍有人等待確認，名單不能只算已離開的人。請把廳前這段路守穩。","People below are still waiting for confirmation. The roster must include more than those already out. Hold the hall approach.")
        ],
        [
          radio("chen","第三輪火力正在集中，前方通道回音很重。看清實際目標，別追著聲音跑。","The third attack is concentrating its fire. The passage is full of echoes. Identify real targets; don't chase the sound."),
          radio("lin","灰線，短程換位，再停下抬槍。別把整個班拖進同一個路口吃交叉火力。","Greyline, move in short bounds and stop to raise your rifles. Don't put the whole squad in one junction under crossfire."),
          radio("shen","傷病紀錄已完成一部分核對。你們身上的傷也要記，先回掩體再找補給。","Part of the medical archive has been verified. Your injuries count too. Get behind cover before seeking supplies.")
        ],
        [
          radio("lin","第四輪就是最後一輪，廳前不能鬆手。守住近側，再清掉仍在通道裡的火力。","This is the fourth and final attack. Keep your hold on the frontage. Secure the near side, then clear the fire still in the passages."),
          radio("local","最後一批工號正在核對，私人資料已分封。請替我們保住完成簽收的時間。","We're checking the final group of worker numbers. Private records are sealed separately. Hold long enough to finish acknowledgment."),
          radio("chen","灰線，撤離廳仍在我方頻道。最後的敵軍有位置回報，沿安全通路接觸。","Greyline, the hall is still on our channel. Positions are being reported for the remaining attackers. Approach through safe routes.")
        ]
      ],
      regroup:[
        [
          radio("lin","第一輪已過，重新看左右通道。空檔是整備時間，別把隊形散到看不見彼此。","The first attack is over. Check both passages again. Use this interval to recover and stay within supporting distance."),
          radio("chen","接收方讀回了第一段名單，尚未確認的名字仍保留。下一段我會繼續核對。","Reception has read back the first roster section. Unconfirmed names remain listed. I'll keep checking the next section.")
        ],
        [
          radio("shen","這輪傷情已記，紗布先給還在出血的人。灰線，利用掩體爭取恢復時間。","This round's injuries are recorded. Dressings go first to those still bleeding. Greyline, use cover to buy recovery time."),
          radio("local","封鎖簽核已另行留存，不會跟私人地址混在一起。你們守住的時間有用。","The lockdown approvals are preserved separately from private addresses. The time you're holding is making a difference.")
        ],
        [
          radio("lin","還剩最後一輪，把能互相支援的位置站穩。誰要換位，先讓旁邊的人知道。","One attack remains. Settle into positions that support each other. Announce any change of position to the soldier beside you."),
          radio("chen","地面接收點仍在回覆，灰線的通訊沒有失聯。我會把最後一段留在同一頻道。","Surface reception is still responding. Greyline remains connected. I'll keep the final roster section on this channel.")
        ]
      ],
      win:[
        b("第四輪攻勢停下後，撤離廳的紅燈仍沒有變色。改變的是電話另一端的回答：每個完成接收的工號都有人讀回，也有人為未確認的名字保留欄位。林岳在移交簿上簽下時間，沒有把通道安全寫成工廠所有問題都已解決。灰線守住了一條路，這條路已讓遠方的人能繼續工作。",
          "After the fourth attack stopped, the hall's red lights remained red. What changed was the answer at the other end of the telephone. Every worker number confirmed at reception was read back, and space remained for every unconfirmed name. Lin signed the handover time without claiming that a secure route had solved all the factory's problems. Greyline had held a route that allowed people elsewhere to continue their work."),
        b("周芷安回報，封鎖命令、簽核與勞工索引已由接收方分別保管，私人資料也沒有公開進軍用頻道。沈禾把傷病證明的缺頁列出，陳隼把斷線區間附在通信記錄後面。今晚的證據仍不完整，但不完整的地方被寫明了；後來的人至少能從一份誠實的紀錄開始，而不是從被清空的名單開始。",
          "Zhou reported that the receiving staff held the lockdown orders, approvals and worker index separately. Private records had stayed off military radio. Shen listed missing pages from the medical files, and Chen appended the communications interruptions. The evidence remained incomplete, but its gaps were documented. Those who came later could begin with an honest record rather than an erased roster.")
      ],
      costly:[
        b("撤離廳最終守住了，小隊與防線卻留下需要更長時間處理的代價。陣地缺口、醫療紀錄與整備時段一併列入交接，接收方仍須核對人員狀態。林岳原先訂下的值勤程序要求寫明實際消耗，沈禾的傷情表也保留待查欄位。四輪攻勢已停，這些善後責任仍要有人接續，不能因為勝利就提前收起。",
          "The hall held, but the squad and line left costs that required more time to address. Gaps in the position, medical records and recovery intervals were included in the handover. Reception still needed to verify personnel status. Lin's established duty procedure required actual expenditure to be recorded, and Shen's medical forms retained pending fields. The four attacks were over. Follow-up responsibilities still needed someone to continue them, rather than being closed early because of victory."),
        b("遠端名單終於完成簽收，部分核對卻只能等下一個班次補做。周芷安把那些待查欄位圈起來，拒絕用猜測填滿整張表。陳隼的通信紀錄保存每一次中斷，沈禾先前提出的重新檢查需求也留在接收站。這場守衛戰讓資料與人員都還有後續處理的可能，也留下了一筆不能由捷報掩過去的費用。",
          "The remote roster was finally acknowledged, though some checks had to wait for the next shift. Zhou circled those pending entries and refused to fill the page with guesses. Chen's communications log preserved every interruption, and Shen's requests for reassessment remained with reception. Holding the hall left both people and records a path toward further care, along with a cost that a victory report could not conceal.")
      ],
      loss:[
        b("撤離廳的回報中斷時，通信紀錄停在陳隼最後一次確認過的工號，接著只留下線路的雜訊。林岳留在值勤簿上的要求，是請遠端接收方保存現有名單與未完成欄位。灰線未能維持這處接收點，通道安全不再有保證；小隊的失聯與下層人的處境必須分別記錄，不能用同一句失敗一併帶過。",
          "When reports from the hall stopped, the communications log ended at the last worker number Chen had confirmed. Then only line noise remained. Lin's request in the duty log asked remote reception to preserve the current roster and its unfinished entries. Greyline could no longer maintain this reception point, and route security was no longer assured. The squad's lost contact and the situation below had to be recorded separately rather than hidden in one word: failure."),
        b("周芷安的備援電話仍在另一處值勤室，她把無法核對的頁面封起來，等待下一份可靠消息。留下來的封鎖簽名不能救回這段失去的時間，卻仍能說明誰發布了命令、誰曾要求解除。對後來接手的人而言，最重要的第一步將是確認活人的位置，再把斷掉的通信一段段接回去。",
          "Zhou's backup telephone remained in another duty room. She sealed the pages she could not verify and waited for reliable news. Preserved lockdown signatures could not restore the time that had been lost, but they could still establish who issued the orders and who asked for them to be lifted. Whoever took over would first need to locate the living, then restore the broken communications section by section.")
      ]
    },
    assault:{
      brief:[
        b("衝鋒路線從入口隔離門開始，越過動力機械區，最後奪回封鎖控制台所在的安全區域。三個據點各自都有守兵，不能只繞過槍聲便宣告控制。灰線要與小隊確認近側通道，再站穩佔領位置；遠端工程與文書人員才有條件查驗封鎖命令，並維持下層人員的接收回報。",
          "The assault begins at the isolation door, crosses the machinery bay and ends at the secure area around the lockdown console. Each of the three sectors has defenders. Bypassing the sound of gunfire does not establish control. Greyline must secure the near passages with the squad and hold the capture positions, allowing remote engineering and clerical staff to examine the lockdown orders and maintain reception reports for those below."),
        b("周芷安在遠端值勤室透過電話提供區域狀態，將每段尚待核對的接收回報留在原欄位。小隊當前要清除據點附近的威脅，保住已建立的射界並完成區域接管。資料要留下哪些部分，已按人員隱私與責任證據分開處理；前進時仍要照看隊友和掩體，讓這份慎重作出的安排有機會真正執行。",
          "Zhou provides area reports by telephone from a remote duty room, keeping every reception report awaiting verification in its original field. The squad must remove threats near each sector, maintain established firing lanes and complete control of the area. Privacy and evidence of responsibility have already been separated in the archive plan. Care for the squad and attention to cover during the advance will give that carefully made arrangement a chance to be carried out.")
      ],
      deploy:[
        radio("lin","灰線，先控制入口隔離門附近的通道。站穩第一段，才有地方掩護後續推進。","Greyline, secure the passages around the isolation door first. Hold that first sector so it can cover the next advance."),
        radio("chen","周芷安在線，我只轉送區域回報。私人名單留在封存線路，不進作戰頻道。","Zhou is on the line. I'll relay area reports only. Private rosters stay on the sealed records circuit, off combat radio.")
      ],
      stages:[
        [
          radio("lin","第一據點是入口隔離門，先清近側守兵。灰線，轉角有人就不要急著站進中央。","First sector: the isolation door. Clear the near defenders. Greyline, don't rush into the center while a corner is occupied."),
          radio("local","入口的封鎖狀態仍在紀錄裡，這裡曾有人提出解除。請把安全區域建立起來。","The entrance lockdown is still in the record. Someone requested that it be lifted here. Establish a secure area."),
          radio("shen","先確認隊友的傷情再接管位置。這段路守得住，後面的回報才有地方落下。","Check your squad's condition before settling into the capture position. Hold this route so the later reports have a secure place to arrive.")
        ],
        [
          radio("chen","下一據點是動力機械區，交會通道的聲音會混在一起。左右射界請分開確認。","Next sector: the machinery bay. Sounds overlap in its intersecting passages. Verify left and right firing lanes separately."),
          radio("lin","灰線，利用已控制的入口接力掩護。別把前進的人和停下射擊的人排在同一線。","Greyline, use the secured entrance for covering bounds. Don't put moving soldiers directly in front of those who have stopped to fire."),
          radio("local","動力層接收仍在等待區域安全回報。先讓人能通訊，設備的責任之後再核對。","Reception on the machinery level is waiting for an area-security report. Keep people connected first; equipment responsibility can be checked afterward.")
        ],
        [
          radio("lin","最後據點是封鎖控制台，守兵仍在附近。灰線，先排除威脅再完成接管。","Final sector: the lockdown console. Defenders remain nearby. Greyline, remove the threats before completing control."),
          radio("chen","簽核資料的接收線已備妥，我會等安全回報再轉送。完整地址仍然不公開。","The receiving circuit for the approvals is ready. I'll wait for the security report before transmitting. Complete addresses remain private."),
          radio("shen","接管之後先核對下層人員狀態。灰線，小隊仍要互相照看，別在最後失去掩護。","After control is established, verify the people below first. Greyline, keep watching your squad. Don't lose your cover at the end.")
        ]
      ],
      regroup:[
        [
          radio("lin","入口區域已控制，留意身後的交會通道。灰線，整理隊形再往動力層走。","The entrance sector is controlled. Watch the junctions behind you. Greyline, restore your formation before advancing to the machinery level."),
          radio("local","第一段安全回報已收到，未確認工號仍留在名單。下一段我會繼續提供狀態。","The first sector-security report is received. Unconfirmed worker numbers remain on the roster. I'll continue reporting from the next area.")
        ],
        [
          radio("chen","動力區的回報接上了，接收方正在讀回工號。最後據點還需要你們清除守兵。","The machinery-level reports are connected. Reception is reading worker numbers back. The final sector still needs its defenders cleared."),
          radio("shen","這裡只能做短暫整備，傷情先說清楚。灰線，保住能互相支援的距離再出發。","We have time for a short recovery here. State your injuries clearly. Greyline, resume with the squad within supporting distance.")
        ]
      ],
      win:[
        b("封鎖控制台周圍的守兵被清除，三段安全區域終於連成可交接的路線。陳隼把區域回報送進遠端接收，周芷安逐筆讀回封鎖命令的編號，沒有把私人地址附在後面。林岳讓灰線先確認小隊位置，再簽下接管時間；工廠的燈仍靠備援電力，安全回報卻已不再只有一片空白。",
          "The defenders around the lockdown console were cleared, and the three secure sectors became a route that could be handed over. Chen sent the area reports to remote reception. Zhou read back the lockdown order numbers without attaching private addresses. Lin had Greyline confirm the squad's positions before signing the time of control. Backup power still supplied the factory lights, but its security report was no longer an empty page."),
        b("遠端勤務人員開始補做下層接收與資料核對。勞工索引、傷病證明和責任簽核由不同人分別保管，公開哪些私人資料仍由當事人決定。灰線完成的是三個據點的接管，留下的則是一個比較可信的起點：人可以被找到，命令可以被追查，沒有人必須為了離開工廠先放棄自己的名字。",
          "Duty personnel elsewhere began completing reception checks and archive verification. The worker index, medical evidence and signed approvals were held separately, and the people concerned retained control over which private information became public. Greyline had secured three sectors. It left a more credible starting point: people could be located, orders could be traced, and leaving the factory did not require surrendering one's name.")
      ],
      costly:[
        b("三個據點都完成了接管，最後一段卻留下更多整備與人員核對需求。沈禾先前要求遠端不要把沉默寫成無人受傷，這句提醒仍附在傷情表上。林岳的值勤簿保留每次推進後的停頓，讓接收人員知道安全不是突然出現的。灰線站住了控制台周圍，後續照料與逐項確認仍要在交接後繼續。",
          "All three sectors were taken, but the final stretch left additional recovery and personnel-verification requirements. Shen's earlier warning not to interpret silence as an absence of injuries remained attached to the medical forms. Lin's duty log preserved the pauses after each advance, so reception would understand that security had not appeared all at once. Greyline held the console area. Follow-up care and item-by-item checks would continue after handover."),
        b("資料核對比預定晚了一段，周芷安先封存已確認的頁面，把未完成部分另行標記。陳隼先前建立的通信紀錄保留回報的時間差，接收方依照原欄位核對中斷。這條路線終於可供接收方使用，但沿路消耗的物資與小隊的傷情核對需求，都會在交接文件裡與成功一起留下，而不是被同一句通關消息蓋住。",
          "Archive verification ran late. Zhou sealed the confirmed pages first and marked the unfinished sections separately. The communications log Chen had established retained the delays between reports. Reception checked the interruptions against its original fields. The route could finally be used, while the supplies consumed and the squad's medical-verification needs remained in the handover documents alongside the success, rather than being covered by a single announcement that the area was clear.")
      ],
      loss:[
        b("最後可靠的區域回報停在尚未完成的接管位置。遠端接收方在陳隼先前建立的紀錄裡註記中斷，並依林岳留下的命令停止把未確認路段當成安全通道。灰線未能建立完整的三段路線，封鎖控制仍缺少可信的現場回報；先前取得的資料必須標出來源與限制，不能拿局部控制冒充整座工廠已經開放。",
          "The last reliable area report ended at a capture position that had not been completed. Remote reception marked the interruption in the log Chen had established. Following Lin's standing order, it stopped treating unverified stretches as safe routes. Greyline had not established all three sectors, and the lockdown controls still lacked a credible on-site report. Records already received needed their sources and limitations marked. Partial control could not be presented as an open factory."),
        b("周芷安仍守著另一處值勤室的備援電話，沈禾最後傳出的接收需求也被留在醫療站的待辦欄。後續人員要先確認哪段通道還能使用，並重新聯絡未完成核對的人。工廠裡的每份命令都可能留下痕跡，但那些痕跡不會自己變成出口；這次未能完成的安全區域，仍要由下一批步兵重新爭取。",
          "Zhou remained beside the backup telephone in another duty room. Shen's last reception requests stayed in the aid station's pending list. Those who followed would need to determine which passages remained usable and contact everyone whose checks were unfinished. The factory's orders might leave traces, but traces could not become exits on their own. Another infantry force would have to establish the secure areas this attempt had not completed.")
      ]
    },
    cleanup:[
      radio("chen","灰線，最後的敵軍位置已回報。名單核對沒有停，沿可通行的路線逐段接觸。","Greyline, positions for the last attackers are reported. Roster checks continue. Approach them along passable routes."),
      radio("lin","別為最後幾個目標散開全班。保持交叉掩護，找到人再抬槍，讓通道真正安全。","Don't scatter the squad for the last targets. Keep cross-cover, identify them before raising your rifle, and make the route secure.")
    ],
    operationNotes:[
      b("隔離門守衛：遠端接收最怕近側防線被壓垮。重裝與支援火力交替逼近，整備較慢，先保住能互相掩護的位置。","Isolation lockdown: remote reception is most vulnerable to a collapse of the near line. Heavy and support fire approach in alternation. Recovery is slower, so preserve mutually supporting positions."),
      b("動力區掃蕩：交會通道讓側翼接觸更頻繁。遠端回報仍照常核對，小隊要用接力掩護推進，避免一齊追進同一條巷道。","Machinery sweep: intersecting passages bring more frequent flank contacts. Remote verification continues. Advance in covering bounds rather than sending the entire squad down the same passage."),
      b("低補給滲透：進攻部隊較疏，整備物資卻送得更慢。沈禾要求先利用掩體穩住傷情，把有限空檔留給必要的核對。","Rationed infiltration: the attacking force is less concentrated, but recovery supplies arrive more slowly. Shen asks for cover to stabilize injuries and for the available intervals to be used for essential checks.")
    ],
    afterword:[
      b("工廠重新建立日常程序以後，周芷安仍會被問到那份封鎖單究竟何時開始生效。她準備的回答不是一個好聽的整點，而是一串能核對的紀錄：停電時間、簽核時間、電話中斷時間，以及灰線送來的區域回報。那些時間並不完全連續，卻讓曾被一道命令困住的人有機會追問，誰把他們留在下面，又是誰在現場要求把路留下。",
        "Once ordinary procedures are restored, Zhou will still be asked when the lockdown order began to apply. Her answer will be a verifiable sequence rather than a convenient hour: the power failure, approvals, telephone outages and Greyline's area reports. The times will contain gaps. Even so, they will give those confined by an order a chance to ask who kept them below, and who on the ground insisted that a route remain available."),
        b("值勤簿最後一頁留著三個尚待核對的欄位，沿用林岳要求保存的格式。陳隼建立的核對紀錄保留空白，沈禾的傷情標準也要求有依據再註記。地下工廠的責任始於一次獨立的值勤命令，交班後仍由不同的人接續。灰線留下的責任，是讓下一個接手的人知道哪些事情已經確認，哪些仍值得為一個真實的人再問一次。",
        "The duty log's last page retains three fields awaiting verification, in the format Lin required. Chen's checking records preserve the gaps, and Shen's medical standard requires evidence before a status is entered. Responsibility for this factory begins with an independent duty order and continues through different people after handover. Greyline's continuing responsibility is to tell the next person what has been confirmed, and what still deserves another question on behalf of someone real.")
    ]
  },
  rail:{
    title:b("最後一張調度單","The Last Dispatch Sheet"),
    deck:b("機甲離開貨運站後，撤離運輸與前線補給擠在調度表上。灰線守住裝卸區，讓每次延後都有理由，每個優先次序都有人負責。","After the mechs leave the depot, evacuation transport and front-line supplies compete for space on the dispatch sheet. Greyline holds the loading zone so every delay has a reason and every priority has someone accountable for it."),
    timeLabel:b("撤離第六日・05:40","Evacuation, Day Six · 05:40"),
    location:b("北區鐵路補給站・中央月台與貨運調度室","Northern Rail Supply Depot · Central Platform and Freight Dispatch Room"),
    background:[
      {
        title:b("留在貨場的東西","What Remains in the Yard"),
        paragraphs:[
          b("黎明尚未越過倉庫屋頂，鋼鐵黃昏機甲分隊已奉命離開補給站，轉往外圍支援撤離。履帶留下的泥痕穿過月台旁，貨場裡的停放車輛與成排貨櫃仍沒有改變位置。林岳接到的是一份裝卸清單，頁角被雨水泡軟，交接欄缺了上一班的簽名。清單上有彈藥、飲水、敷料與保暖用品，每一項都有人在另一端等著接收。",
            "Before dawn cleared the warehouse roofs, the Iron Dusk mech detachment received orders to leave the depot and support evacuation on the perimeter. Its tracks left muddy marks beside the platforms. Parked vehicles and rows of containers remained where they were. Lin Yue received a loading manifest with rain-softened corners and the previous shift's signature missing from the handover field. It listed ammunition, drinking water, dressings and warm clothing. Someone at the other end was waiting for every item."),
          b("調度員韓祈在遠端值勤室接起電話，第一句話是詢問這裡是否仍能維持通信。北段接收場同時處理傷員運輸與前線補給，所有延後都沿著線路傳回本站。上一班為了讓報表準時，把未完成的項目寫成已轉送，帳面因此比實際貨場整齊。灰線抵達時，真正需要接管的除了地面，還有一份不能再照抄的時間表。",
            "Dispatcher Han Qi answered from a remote duty room. Her first question was whether the depot could still maintain communications. The northern receiving yard was handling casualty transport and front-line supplies at the same time, with every delay reported back here along the line. To submit its report on time, the previous shift had marked unfinished items as transferred. The paperwork looked tidier than the real yard. When Greyline arrived, it needed to take control of the ground and of a timetable that could no longer simply be copied.")
        ]
      },
      {
        title:b("先送什麼，由誰簽名","What Goes First, and Who Signs"),
        paragraphs:[
          b("前線要求優先補上彈藥，醫療接收站則要求先保住傷員安置與飲水。沈禾指出，醫療物資晚到可能讓原本能穩定的傷情惡化；林岳也知道，少一段掩護火力會讓所有接收工作更難繼續。兩邊的需要都寫在紙上，沒有哪一項因為字體較大便比較真實。韓祈要求每次改動都留下具名理由，不接受只有優先兩字的命令。",
            "The front requested ammunition first. Medical reception asked for casualty accommodation and drinking water to be protected before other transfers. Shen He pointed out that delayed medical supplies could worsen injuries that might otherwise be stabilized. Lin also knew that a gap in covering fire could make all reception work harder to sustain. Both needs were on the page. Larger lettering did not make either more real. Han required a named reason for every change and would not accept an order that said only 'priority.'"),
          b("遠端值勤人員最後把急需的飲水與敷料列為第一批接收，仍在接戰的班排保留必要的彈藥轉送，其他項目逐筆標出延後時段。運輸安排由接收場的勤務繼續處理，每個改動都留下核對時間。小隊守住裝卸區與調度路線，韓祈則負責讓接收方知道東西何時能到、誰改過順序，以及哪一段回報尚未核實。",
            "Remote duty staff finally scheduled urgent water and dressings for the first reception batch, retained essential ammunition transfers for units still engaged, and marked the delays for other items individually. Reception-yard personnel would continue the transport arrangements, with every revision retaining its verification time. The squad would hold the loading area and route to dispatch. Han would tell reception when items could arrive, who changed their order, and which reports remained unverified.")
        ]
      },
      {
        title:b("把空白留在正確的位置","Leave the Gaps Where They Belong"),
        paragraphs:[
          b("陳隼重新核對兩份不同版本的調度表，發現同一批貨物在一份上已經離站，在另一份上仍待裝卸。他沒有選擇看起來較順利的那份，而是把差異讀給韓祈，請遠端逐項確認。貨場前方已出現槍聲，林岳把隊員分到能互相支援的位置；沈禾將醫療需求與物資缺口分開回報，避免一條含糊的缺貨訊息遮住真正急迫的人。",
            "Chen Sun compared two versions of the dispatch sheet. The same cargo had supposedly left the station in one and was still awaiting loading in the other. He read the discrepancies to Han and asked for remote confirmation item by item. Gunfire had begun ahead of the yard. Lin placed soldiers where they could support each other, while Shen reported medical needs separately from supply shortages so one vague message about missing stock would not conceal the people who needed help most urgently."),
          b("值勤圖將補給裝卸區列為需要守住的支點，情報預估有四輪攻勢逼近；貨運入口、中央月台與鐵路調度室則是推進時要逐段確認的區域。遠方運輸安排由值勤人員回報，眼前停放的車輛和貨櫃提供掩護與射界。灰線每站穩一個位置，調度表便多一段能確認的安全範圍，也多一筆必須如實寫下的責任，交接的計時從接手此刻開始。",
            "The duty map identifies the loading zone as a point that must hold, with intelligence anticipating four attacks. The freight entrance, central platform and dispatch room are the areas an advance must verify in turn. Duty personnel report transport arrangements elsewhere. Parked vehicles and containers provide cover and firing lanes. Every position Greyline holds adds a verifiable stretch of secure ground to the dispatch sheet, along with another responsibility that must be recorded honestly. Handover time begins with taking responsibility now.")
        ]
      }
    ],
    cast:[
      {id:"lin",name:b("林岳","Lin Yue"),role:b("步兵班長","Squad Leader"),detail:b("林岳知道補給單上少一個數字，前線就可能少一段能掩護撤離的火力。他要求小隊守住裝卸區，也要求調度命令具名；他願意替必要的延後負責，但不肯用一張整齊報表換取對實際處境的沉默。","Lin knows that a missing figure on a supply form can mean a missing stretch of fire covering an evacuation. He asks the squad to hold the loading zone and dispatch orders to carry names. He will accept responsibility for a necessary delay, but will not trade an orderly report for silence about conditions on the ground.")},
      {id:"shen",name:b("沈禾","Shen He"),role:b("隨隊軍醫","Squad Medic"),detail:b("沈禾把飲水、敷料與接收位置看成同一條照護鏈上的不同環節。她用已確認的傷情說明優先需求，也記錄尚缺什麼；她不要求調度單為了她變得好看，只要求等在遠方的人能從回報知道下一步該做什麼。","Shen treats water, dressings and reception places as different parts of one chain of care. She uses confirmed medical conditions to explain urgent needs and records what is still missing. She does not ask dispatch to make its sheet look better for her. She asks for reports that tell those waiting elsewhere what they can do next.")},
      {id:"chen",name:b("陳隼","Chen Sun"),role:b("通訊兵","Signals Specialist"),detail:b("陳隼負責核對裝卸清單與遠端接收，習慣把每次讀回的時間寫在原欄位旁。兩份調度表互相矛盾時，他會保留來源與差異，讓後續人員看見資料如何出錯，不讓修正後的版本假裝錯誤從未發生。","Chen checks loading lists against remote reception and writes acknowledgment times beside the original entries. When dispatch sheets contradict each other, he preserves their sources and differences. The next shift should be able to see how the records went wrong, rather than receiving a corrected version that pretends no mistake occurred.")},
      {id:"local",name:b("韓祈","Han Qi"),role:b("鐵路調度員・遠端聯絡","Rail Dispatcher · Remote Contact"),detail:b("韓祈在北段接收場的值勤室處理運輸順序，透過電話向灰線核實本站狀態。她不承諾每個要求都能同時滿足，卻堅持每項延後都有去向、時間與具名理由，讓調度責任不會在戰後只剩一排無人認領的縮寫。","Han manages transport priorities from a duty room in the northern receiving yard and checks this depot's status with Greyline by telephone. She does not promise that every request can be met at once. She insists that every delay retain a destination, a time and a named reason, so postwar responsibility does not dissolve into unclaimed initials.")}
    ],
    stakes:[
      b("裝卸區是目前仍能核對物資去向的接收支點，防線失守會讓補給需求與傷員安置再次失去可靠回報。","The loading zone is a reception point where cargo destinations can still be verified. If the line falls, supply requests and casualty accommodation will lose reliable reports again."),
      b("飲水、敷料與彈藥都有人等待，優先次序必須附上具名理由，不能靠抹去延誤把任何一方寫成已經滿足。","People are waiting for water, dressings and ammunition. Priorities need named reasons. Erasing a delay cannot be used to claim that either side's needs have been met."),
      b("機甲離開後，步兵的每個掩護位置都會影響接收時段；時間可以被爭取，責任不能被轉交給模糊的表格。","With the mechs gone, every infantry covering position affects reception time. Time can be bought, but responsibility cannot be handed to an ambiguous form.")
    ],
    defend:{
      brief:[
        b("補給裝卸區必須撐過四輪攻勢，遠端才有條件逐項確認本站仍能接收與轉送的物資。灰線要利用月台、貨櫃與停放車輛建立交叉掩護，阻止逼近撤離線的敵軍。韓祈會回報北段接收狀態，陳隼會核對清單差異；你眼前的任務仍是守住地面，讓他們的回報有一處可信的安全來源。",
          "The supply loading zone must survive four attacks so remote staff can verify what this depot can still receive and transfer. Greyline should use platforms, containers and parked vehicles to establish cross-cover and stop attackers approaching the evacuation line. Han will report conditions in the northern receiving yard, and Chen will check discrepancies in the manifests. Greyline's immediate task is to hold the ground, giving those reports a secure and credible source."),
        b("傷員安置與急需飲水已列入遠端優先安排，仍在接戰的部隊也保留必要的彈藥需求。眼前貨櫃遮斷部分視線，月台兩側需要彼此呼應；四輪接觸與防線完整度決定小隊能否完成裝卸區交接。短暫整備時先看清側翼，再安排補給，讓每份調度回報都來自仍有人看守的安全區域。",
          "Casualty accommodation and urgently needed water have priority in the remote arrangements, while engaged units retain essential ammunition requests. Containers interrupt the view ahead, and both platform sides need coordinated cover. Four attacks and the condition of the line determine whether the squad can hand over the loading zone. Check the flanks before arranging resupply in recovery intervals, so every dispatch report comes from a secure area that remains watched.")
      ],
      deploy:[
        radio("lin","灰線，補給裝卸區由我們守。先分開左右射界，貨櫃轉角不能只靠一個人看住。","Greyline, we're holding the supply loading zone. Separate the left and right firing lanes. One soldier cannot watch every container corner."),
        radio("local","韓祈在線，北段接收仍可回報。請給我確認過的區域狀態，延後項目由我具名。","Han Qi on the line. Northern reception can still report. Give me verified area status. I'll sign the reasons for delayed items.")
      ],
      stages:[
        [
          radio("chen","第一輪接觸在貨運入口方向。清單仍在讀回，別讓前方動靜把兩側觀察拉空。","First contact is toward the freight entrance. Manifest readbacks continue. Don't let movement ahead empty both side observation posts."),
          radio("lin","灰線，近側先守穩，隊友互相掩護。有人往裝卸區逼近，就先把通道截住。","Greyline, hold the near side and cover one another. Stop the approach of anyone pressing toward the loading zone."),
          radio("shen","飲水與敷料的需求已確認，接收位置也要守住。先用掩體換取核對的時間。","The requests for water and dressings are confirmed. Their reception point needs to hold too. Use cover to buy checking time.")
        ],
        [
          radio("lin","第二輪正在沿月台兩側換位。灰線，留出交叉射界，別跟著一個目標越追越遠。","The second attack is changing positions on both platform sides. Greyline, preserve crossfire lanes and don't chase one target out of support."),
          radio("local","北段接收有延後，我已把理由寫明。本站若仍能維持安全，請照實回報給我。","Northern reception is delayed. I've recorded the reasons. If this depot still has a secure area, report its condition accurately."),
          radio("chen","兩版清單的差異還在核對，我不會先刪掉其中一份。灰線，保持這段頻道通暢。","The differences between the two manifests are still being checked. I won't delete either version first. Greyline, keep this channel usable.")
        ],
        [
          radio("chen","第三輪火力正在加重，兩側通道都有回報。看清射位，再讓隊友接力換位。","The third attack's fire is increasing. Reports are coming from both side approaches. Identify firing positions, then move in covering bounds."),
          radio("lin","灰線，補給線不能只剩正面槍口。保住近側掩體，留人觀察往裝卸區的路。","Greyline, the supply line needs more than rifles facing forward. Preserve near-side cover and watch the approaches to the loading zone."),
          radio("shen","這輪傷情需要留出恢復時間，先回掩體。接收方等的是可靠回報，不是好聽數字。","This round's injuries need recovery time. Get behind cover. Reception needs reliable reports, rather than reassuring numbers.")
        ],
        [
          radio("lin","第四輪接觸確認，裝卸區還在我們手上。灰線，把最後的近側突破壓下去。","Fourth attack confirmed. We still hold the loading zone. Greyline, stop the final push on the near side."),
          radio("local","最後一段調度核對仍在進行，所有延後都有簽名。請守到能完成區域交接。","The final dispatch checks continue. Every delay has a signature. Hold long enough to complete the area handover."),
          radio("chen","最後敵軍的位置正在讀回，別穿過隊友射線追人。沿已確認的通道接觸就好。","Positions for the remaining attackers are being read back. Don't cross a squadmate's firing lane to chase them. Use verified approaches.")
        ]
      ],
      regroup:[
        [
          radio("lin","第一輪已停，重新確認月台兩側。灰線，利用這段空檔整備，別把守區放空。","The first attack has stopped. Check both platform sides again. Greyline, recover during this interval without leaving the sector unwatched."),
          radio("local","第一批需求已讀回，接收時間仍有缺口。我會保留待查欄位，不把它寫成準時。","The first requests have been read back. There are still gaps in the reception times. I'll keep them pending rather than mark them on time.")
        ],
        [
          radio("chen","清單差異已縮小，尚未確認的貨物仍在原欄。灰線的安全回報我已附上時間。","The manifest differences are narrowing. Unconfirmed cargo remains in its original fields. I've timestamped Greyline's security report."),
          radio("shen","先說清楚還缺哪些醫療物資，再安排下一次整備。灰線，隊友的位置也一起確認。","State which medical supplies are still missing before planning the next recovery interval. Greyline, check your squad's positions too.")
        ],
        [
          radio("lin","最後一輪前把隊形站穩，左右保持呼應。谁要離開掩體，先讓旁邊的人掩護。","Set your formation before the last attack and keep the sides connected. Ask the soldier beside you to cover any move out of shelter."),
          radio("local","北段接收还在回覆，我已留下每次改動的簽名。装卸區交接時間等你們確認。","Northern reception is still responding. Every change has a signature. I'll wait for your confirmation of the loading-zone handover time.")
        ]
      ],
      win:[
        b("第四輪攻勢停下後，林岳把裝卸區的安全回報交給韓祈，並在值勤簿上寫下小隊能維持的射界。貨場上的車輛仍停在原位，遠端接收卻終於有了完整的交接時間。陳隼讀回最後一段清單，沈禾核對醫療需求；他們沒有把優先安排說成每個人都已等到所需，而是逐項說清楚哪些已確認、哪些仍在等待。",
          "After the fourth attack stopped, Lin sent Han the loading zone's security report and recorded the firing lanes the squad could maintain. The vehicles in the yard remained parked. Remote reception finally had a complete handover time. Chen read back the final manifest section and Shen checked medical requests. They did not claim that prioritization had met everyone's needs. They specified which items were confirmed and which were still waiting."),
        b("韓祈將飲水、敷料與必要彈藥的安排分開簽收，把每次改動的具名理由留在原表後面。灰線守住的是能讓這些回報繼續有效的地面，並非一張永遠不會延誤的時刻表。後續班次接手時，至少不必再從一份虛假的已轉送開始；他們能看見真實的缺口，也能找到願意為調度負責的人。",
          "Han acknowledged the arrangements for water, dressings and essential ammunition separately, retaining the named reasons for changes behind the original sheet. Greyline had held the ground that kept those reports meaningful, rather than producing a timetable without delays. The next shift would not have to begin with a false claim that everything had been transferred. It could see the real gaps and locate those accepting responsibility for the dispatch decisions.")
      ],
      costly:[
        b("裝卸區最終守住了，交接文件上的代價欄卻需要更多頁。灰線留下的安全範圍、醫療紀錄與物資消耗，都表明這條防線曾被壓到多近。林岳原先要求逐項核對的值勤程序仍被保留，沈禾的傷情表也沒有因勝利而收起；接收方必須先處理仍待照料的項目，才能把這段時間列成完成。",
          "The loading zone held, but the handover's cost section needed additional pages. Greyline's security boundaries, medical records and supply expenditure showed how close the line had come to collapse. The item-by-item checking procedure Lin had established remained in place, and Shen's casualty forms were not closed simply because the battle was won. Reception needed to address the care still pending before marking this interval complete."),
        b("韓祈把晚到的時段留在表上，沒有移動時間欄讓整份清單看起來準時。通信紀錄裡的每次中斷，也與重新確認的回報並列保存。這場守衛戰留下了能繼續使用的接收點，也留下了小隊和防線需要善後的痕跡。它的意義不會因為代價較高而消失，代價也不會因為任務完成而自動減輕。",
          "Han retained the late intervals on the sheet instead of shifting its times to make the manifest look punctual. Every communications interruption was preserved alongside the reports later reconfirmed. The defense left a usable reception point and evidence that the squad and line still needed attention. The operation's value was not erased by its greater cost. Nor did completing the mission make that cost disappear.")
      ],
      loss:[
        b("裝卸區的安全回報中斷以後，韓祈先停下本站的已確認標記，通知遠端不要按舊時段安排接收。灰線未能完成這處防線的交接，通信紀錄也無法證明所有通道仍可使用。清單中已完成與未完成的項目必須分開保存；一次失去現場回報，不能變成把所有貨物、人員與責任一筆刪去的理由。",
          "After security reports from the loading zone stopped, Han suspended this depot's confirmed status and told remote staff not to arrange reception against the old times. Greyline had not completed the line's handover. Communications records could no longer establish that all approaches remained usable. Completed and unfinished items on the manifest had to be preserved separately. Losing an on-site report was no reason to erase the cargo, people and responsibilities together."),
        b("陳隼最後留下的核對欄位仍附有來源，沈禾先前送出的醫療需求也還在接收方手上。後續人員要先確認小隊的狀態與能使用的近側通路，再決定哪些安排必須重做。韓祈在延後原因寫下現場狀態待查，沒有替任何人先下結論。這次沒有守住的時間，仍會落在下一個值勤班的紙上。",
          "The last checking fields Chen left behind retained their sources, and the medical requests Shen had transmitted remained with reception. Those who followed needed to confirm the squad's status and usable near-side approaches before deciding which arrangements required revision. Han marked the reason for delay as on-site conditions awaiting verification, without drawing conclusions about anyone. The time this defense had failed to secure would remain on the next duty shift's paperwork.")
      ]
    },
    assault:{
      brief:[
        b("衝鋒路線從貨運入口切入，接著控制中央月台，最後奪回鐵路調度室附近的區域。每個據點都會影響本站能提供哪一段安全回報，守兵也會利用貨櫃與月台側翼拖住推進。灰線要先確認近側射界，再與隊友站穩佔領位置；遠端接收的安排不會替眼前的敵軍讓出通道。",
          "The assault enters through the freight entrance, takes the central platform and ends at the area around the rail dispatch room. Each sector determines which stretch of the depot can provide a security report. Defenders use containers and platform flanks to delay the advance. Greyline must verify the near firing lanes, then hold the capture positions with the squad. Remote reception arrangements cannot clear the enemy from the route ahead."),
        b("韓祈正在別處處理運輸優先次序，會等待每個據點的安全回報，再核對對應的接收安排。小隊要控制貨運入口、月台與調度室，讓三處區域具備能相互支援的射界。已確認的安全範圍要留下時間，尚未確認的路段則維持待查，附近威脅仍須逐一排除，讓調度室的交接有可靠的地面依據。",
          "Han is managing transport priorities elsewhere. She will wait for each sector's security report before checking the corresponding reception arrangements. The squad must control the freight entrance, platform and dispatch room, establishing firing lanes that support one another across the three areas. Confirmed ground needs timestamps, while unverified stretches remain pending. Threats nearby still require clearance one by one, giving the dispatch-room handover a reliable basis on the ground.")
      ],
      deploy:[
        radio("lin","灰線，先拿下貨運入口，讓後續推進有掩護。月台兩側看清楚再換位置。","Greyline, take the freight entrance first so it can cover further movement. Check both platform sides before changing position."),
        radio("local","韓祈在線，三個據點的回報我會分别讀回。請給真實時間，延誤由我們具名處理。","Han Qi on the line. I'll acknowledge the three sectors separately. Give me real times. We'll sign the reasons for delays.")
      ],
      stages:[
        [
          radio("lin","第一據點是貨運入口，先清近側守兵。灰線，貨櫃後的側翼不能留給猜測。","First sector: the freight entrance. Clear the near defenders. Greyline, don't guess about the flanks behind the containers."),
          radio("chen","入口清單有兩個版本，我已保留來源。等你們確認區域安全，再更新接收狀態。","There are two versions of the entrance manifest. I've kept their sources. Once you confirm area security, I'll update reception status."),
          radio("shen","醫療接收需要的是能使用的通路。灰線，先保住隊友，再站穩入口的接管位置。","Medical reception needs a usable route. Greyline, protect the squad before settling into the entrance capture position.")
        ],
        [
          radio("lin","第二據點是中央月台，注意兩側射位。灰線，用入口的掩護接力推進到下一段。","Second sector: the central platform. Watch firing positions on both sides. Greyline, advance in bounds covered from the entrance."),
          radio("local","月台安全會影響北段接收安排，我先保留待查。请別用未清通道替換確認時間。","Platform security affects northern reception arrangements. I'll keep it pending. Don't timestamp an approach that hasn't been cleared."),
          radio("chen","左右接觸都有回報，先辨認目标再抬槍。隊友換位時，我會把頻道留給位置確認。","Contacts are reported on both sides. Identify targets before raising your rifle. I'll keep the channel clear for position checks during squad movement.")
        ],
        [
          radio("lin","最後據點是鐵路調度室，附近守兵仍會換位。灰線，保持交叉掩護完成接管。","Final sector: the rail dispatch room. Nearby defenders will still reposition. Greyline, maintain cross-cover and complete control."),
          radio("local","調度記錄已有接收方等待，改動原因都要留存。區域安全请由你們逐項確認。","Reception is waiting for the dispatch records. Every reason for a change must remain documented. Verify area security item by item."),
          radio("shen","最後一段也要留出恢復時間。灰線，完成接管前別讓隊友失去能退回的掩體。","Leave recovery time on the final stretch too. Greyline, keep cover available for your squad until control is complete.")
        ]
      ],
      regroup:[
        [
          radio("chen","貨運入口已確認，我在清單旁寫下時間。中央月台仍待查，先別把整段線路標綠。","The freight entrance is confirmed. I've timestamped its manifest. The central platform is pending; don't mark the entire route secure."),
          radio("lin","灰線，入口留出支援射界，整理隊形再前進。側翼有人接觸就先停下確認。","Greyline, preserve supporting fire from the entrance and restore formation before moving. Stop and verify any flank contact.")
        ],
        [
          radio("local","中央月台的回報已讀回，北段會重排對应時段。最後據點的狀態還需要確認。","The central platform report is acknowledged. The north will revise the corresponding intervals. The final sector still needs confirmation."),
          radio("shen","先把傷情和物資缺口說清楚，再往調度室推進。灰線，队友間保持互相支援。","State injuries and supply gaps before advancing to dispatch. Greyline, keep the squad within supporting distance.")
        ]
      ],
      win:[
        b("鐵路調度室附近完成接管，貨運入口與中央月台的安全時間也一併送到遠端。韓祈把三段回報逐一讀回，再修正接收安排，沒有把早先的延後從原表上擦掉。林岳確認小隊位置，陳隼附上清單差異，沈禾核對仍需醫療接收的人；灰線奪回了三個能讓調度重新可信的據點。",
          "Control of the dispatch-room area was completed, and the security times for the freight entrance and central platform were sent with it. Han acknowledged the three reports in turn and revised reception arrangements without erasing earlier delays. Lin confirmed the squad's positions. Chen appended the manifest discrepancies, and Shen checked those still needing medical reception. Greyline had taken three sectors that could make dispatch credible again."),
        b("接收方現在能看見本站何時恢復區域安全，也能追查哪些物資先送、哪些被延後。這些安排由遠端人員繼續執行，貨場眼前的車輛仍是戰鬥留下的背景。完成接管沒有讓所有需要同時消失，但讓每個需要都能回到一份有來源、有時間、有責任人的紀錄裡，而不是繼續被一句已轉送遮住。",
          "Reception could now see when the depot regained area security and trace which supplies received priority and which were delayed. Remote personnel would continue carrying out those arrangements. The vehicles in the yard remained part of the battlefield. Securing the sectors did not make every need disappear at once. It allowed those needs to return to records with sources, times and responsible names, rather than remaining hidden behind a claim that everything had been transferred.")
      ],
      costly:[
        b("三個據點最終連成可交接的安全範圍，灰線交出的卻是一份還附著醫療與整備需求的報告。沿途消耗和等待恢復的時間都必須算入，不能只保留最後完成的那一刻。小隊先前建立的核對程序讓接收方知道哪些項目仍需善後，調度室的安全回報也因此帶著限制，而不是一個毫無條件的保證。",
          "The three sectors finally formed a secure area that could be handed over, but Greyline's report still carried medical and recovery requirements. Expenditure along the route and time spent recovering had to count, rather than only the final moment of completion. The squad's checking procedure told reception which matters still needed attention. The dispatch room's security report therefore included its limitations instead of offering an unconditional guarantee."),
        b("韓祈將新的接管時間與先前的延後並列，保留兩份清單為何不一致的說明。待查的傷情與物資缺口沒有因為區域變綠就被刪掉，接收人員還要逐項安排後續處理。這場衝鋒讓貨運站重新具備可核對的安全來源，代價也會跟著那份來源一起留下，供下一個值勤班理解和承擔。",
          "Han placed the new control times beside the earlier delays and preserved the explanation for the conflicting manifests. Pending medical checks and supply gaps were not deleted simply because the area was marked secure. Reception still needed to arrange follow-up item by item. The assault restored a verifiable source of security reports to the depot. Its cost remained with that source, for the next duty shift to understand and carry forward.")
      ],
      loss:[
        b("最後一段安全回報沒有完成，韓祈把本站接管狀態改為待查，不再沿用預定的接收時間。灰線未能把三處據點全部連成可信的安全範圍，已確認的入口或月台也不能替尚未確認的調度室作保。通信紀錄必須保留停止的位置，讓後續人員知道需要重新核對的是哪一段，而非從頭猜測整份清單。",
          "The final security report was not completed. Han changed the depot's control status to pending verification and stopped using its planned reception times. Greyline had not connected all three sectors into a credible secure area. A confirmed entrance or platform could not guarantee an unconfirmed dispatch room. Communications records needed to preserve where reporting stopped, so those following would know which stretch required renewed checks rather than guessing through the whole manifest."),
        b("醫療需求與物資優先順序仍留在遠端接收方手上，沒有因為現場失聯而失去原本的去向。後續值勤人員要先確認小隊狀態、守兵位置與可使用的通路，再重排每一段等待。韓祈在理由欄留下自己的名字，也留下仍未收到答案的問題；這份調度單會比預期更晚完成，但不能因此寫得更含糊。",
          "Medical requests and supply priorities remained with remote reception, retaining their intended destinations despite the lost on-site contact. The next duty personnel needed to confirm the squad's status, defender positions and usable routes before rescheduling each wait. Han left her name in the reasons field alongside the unanswered questions. The dispatch sheet would be completed later than planned. That was no reason to make it less precise.")
      ]
    },
    cleanup:[
      radio("chen","灰線，最後敵軍的位置已附在區域回報。保持隊形，沿確認過的通路清除威脅。","Greyline, the last attackers' positions are included in the area report. Keep formation and clear them through verified approaches."),
      radio("lin","不要為了最後一個目標放空装卸區。隊友留出掩護，再逐段把安全范围接起來。","Don't leave the loading zone unwatched for the final target. Keep squad cover available and connect the secure stretches one at a time.")
    ],
    operationNotes:[
      b("裝甲列車護衛：重裝與支援火力沿軌道兩側接力，整備空檔較長。貨場停放車輛仍提供掩護，先看住逼近裝卸區的通路。","Armored freight escort: heavy and support fire advance in succession along both sides of the tracks, with longer intervals. Parked yard vehicles provide cover. Watch the routes approaching the loading zone."),
      b("月台兩翼突擊：側翼接觸更頻繁，調度回報容易被換位打斷。小隊分開射界，保持呼應，再利用空檔完成整備。","Platform pincer: more frequent flank contacts can interrupt dispatch reports. Separate the squad's firing lanes, maintain coordination and use the intervals for recovery."),
      b("彈藥轉運：混合攻勢不斷逼近，補給整備較快。物資優先仍要具名，利用掩體和手榴彈守住裝卸區，別讓隊友被射線擋住。","Ammunition transfer: mixed attacks keep pressing in, with faster resupply. Supply priorities still need named responsibility. Use cover and grenades to hold the loading zone without blocking your squad's firing lanes.")
    ],
    afterword:[
      b("韓祈交班時會帶著兩份原始清單，以及後來逐項修正的那一份。她不會讓下一班只看見最整齊的版本，因為其中的延後影響過真實的傷員、士兵與接收人員。哪些時段曾被誤寫，哪些需求得到優先，哪些問題仍沒有答案，都需要能追溯到一個當時願意簽名的人。貨運站留下的責任因此比任何一箱貨物更難移交。",
        "When Han hands over her shift, she will bring both original manifests and the version corrected item by item. The next shift will see more than the tidiest sheet. Its delays affected real casualties, soldiers and reception staff. Misreported times, priority requests and unanswered questions must all be traceable to someone willing to sign at the time. The responsibility left by the depot is therefore harder to transfer than any individual crate."),
        b("這份值勤簿始於灰線接手本站那一刻，接收方要核對的是這裡獨立留下的紀錄：回報是否可靠、隊友是否得到照看、物資的等待是否被如實記下。當槍聲遠去，林岳、沈禾與陳隼曾建立的核對習慣仍能被下一班沿用。每一筆新簽名都接續一段責任，讓一張調度單不只記錄東西去了哪裡，也記錄人為何必須等待。",
        "This duty log begins when Greyline takes responsibility for the depot. Reception must check the independent records left here: whether reports were reliable, the squad received care and supplies waiting were recorded honestly. After the gunfire recedes, the checking habits established by Lin, Shen and Chen can pass to the next shift. Every new signature continues a responsibility. A dispatch sheet can record not only where things went, but why people had to wait.")
    ]
  }
};
