// 每列為最低兌換量，也是其後的兌換單位；不是任意小數比例。
export const CUBE_PARTNERS=[
  {id:'eva',name:'長榮航空',kind:'航空',input:360,world:300,output:1000,unit:'哩',next:380,evidence:'航空端數值互核',sources:['cube-details','cube-eva']},
  {id:'ci',name:'中華航空',kind:'航空',input:840,world:720,output:1000,unit:'哩',next:1000,evidence:'航空端確認合作；比例依銀行',sources:['cube-details','cube-ci']},
  {id:'asia',name:'亞洲萬里通',kind:'航空',input:360,world:300,output:1000,unit:'哩',next:390,evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'emirates',name:'阿聯酋航空',kind:'航空',input:550,output:1000,unit:'哩',next:550,evidence:'航空端確認合作；比例依銀行',sources:['cube-details','cube-emirates']},
  {id:'united',name:'聯合航空',kind:'航空',input:510,output:1000,unit:'哩',evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'flying-blue',name:'法航／荷航 Flying Blue',kind:'航空',input:340,output:1000,unit:'哩',next:500,evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'aeroplan',name:'加拿大航空 Aeroplan',kind:'航空',input:510,output:1000,unit:'點',evidence:'航空端數值互核',sources:['cube-details','cube-aeroplan']},
  {id:'etihad',name:'阿提哈德航空',kind:'航空',input:420,output:1000,unit:'哩',evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'airasia',name:'亞洲航空',kind:'航空',input:250,output:1000,unit:'點',evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'ba',name:'英國航空 Avios',kind:'航空',input:450,output:1000,unit:'Avios',evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'qatar',name:'卡達航空 Avios',kind:'航空',input:480,output:1000,unit:'Avios',evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'jal',name:'日本航空 JAL',kind:'航空',input:480,output:1000,unit:'哩',next:480,evidence:'航空新舊頁有差異，採銀行2026表',sources:['cube-details','cube-jal-current','cube-jal-old']},
  {id:'marriott',name:'萬豪 Bonvoy',kind:'飯店',input:340,output:1000,unit:'點',next:340,evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'all',name:'雅高 ALL',kind:'飯店',input:600,output:1000,unit:'點',next:600,evidence:'酒店端數值與同名條件互核',sources:['cube-details','cube-all','cube-all-terms']},
  {id:'ihg',name:'IHG 優悅會',kind:'飯店',input:250,output:1000,unit:'點',next:250,evidence:'銀行當期完整條款；活動另看',sources:['cube-details']},
  {id:'thai',name:'泰國航空',kind:'航空',input:450,output:1000,unit:'哩',evidence:'銀行當期完整條款',sources:['cube-details']},
  {id:'sq',name:'新加坡航空',kind:'航空',input:620,output:1000,unit:'哩',evidence:'航空頁期間與入帳說明較舊',sources:['cube-details','network-sq-financial']},
  {id:'shangri-la',name:'香格里拉會',kind:'飯店',input:550,output:250,unit:'點',evidence:'銀行當期完整條款',sources:['cube-details']}
];
export function cubeQuote(partnerId,{year='2026',tier='normal',balance=0}={}){
  const partner=CUBE_PARTNERS.find(item=>item.id===partnerId);
  if(!partner)return null;
  const input=year==='2027'?(tier==='world'?null:partner.next??null):tier==='world'?(partner.world||partner.input):partner.input;
  const amount=Number(balance),valid=balance!==''&&balance!==null&&Number.isSafeInteger(amount)&&amount>=0;
  if(!input)return {partner,input:null,reason:year==='2027'&&tier==='world'?'2027世界卡專屬比例尚未明列':'2027調整表未列此夥伴；不代表終止，也不保證沿用'};
  const blocks=valid?Math.floor(amount/input):0;
  return {partner,input,blocks,spent:blocks*input,received:blocks*partner.output,remainder:valid?amount-blocks*input:null,valid};
}
export function cubeIhgPromotion(balance){
  const quote=cubeQuote('ihg',{balance}),base=quote.received,bonus=base/2;
  return {base,bonus,total:base+bonus,spent:quote.spent,remainder:quote.remainder,status:base>60000?'白金門檻':base>40000?'金卡門檻':'尚未超過會籍門檻'};
}
