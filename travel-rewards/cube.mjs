import {CUBE_PARTNERS,cubeQuote,cubeIhgPromotion} from './cube-data.mjs?v=20261024-11';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=value=>new Intl.NumberFormat('zh-TW').format(value);
const tableHint='<p class="cube-table-hint">左右滑動表格，查看餘額試算與查核範圍 →</p>';
export function cubeRows({year='2026',tier='normal',balance=0,kind='all'}={}){
  return CUBE_PARTNERS.filter(item=>kind==='all'||item.kind===kind).map(partner=>{
    const quote=cubeQuote(partner.id,{year,tier,balance});
    return '<tr><th>'+esc(partner.name)+'<small>'+partner.kind+'</small></th><td>'+(quote.input?'<b>'+num(quote.input)+'</b> → '+num(partner.output)+' '+partner.unit:'<span class="cube-unconfirmed">尚未確認</span>')+'</td><td>'+(quote.input?(quote.valid?num(quote.received)+' '+partner.unit+'<small>用 '+num(quote.spent)+' 點，餘 '+num(quote.remainder)+' 點</small>':'請填非負整數餘額'):esc(quote.reason))+'</td><td>'+esc(year==='2027'?'已公告未生效；尚未核對實際操作':partner.evidence)+'</td></tr>';
  }).join('');
}
export function cubePanel(){
  return '<section class="cube-panel" data-cube-panel><div class="cube-panel-heading"><div><p class="eyebrow">國泰世華 · 小樹點（信用卡）</p><h2>同一份點數，先比較18個出口</h2><p>輸入現有餘額，以整批最低量試算。輸出數量不能直接比較價值，也不代表有獎勵機位或房況。</p></div><span class="cube-period">2026現行／2027公告分開</span></div><div class="cube-controls"><label>轉點年度<select data-cube-year><option value="2026">2026現行（至12/31）</option><option value="2027">2027已公告（尚未生效）</option></select></label><label>轉點卡別<select data-cube-tier><option value="normal">CUBE／其他卡別</option><option value="world">合格國泰世華世界卡</option><option value="asia-world">亞洲萬里通世界卡</option></select></label><label>小樹點（信用卡）餘額<input data-cube-balance type="number" min="0" max="1000000000" step="1" inputmode="numeric" value="1000"></label><label>出口<select data-cube-kind><option value="all">全部18家</option><option value="航空">航空14家</option><option value="飯店">飯店4家</option></select></label></div><p class="cube-context" data-cube-context role="status">2026：每列左側同時是最低轉出量與增量。亞洲萬里通世界卡按其他卡別，不享指定三家世界卡比例。</p>'+tableHint+'<div class="table-wrap cube-table"><table><thead><tr><th>夥伴</th><th>每批小樹點 → 可得</th><th>餘額試算</th><th>核對範圍</th></tr></thead><tbody data-cube-rows>'+cubeRows({balance:1000})+'</tbody></table></div><div class="cube-notes"><p>正卡本人、同名會員帳戶、CUBE App操作；轉點不可撤銷。華航／亞洲萬里通約3–14工作日，其餘原則即時，系統異常另計。一般轉點手續費與總上限未在完整頁明列，操作前看App。</p><p>CUBE Level決定指定方案的累點條件，不會讓CUBE卡變成世界卡優惠資格。小樹點（生活）不計入這裡；轉入獎勵點數通常不等於會籍或資格房晚。</p><p>2027表是9家「調整項目」，其他9家及世界卡專屬比例仍待確認。JAL舊頁仍有670轉1,000，採銀行2026表的480；新航航空頁仍留較舊期間及入帳說明。</p><p><a href="https://www.cathay-cube.com.tw/cathaybk/personal/event/overview/credit-card/bonus/point-exchange/airmiles/" target="_blank" rel="noopener noreferrer">銀行2026完整兌換表 ↗</a> · <a href="https://www.cathaybk.com.tw/cathaybk/promo/event/credit-card/discount/2027/pointannounceInfo/index.html" target="_blank" rel="noopener noreferrer">銀行2027調整公告 ↗</a> · <button type="button" class="text-button" data-open-tree="cube-points" data-open-node="cube-air">看逐段條件與來源 ↗</button></p></div><details class="cube-promo"><summary>限時例外：小樹點轉IHG加50%，也有會籍門檻</summary><p>2026/10/1–11/30申請：250小樹點 → 1,000基本IHG點＋500加碼。會籍看基本轉入累計「超過」40,000／60,000，不包含加碼。</p><div class="cube-promo-result" data-cube-promo role="status">'+promotionMarkup(1000)+'</div><p>以1,000基本點為單位，保守推算金卡需10,250小樹點、白金需15,250點。這是按「超過」字義推算，不把恰好40,000／60,000當成已達標。現有累計轉點若非零，請另與App／銀行核對。</p><p>銀行條款已讀；IHG端本次活動尚未獨立確認。新獲會籍到期日未明列；原2026年底到期Gold／Platinum達門檻延至2027年底另有條件。<a href="https://www.cathay-cube.com.tw/cathaybk/personal/event/overview/credit-card/travel/202609/miles20251011" target="_blank" rel="noopener noreferrer">看銀行活動全文 ↗</a></p></details>'+otherPromotions()+'</section>';
}
function promotionMarkup(balance){
  if(balance===''||!Number.isSafeInteger(Number(balance))||Number(balance)<0)return '請填非負整數餘額。';
  const result=cubeIhgPromotion(balance);
  return '<b>若這筆於活動期內完成申請，且此前累計為0：</b><p>基本 '+num(result.base)+' ＋ 加碼 '+num(result.bonus)+' ＝ '+num(result.total)+' IHG點</p><p>'+result.status+'；使用 '+num(result.spent)+' 小樹點，餘 '+num(result.remainder)+' 點。</p><small>不代表活動今天仍開放或帳戶已獲核准；先核對日期與個人累計。</small>';
}
function otherPromotions(){
  return '<details class="cube-promo"><summary>航空另有三種限時加碼，日期與登錄分開看</summary><div class="cube-campaigns"><article><b>JAL：加30%</b><p>2026/10/1–11/30發起轉點，每480小樹點轉1,000基本哩＋300加碼哩，不設加碼上限；兩筆同時入帳。</p></article><article><b>Flying Blue：加20%</b><p>2026/10/1 07:00–11/1 07:59發起轉點，每340小樹點轉1,000基本哩＋200加碼哩，不設加碼上限；不能套用IHG的11/30截止。</p></article><article><b>亞洲萬里通：須另外登錄</b><p>10/1–10/31轉點滿10,000／20,000里，加800／1,600里，每正卡戶最高1,600。10/28 16:00至10/30 23:59登錄，限2,000名；查核日尚未開放登錄，未查實際剩餘名額。加碼約活動後8–10週，最晚預計2027/1/8。</p><p>航空端另有80周年再加碼，完整條件尚待另核，這裡不自動疊加。</p></article></div><p>以上採銀行本次完整活動條款，夥伴端未全部獨立互核。不能將其中一家的登錄、日期或上限套到另一家；本頁18家試算仍顯示基本轉點，不自動加碼。<a href="https://www.cathay-cube.com.tw/cathaybk/personal/event/overview/credit-card/travel/202609/miles20251011" target="_blank" rel="noopener noreferrer">銀行活動與各別注意事項 ↗</a></p></details>';
}
export function wireCubeTools(root){
  const update=event=>{
    const panel=event.target.closest('[data-cube-panel]');if(!panel)return;
    const year=panel.querySelector('[data-cube-year]').value,selected=panel.querySelector('[data-cube-tier]').value,tier=selected==='world'?'world':'normal',balance=panel.querySelector('[data-cube-balance]').value,kind=panel.querySelector('[data-cube-kind]').value;
    panel.querySelector('[data-cube-rows]').innerHTML=cubeRows({year,tier,balance,kind});
    panel.querySelector('[data-cube-context]').textContent=year==='2027'?'2027尚未生效。只列9家調整；未列不代表終止或保證沿用。世界卡專屬表未明列，不能改套一般表。':tier==='world'?'2026合格世界卡：長榮／亞洲萬里通300、華航720小樹點起；其餘依各家一般表。亞洲萬里通世界卡不適用此優惠。':'2026：每列左側同時是最低轉出量與增量。亞洲萬里通世界卡按其他卡別，不享指定三家世界卡比例。';
    panel.querySelector('[data-cube-promo]').innerHTML=promotionMarkup(balance);
  };
  root.addEventListener('input',event=>{if(event.target.matches('[data-cube-balance]'))update(event);});
  root.addEventListener('change',event=>{if(event.target.matches('[data-cube-year],[data-cube-tier],[data-cube-kind]'))update(event);});
}
