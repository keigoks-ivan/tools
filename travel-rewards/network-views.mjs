const node=(id,x,y,title,subtitle,resources,opportunity_id,rule_ids,requirements,cost,timing,status='pending',extra={})=>({id,x,y,title,subtitle,resources,opportunity_id,rule_ids,requirements,cost,timing,status,kind:'酒店會籍',outcome:subtitle,...extra});
const edge=(id,from,to,status='pending',label='條件與來源須核對',extra={})=>({id,from,to,status,label,...extra});
export {node as networkNode,edge as networkEdge};
const mrStarts=['amex-mr','amex-platinum-charge','amex-gold-current','amex-platinum-credit','amex-regent','amex-charge'];
const note='圖上的資源與其他子圖共用。跨圖銜接仍須核對來源、一次性資格與每一步條件；已填資源不代表申請核准。';
export const EXTRA_TREES=[
  {id:'amex-hotels',name:'運通與酒店會籍',goals:['status'],width:1100,height:700,description:'同一張卡有多個酒店入口；先比較Hilton挑戰與贈送Gold的啟用順序。',note,nodes:[
    node('amex-charge',20,30,'運通簽帳白金','酒店會籍須另申請',['amex-platinum-charge'],null,['R048'],['限適用簽帳白金，不套用信用白金。'],'依卡年費；不重複計入既有支出。','各品牌需另申請。','start',{kind:'信用卡',bridge_resources:['amex-mr']}),
    node('amex-eva',20,240,'長榮運通白金','酒店禮遇與長榮哩分開',['amex-eva-platinum-card'],null,['R048','R025'],['酒店會籍入口不代表刷卡產生MR；長榮聯名卡不參加MR。'],'依卡年費與實際消費。','酒店申請與續卡升等各自核對。','start',{kind:'信用卡'}),
    node('amex-mb-gold',350,30,'萬豪金卡','可接新航銀卡候選分支',['mb-gold'],'P004',['R048','R060','R061','R063'],['先申請並取得正式會籍；處理約6–8週。','台灣運通此Gold禮遇頁列不能與FHR優惠合併，訂房前確認。','卡送Gold不代表新航一定接受；來源仍需審核。'],'信用卡費用另計。','持卡及帳戶條件影響維持。'),
    node('amex-hh-gold',350,220,'Hilton 金卡','先啟用會影響公開挑戰',['hh-gold'],'P004',['R048','R049','R034'],['須先有同名Hilton會員並另申請。','目前公開配對FAQ不受理既有Gold／Diamond；啟用順序先比較。'],'依原卡費用。','處理約6–8週；持卡且禮遇存續。'),
    node('amex-radisson',350,410,'Radisson Premium','兩張簽帳白金可另申請',['radisson-premium'],'N005',['R067'],['需另申請；新申請不受理美國地址。','停卡或帳戶信譽不佳可能取消；附卡適用另核。'],'依原卡費用。','依品牌核准與持卡條件。'),
    node('sq-silver-bridge',700,30,'新航銀卡挑戰','萬豪Gold：六個月兩趟',['sq-silver'],'P012',['R060','R061','R063'],['一次性合作登錄；先比較未來是否要走白金四趟Gold分支。','試用萬豪會籍排除；合格付費航班與入帳期限另核。'],'新增合格飛行費用。','登錄後六個月。','verified',{kind:'航空挑戰'}),
    node('other-hotel',20,570,'其他酒店高卡','還要近期住宿證明',['mb-gold','mb-platinum','gha-titanium','wyndham-diamond','bw-diamond'],null,['R034'],['須為表單接受的品牌／等級，不能把任何酒店高卡當成必收。','需近24個月該品牌住宿證明。'],'先使用已有資源；不為未核准活動多花費。','證明有效範圍24個月。','start'),
    node('hh-challenge',700,480,'Hilton 挑戰','其他高卡＋住宿證明',[],'P007',['R034','R035','R049','R064','R065'],['同時需接受的其他品牌會籍、近24個月住宿證明，以及目前Hilton一般／Silver。','未用過公開配對；先核准再入住，獎勵住宿不算。','公開FAQ與B2B附註範圍有差異，不能套用Gold可參加。'],'新增合格付費住宿及交通。','核准後90日：6晚Gold／共12晚Diamond。','pending',{kind:'酒店挑戰',join:'all'})
  ],edges:[edge('ap-mb','amex-charge','amex-mb-gold','verified'),edge('ae-mb','amex-eva','amex-mb-gold','verified'),edge('ap-hh','amex-charge','amex-hh-gold','verified'),edge('ae-hh','amex-eva','amex-hh-gold','verified'),edge('ap-ra','amex-charge','amex-radisson','verified'),edge('ae-ra','amex-eva','amex-radisson','verified'),edge('mb-sq','amex-mb-gold','sq-silver-bridge'),edge('other-hh','other-hotel','hh-challenge','pending','高卡＋住宿證明等條件')]},
  {id:'marriott-card',name:'萬豪卡的不同入口',goals:['status','hotel'],width:1100,height:680,description:'開卡會籍、消費升等、限量版與點數分開看；御璽不能套無限卡消費升等。',note,nodes:[
    node('mb-priority',20,30,'萬豪鼎尊無限卡','一般版：開卡Gold起點',['ctbc-marriott-priority'],null,['R056','R068'],['正卡、開卡、首刷與綁定等條件須完成。'],'牌告年費22,000元。','消費升等依信用卡年度。','start',{kind:'信用卡'}),
    node('mb-infinite',20,250,'萬豪無限／御璽','開卡Silver；消費升等不同',['ctbc-marriott-infinite','ctbc-marriott-signature'],null,['R056','R068'],['兩卡開卡Silver；只有一般無限卡列100萬元升Gold，御璽不套用。'],'無限上市優惠6,600元；御璽首年免年費，續年另核。','依各卡條件。','start',{kind:'信用卡'}),
    node('mb-limited',20,470,'萬豪鼎尊限量版','原梯次新件收件已截止',['ctbc-marriott-priority-limited'],'P010',['R056','R057'],['原案首年白金；10/15收件截止不能用10/31核卡期限替代。','既有持卡者依原核准條款；未達150萬元次年起Gold。'],'首年36,000元；次年22,000元。','不列為目前可新申請。','closed',{kind:'信用卡'}),
    node('mb-card-gold',350,30,'萬豪金卡','鼎尊開卡禮遇需完成啟用',['mb-gold'],null,['R056','R060'],['取得正式會籍後可查看新航Gold來源分支；新航仍須核准。','先比較一次性合作的登錄順序。'],'依原卡費用。','以銀行與酒店實際核准為準。'),
    node('mb-card-silver',350,250,'萬豪銀卡','不能直接參加新航Gold分支',['mb-silver'],null,['R056','R060'],['萬豪Silver不適用合作贈新航Silver／Gold。','點數與房晚仍可依各規則累積，不直接變成Gold。'],'依原卡費用。','不自動視為Gold。'),
    node('mb-spend-gold',700,360,'消費升萬豪金卡','一般無限正卡滿100萬元',['mb-gold'],'N002',['R068'],['僅一般無限正卡；每信用卡年度合格消費滿100萬元。','核卡後12個月與每信用卡年度起迄須核對，不用曆年代替。'],'既有支出不重複計成本，新增湊額與放棄回饋另算。','達標後30工作日內更新，效期至少一年。'),
    node('mb-spend-platinum',700,140,'消費升萬豪白金','鼎尊正卡滿150萬元',['mb-platinum'],'N001',['R068'],['鼎尊正卡每信用卡年度合格消費滿150萬元。','一般鼎尊與已持有限量版依各自續年條款；不能把其他卡消費直接合併。'],'新增湊額與機會成本另算，不把150萬元全當會籍售價。','信用卡年度；達標後30工作日、至少一年。')
  ],edges:[edge('mbp-gold','mb-priority','mb-card-gold','verified'),edge('mbi-silver','mb-infinite','mb-card-silver','verified'),edge('mbi-spend','mb-infinite','mb-spend-gold','pending','只限一般無限卡',{viaX:260}),edge('mbp-spend','mb-priority','mb-spend-platinum','pending','鼎尊正卡年度150萬',{viaX:260}),edge('mbl-spend','mb-limited','mb-spend-platinum','pending','已持卡者依續年條件',{viaX:295})]},
  {id:'marriott-entry',name:'萬豪挑戰與正常累積',goals:['status'],width:1100,height:700,description:'正常25／50資格房晚、一般客服、企業定向與新航合作，是不同入口。',note,nodes:[
    node('mb-public',20,30,'一般客服挑戰','八／十六晚僅為待核線索',[],'P008',['R031'],['尚無確認所有台灣會員可報名的正式公開條款。','先取得本人帳戶書面核准、精確起迄、合格住宿與效期。'],'未核准前不為固定晚數安排額外支出。','三個月／當月加三個月不可混用。','unverified',{kind:'酒店挑戰'}),
    node('mb-corporate',20,250,'企業／定向挑戰','須真實公司或邀請資格',[],'N004',['R032'],['公開可見連結不代表人人可參加。','公司、邀請、房晚、試用來源、起迄與保級條件待核。'],'依真正適用方案。','未取得完整適用條款。','unverified',{kind:'酒店挑戰'}),
    node('mb-earned',20,470,'正常房晚累積','Gold25／Platinum50個ENC',[],'N003',['R069','R058'],['按曆年合格房晚額度；部分品牌一實住晚只計0.5ENC，StudioRes不計。','正常定級可計的獎勵住宿，不代表合作挑戰也可計。','卡送ENC與實住晚必須分開。'],'新增合格住宿及點數機會成本；依已有ENC計缺口。','曆年1/1–12/31。','verified',{kind:'資格房晚'}),
    node('mb-approval',350,130,'先取得個別核准','不是看到文章就開始計時',[],null,['R031','R032'],['一般、企業、定向方案不得混成同一門檻。','試用階段不可直接當正式白金接新航。'],'核准後才按實際條款計成本。','以核准通知為準。','pending',{kind:'申請條件'}),
    node('mb-plat-earned',700,260,'萬豪正式白金','保留取得來源與到期日',['mb-platinum'],null,['R060','R062','R063','R069'],['完成挑戰與正常定級的後續接受條件仍各自核對。','萬豪試用會籍被新航合作條款排除；正式來源仍須審核。'],'來源路徑成本各自計算。','核對已獲發的正式會籍及效期。'),
    node('mb-gold-earned',700,470,'萬豪正式金卡','可另查看兩趟新航銀卡分支',['mb-gold'],null,['R060','R061','R063','R069'],['先比較未來是否先升白金；一次性合作不可假設重登。'],'依取得途徑。','正式會籍及個別合作資格另核。')
  ],edges:[edge('public-approve','mb-public','mb-approval'),edge('corp-approve','mb-corporate','mb-approval'),edge('approved-plat','mb-approval','mb-plat-earned'),edge('approved-gold','mb-approval','mb-gold-earned'),edge('earned-plat','mb-earned','mb-plat-earned','verified','50資格房晚'),edge('earned-gold','mb-earned','mb-gold-earned','verified','25資格房晚')]},
  {id:'points-air',name:'航空里程與升等',goals:['flight'],width:1100,height:720,description:'銀行點數、可兌換哩程、升等券與航空會籍分開；長榮運通不會產生MR。',note,nodes:[
    node('mr-air-source',20,30,'運通卡／MR積分','只限適用卡及計劃',['amex-mr'],null,['R043','R044'],['長榮聯名卡排除MR；指定卡另有計劃費用。','同一份MR只能配置一次，不能同時計入所有出口。'],'卡年費、計劃費與放棄回饋另計。','轉點不可撤回；先查空位。','start',{kind:'銀行點數',start_resources:mrStarts}),
    node('airline-miles',400,30,'五家航空出口','台灣MR：各1,000起、1:1',[],'P001',['R044'],['亞洲萬里通、泰航、新航、長榮、馬航；航空端門檻逐家核對。','先查空位、稅費、現金替代價；估2–3週不保證趕上空位。'],'轉入航空哩程不等於得到會籍。','現列至2027-06-30；1,000為單位。','verified',{kind:'航空里程',source_ids:['amex-mr-airlines','network-cathay-mr','network-sq-financial']}),
    node('dbs-source',20,230,'星展飛行積金','華航比例與另外三家不同',['dbs-fly'],null,['R011','R012'],['長榮／亞洲萬里通／新航6,000積金轉6,000哩；華航需12,000積金換6,000哩。','最低按輸出6,000哩，其後每1,000哩單位。'],'費用及原卡累積條件另核。','不能更改取消；同名帳戶。','start',{kind:'銀行點數',source_ids:['dbs-transfer','network-sq-financial']}),
    node('dbs-airlines',400,230,'星展四家航空出口','華航2:1；另外三家1:1',[],'N009',['R011','R012'],['長榮、亞洲萬里通、新航6,000積金換6,000哩；華航12,000積金換6,000哩。','此分支與MR五家航空名單不同，不互相套用。'],'原點數與費用另計。','現列至2027-06-30；不可取消。','verified',{kind:'航空里程',source_ids:['dbs-transfer','network-sq-financial']}),
    node('air-award',760,120,'航空獎勵機票','再選航線、艙等、日期與人數',[],null,['R015'],['不同航空的哩程不能因同聯盟就任意互轉。','獎勵空位、退改、稅費與定位成本未串接即時查詢。'],'用同條件現金票比較淨價值。','最低表列哩數不等於有空位。','pending',{kind:'旅行目標'}),
    node('eva-source',20,430,'長榮運通白金','刷卡長榮哩；另有續卡券',['amex-eva-platinum-card'],null,['R025','R038'],['長榮哩程與MR不同；續卡券是另一種權益。'],'原卡費用及機會成本。','續卡年度條件另核。','start',{kind:'信用卡'}),
    node('eva-upgrade',400,430,'兩次單段升等券','第二年起＋前一年滿120萬',[],'P003',['R025'],['持卡第二年起、前一年合格消費120萬元並續卡繳費。','兩次單段券不是兩張商務艙票；可用票價艙等及升等空位另核。'],'先比較合格付費原票與直接買商務艙差價。','券效期一年，實際核發與使用規則另核。','pending',{kind:'升等權益'}),
    node('mb-air-source',20,600,'萬豪獎勵點數','可接部分台灣銀行沒有的夥伴',['marriott-points'],null,['R073'],['轉出點數不是資格房晚或會籍。'],'包含來源點數機會成本。','先查個別航空門檻。','start',{kind:'酒店點數'}),
    node('marriott-air',760,540,'萬豪轉航空','多數3:1；例外與加碼逐家核對',[],'N007',['R073'],['不能套用所有航空同樣比例或加碼。','ANA、Aeroplan、Flying Blue、Qatar、土航等夥伴各自查最低量與限制。'],'多轉一層可能損耗，不因出口多就當作划算。','入帳、上限與獎勵空位另查。','pending',{kind:'航空里程'})
  ],edges:[edge('mr-air','mr-air-source','airline-miles','verified'),edge('dbs-air','dbs-source','dbs-airlines','verified','按DBS自己的航空比例'),edge('dbs-ticket','dbs-airlines','air-award'),edge('air-ticket','airline-miles','air-award'),edge('eva-cert','eva-source','eva-upgrade'),edge('mb-air','mb-air-source','marriott-air')]},
  {id:'points-hotel',name:'飯店點數的多種出口',goals:['hotel'],width:1100,height:650,description:'同一份點數選不同出口；轉點不等於酒店會籍，也不一定比現金訂房划算。',note,nodes:[
    node('mr-hotel-source',20,30,'運通卡／MR積分','與長榮聯名哩程不同',['amex-mr'],null,['R013','R014','R043'],['先核對台灣卡片與計劃費；同一份積分不能同時分配兩家。'],'MR機會成本及轉點費用。','估2–3週。','start',{kind:'銀行點數',start_resources:mrStarts}),
    node('mr-marriott',400,30,'萬豪獎勵點數','1,000 MR → 900 Bonvoy',['marriott-points'],'H001',['R013','R050'],['發卡方比例已讀，酒店端台灣精確比例未全互核。','1,000MR最低及單位；不能因點數增減直接判定好壞。'],'同日期同房型現金價與獎勵房價。','現列至2027-06-30；不可回MR。','verified',{kind:'酒店點數'}),
    node('mr-hilton',400,230,'Hilton 獎勵點數','1,000 MR → 1,250 Hilton',['hilton-points'],'H002',['R014','R050'],['標準房、連住與實際房價另核。','不因1,250比900大就當作更划算。'],'同日期房價、稅費與MR機會成本。','現列至2027-06-30；估2–3週。','verified',{kind:'酒店點數'}),
    node('hsbc-source',20,450,'滙豐旅人積分','卓越紅利是另一種資產',['hsbc-travel'],null,['R001','R002','R003','R004'],['旅人旅遊積分與卓越理財紅利分開；本圖比例只指旅人。'],'卡年費與積分機會成本。','銀行現期2026/10/1–12/31。','start',{kind:'銀行點數'}),
    node('hsbc-all',400,450,'ALL 獎勵點數','旅人1:1；銀行最低3,000',['all-points'],'H003',['R002','R003','R071'],['銀行操作每次3,000起、500單位；保留ALL介紹不同文字。','轉入Reward points不計升等／保級。'],'同條件現金房價比較。','正卡同名；即時或異常作業時間依官方。','pending',{kind:'酒店點數',source_ids:['hsbc-hotel','accor-hsbc','network-all-hsbc-terms']}),
    node('hsbc-hotels',760,450,'萬豪／IHG 點數','旅人1:1；同名與門檻另核',[],'N006',['R074'],['銀行現頁列三個酒店出口；卓越紅利為2:1，不能混用。','旅人最低3,000、500單位；萬豪每日轉入上限750,000。'],'原有旅程與積分機會成本。','2026/10/1–12/31；個別夥伴入帳另核。','verified',{kind:'酒店點數',source_ids:['hsbc-hotel']}),
    node('hotel-award',760,100,'獎勵住宿','先查房型、日期與現金替代價',[],null,['R013','R014'],['可兌換點數與會籍、房晚是不同資源。','持有點數不代表當天有獎勵房。'],'比較稅費、取消條件與現金回饋。','未連接即時房況。','pending',{kind:'旅行目標'})
  ],edges:[edge('mr-mb','mr-hotel-source','mr-marriott','verified'),edge('mr-hh','mr-hotel-source','mr-hilton','verified'),edge('hs-all','hsbc-source','hsbc-all','pending','銀行操作門檻採3,000'),edge('hs-hotels','hsbc-source','hsbc-hotels','verified'),edge('mb-stay','mr-marriott','hotel-award'),edge('hh-stay','mr-hilton','hotel-award')]},
  {id:'all-qatar',name:'ALL與Qatar的三種合作',goals:['hotel','flight','status'],width:1100,height:700,description:'雙重累積、點數兌換與會籍加速各自核對；雙向轉點比例並不對稱。',note:'另有會籍加速，但首次合格活動、名額、等級與來源尚未全核，本圖不把連結帳戶直接當作已取得高卡。',nodes:[
    node('all-member',20,30,'ALL 帳戶','先核對其他航空連結',['all-account'],null,['R020','R070'],['ALL通常同時只連一家航空雙重累積；改連通常須距前次連結12個月。'],'不預設為了連結需新增消費。','跨洲遷居例外與改連程序另核。','start',{kind:'會員帳戶'}),
    node('qatar-member',20,230,'Qatar 帳戶','須同名與符合活動資格',['qatar-account'],null,['R020'],['新加入會員有國際活動條件；不得只連結就假設住宿Avios可入帳。'],'以已有旅程比較。','依實際會員及飛行紀錄。','start',{kind:'會員帳戶'}),
    node('dual-rewards',450,110,'合格活動雙重累積','兩個帳戶＋連結＋合格消費',[],'P011',['R020','R070'],['須同名雙帳戶、符合連結限制，並完成合格住宿或Qatar自營QR航班。','OTA、全額點數住宿排除；品牌及房價條件另核。','不是把同一份點數複製兩次，也不是直接給會籍。'],'按原有旅程與替代房價／票價計增量。','活動與實際入帳逐項追蹤。','pending',{kind:'雙重累積',join:'all',source_ids:['accor-qatar','qatar-accor','network-all-qatar-terms']}),
    node('all-points-source',20,440,'ALL 獎勵點數','與升等點數不同',['all-points'],null,['R071','R072'],['確認可轉餘額與連結資格。'],'放棄原可用住宿價值。','轉點不可撤回。','start',{kind:'酒店點數'}),
    node('all-to-qatar',450,440,'轉成 Qatar Avios','2,000 ALL → 1,500 Avios',['avios'],'N008',['R072'],['反向不能還原原數量；不是等值兌回。','最多六週，先核對機位與入帳。'],'按可實際兌換旅程計值。','兩方向各自不可逆。','verified',{kind:'航空里程'}),
    node('avios-source',20,580,'Qatar Avios','不要把來回轉點當套利',['avios'],null,['R072'],['確認可轉餘額與合作資格。'],'放棄原航空兌票用途。','不可撤回。','start',{kind:'航空里程'}),
    node('qatar-to-all',760,580,'轉成 ALL 獎勵點數','3,500 Avios → 1,000 ALL',['all-points'],'N008',['R072'],['不同方向比例與條款各自適用。','轉回ALL仍不等於取得酒店會籍。'],'按實際住宿可抵金額比較。','最多六週；各自不可逆。','verified',{kind:'酒店點數'})
  ],edges:[edge('all-dual','all-member','dual-rewards','pending','兩邊同時需要'),edge('qatar-dual','qatar-member','dual-rewards','pending','兩邊同時需要'),edge('all-avios','all-points-source','all-to-qatar','verified'),edge('avios-all','avios-source','qatar-to-all','verified')]}
];
export const RESOURCE_BINDINGS={
  'sas-chain':{visa:['visa-infinite'],mastercard:['mc-elite'],gha:['gha-titanium'],wyndham:['wyndham-diamond'],bw:['bw-diamond'],scandic:['scandic-five'],sas:['sas-gold'],turkish:['tk-elite']},
  'marriott-sq':{'mb-gold':['mb-gold'],'mb-plat':['mb-platinum'],'sq-silver':['sq-silver'],'sq-gold':['sq-gold'],'sq-elite-source':['sq-gold'],'mb-plat-target':['mb-platinum']},
  'ci-card':{'ci-priority':['ctbc-ci-priority'],'ci-precious':['ctbc-ci-precious'],'ci-signature':['ctbc-ci-signature'],'ci-miles':['ci-miles'],'ci-gold':['ci-gold']}
};
export const OP_BINDINGS={'sas-chain':{sas:'P009'},'marriott-sq':{'sq-silver':'P012','sq-gold':'P005','mb-plat-target':'P006'},'ci-card':{'ci-award':'P002','ci-gold':'P013'}};
