(function(){'use strict';
function init(){document.querySelectorAll('[data-curve]').forEach(function(box){
var dataNode=document.getElementById(box.getAttribute('data-curve'));if(!dataNode)return;
var data=JSON.parse(dataNode.textContent),input=box.querySelector('input'),out=box.querySelector('output');
function draw(){var i=Number(input.value);out.replaceChildren();var date=document.createElement('b');date.textContent=data.dates[i];out.appendChild(date);data.series.forEach(function(s){var el=document.createElement('span');if(s.color)el.style.setProperty('--series-color',s.color);el.textContent=s.name+'：'+s.values[i].toFixed(1)+data.unit;out.appendChild(el);});input.setAttribute('aria-valuetext',out.textContent);}
input.max=data.dates.length-1;input.value=input.max;input.addEventListener('input',draw);draw();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
/* Exact-value controls and opt-in CSV exports for existing article charts. */
(function(){'use strict';
function el(tag,cls,text){var x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;}
function csvCell(value){var s=value==null?'':String(value);if(/^[=+@]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
function init(){if(!document.querySelector('.research'))return;
document.querySelectorAll('.chartbox').forEach(function(box,index){
var cfg=box.__researchChart;if(!cfg||box.querySelector('.research-chart-control'))return;
var line=box.__researchChartKind==='line',xs=line?cfg.x:cfg.cats,fmt=line?cfg.yfmt:cfg.fmt;
if(!xs||!xs.length)return;
var label=function(i){return line&&cfg.xfmt?cfg.xfmt(xs[i],true):String(xs[i]);};
var series=cfg.series.slice();if(cfg.band){series.push({name:cfg.band.name+' 下界',values:cfg.band.lo});series.push({name:cfg.band.name+' 上界',values:cfg.band.hi});}
var controls=el('div','curve-control research-chart-control'),id='research-point-'+index;
var lab=el('label','',line?'選擇觀察點，查看完整數值':'選擇比較項目，查看完整數值');lab.htmlFor=id;
var input=el('input');input.type='range';input.id=id;input.min=0;input.max=xs.length-1;input.step=1;input.value=0;
var output=el('output','curve-readout');output.setAttribute('aria-live','polite');
function show(){var i=Number(input.value);output.replaceChildren(el('b','',label(i)));series.forEach(function(s){var v=s.values[i];output.appendChild(el('span','',s.name+'：'+(v==null?'沒有資料':fmt(v))));});if(cfg.extra&&cfg.extra[i])output.appendChild(el('span','',cfg.extra[i]));input.setAttribute('aria-valuetext',output.textContent);}
input.addEventListener('input',show);controls.append(lab,input,output);show();
var actions=el('div','research-chart-actions'),button=el('button','','下載本圖 CSV');button.type='button';button.addEventListener('click',function(){
var rows=[['項目'].concat(series.map(function(s){return s.name;})).concat(['補充說明'])];
xs.forEach(function(_,i){rows.push([label(i)].concat(series.map(function(s){return s.values[i];})).concat([cfg.extra&&cfg.extra[i]||'']));});
var text='\ufeff'+rows.map(function(r){return r.map(csvCell).join(',');}).join('\r\n');
var url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'}));var a=el('a');a.href=url;a.download=location.pathname.split('/').pop().replace('.html','')+'-'+(box.id||index)+'.csv';a.click();setTimeout(function(){URL.revokeObjectURL(url);},1000);
});actions.appendChild(button);controls.appendChild(actions);box.appendChild(controls);
});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();

/* Align genuinely numeric columns without rewriting content or assigning winners. */
(function(){'use strict';
function init(){document.querySelectorAll('.research .dtbl').forEach(function(table){
if(table.closest('.method-table'))return;
var rows=Array.from(table.querySelectorAll('tbody tr'));if(!rows.length)return;
var count=rows[0].cells.length;
if(rows.some(function(r){return r.cells.length!==count||Array.from(r.cells).some(function(c){return c.colSpan!==1||c.rowSpan!==1;});}))return;
for(var i=1;i<count;i++){
var cells=rows.map(function(r){return r.cells[i];});
var values=cells.map(function(c){return c.textContent.trim();}).filter(function(v){return v&&!/^[—–－-]$/.test(v);});
if(!values.length||!values.every(function(v){return /^[+−－–-]?[\d,.]+(?:\s*(?:%|％|元|倍|年|月|天|個月|個百分點))?$/.test(v);}))continue;
cells.forEach(function(c){c.classList.add('numeric');});
if(table.tHead)Array.from(table.tHead.rows).forEach(function(r){if(r.cells.length===count)r.cells[i].classList.add('numeric');});
}
});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
