(function(){'use strict';
function init(){document.querySelectorAll('[data-curve]').forEach(function(box){
var dataNode=document.getElementById(box.getAttribute('data-curve'));if(!dataNode)return;
var data=JSON.parse(dataNode.textContent),input=box.querySelector('input'),out=box.querySelector('output');
function draw(){var i=Number(input.value);out.replaceChildren();var date=document.createElement('b');date.textContent=data.dates[i];out.appendChild(date);data.series.forEach(function(s){var el=document.createElement('span');el.textContent=s.name+'：'+s.values[i].toFixed(1)+data.unit;out.appendChild(el);});input.setAttribute('aria-valuetext',out.textContent);}
input.max=data.dates.length-1;input.value=input.max;input.addEventListener('input',draw);draw();});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
