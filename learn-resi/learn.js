/* ==========================================================================
   learn.js — shared JS for tools.investmquest.com/learn-cre/
   Bilingual toggle + quiz engine + progress tracker + slider-calc helper.
   Vanilla JS, no dependencies. Defensive: every JSON.parse / DOM lookup
   is guarded so one malformed module page can't break the whole script.
   ========================================================================== */

/* ── language ─────────────────────────────────────────────────────────
   Shares the 'lang' localStorage key with the rest of tools.investmquest.com
   (see /cre.html) so a visitor's language choice carries across the site. */
var currentLang = (function(){
  try{ return localStorage.getItem('lang') || 'en'; }catch(e){ return 'en'; }
})();

function elDisplay(el){
  // Return the natural display value for an element so CSS .lang-zh{display:none}
  // doesn't win when we clear the inline style on visible elements.
  var t = el.tagName;
  if(t==='SPAN'||t==='A'||t==='EM'||t==='STRONG'||t==='BR') return 'inline';
  if(t==='TR') return 'table-row';
  if(t==='TD'||t==='TH') return 'table-cell';
  return 'block';
}

function setLang(lang){
  if(lang!=='en' && lang!=='zh') lang='en';
  currentLang = lang;
  try{ localStorage.setItem('lang', lang); }catch(e){}

  document.querySelectorAll('.lang-en').forEach(function(e){
    e.style.display = lang==='en' ? elDisplay(e) : 'none';
  });
  document.querySelectorAll('.lang-zh').forEach(function(e){
    e.style.display = lang==='zh' ? elDisplay(e) : 'none';
  });
  document.querySelectorAll('.lang-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-lang')===lang);
  });
  document.documentElement.setAttribute('lang', lang==='en' ? 'en' : 'zh-Hant');

  // quiz blocks render their own bilingual markup per-question rather than
  // relying on the generic lang-en/lang-zh CSS toggle, so they must be
  // explicitly told to re-render whenever the language changes.
  renderAllQuizzes();
}

/* ── small helpers ───────────────────────────────────────────────────── */
function lcPick(obj, lang){
  if(!obj) return '';
  if(typeof obj === 'string') return obj;
  return obj[lang] || obj.en || obj.zh || '';
}
function lcEsc(str){
  return String(str==null ? '' : str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── quiz engine ─────────────────────────────────────────────────────────
   Usage: <div class="quiz-block" data-quiz='[
     {"q":{"en":"...","zh":"..."},
      "opts":[{"en":"..","zh":".."}, {"en":"..","zh":".."}],
      "a":0,
      "exp":{"en":"..","zh":".."}}
   ]'></div>
   - data-quiz is a JSON array; each item is one question.
   - "a" is the zero-based index of the correct option.
   - Optional data-quiz-id="module-slug-q1" groups a score into the
     progress tracker; falls back to an auto id if omitted.
   ------------------------------------------------------------------------ */
function initQuizzes(){
  var blocks = document.querySelectorAll('.quiz-block[data-quiz]');
  blocks.forEach(function(block, idx){
    if(block._quizData) return; // already initialized
    var raw = block.getAttribute('data-quiz');
    var data;
    try{ data = JSON.parse(raw); }catch(e){
      console.warn('learn.js: invalid data-quiz JSON, skipping block', e);
      return;
    }
    if(!Array.isArray(data)) data = [data];
    data = data.filter(function(item){ return item && item.q && Array.isArray(item.opts); });
    if(!data.length) return;

    block._quizData = data;
    block._quizState = data.map(function(){ return { selected: null }; });
    block._quizId = block.getAttribute('data-quiz-id') || ('quiz-' + idx + '-' + (location.pathname.split('/').pop() || 'page'));
    renderQuizBlock(block);
  });
}

function renderQuizBlock(block){
  if(!block || !block._quizData) return;
  var data = block._quizData, state = block._quizState, lang = currentLang;
  var html = '';

  data.forEach(function(item, qi){
    var st = state[qi];
    html += '<div class="quiz-q">';
    html += '<p class="quiz-question">' + (qi+1) + '. ' + lcEsc(lcPick(item.q, lang)) + '</p>';
    html += '<div class="quiz-opts">';
    item.opts.forEach(function(opt, oi){
      var cls = 'quiz-opt';
      var answered = st.selected !== null;
      if(answered){
        if(oi === item.a) cls += ' correct';
        else if(oi === st.selected) cls += ' wrong';
      }
      html += '<button type="button" class="' + cls + '"' + (answered ? ' disabled' : '') +
        ' data-qi="' + qi + '" data-oi="' + oi + '">' + lcEsc(lcPick(opt, lang)) + '</button>';
    });
    html += '</div>';
    if(st.selected !== null){
      var correct = st.selected === item.a;
      var prefix = correct
        ? (lang==='en' ? '✓ Correct. ' : '✓ 答對了。')
        : (lang==='en' ? '✗ Not quite. ' : '✗ 不太對。');
      html += '<div class="quiz-explain">' + lcEsc(prefix) + lcEsc(lcPick(item.exp, lang)) + '</div>';
    }
    html += '</div>';
  });

  var answeredCount = state.filter(function(s){ return s.selected !== null; }).length;
  if(data.length && answeredCount === data.length){
    var score = state.filter(function(s, i){ return s.selected === data[i].a; }).length;
    var tail = lang==='en' ? ' — review the sections above for anything missed.' : ' — 如有答錯，回頭複習上方內容。';
    html += '<div class="quiz-score">' + score + '/' + data.length + tail + '</div>';
    recordQuizScore(block._quizId, score, data.length);
  }

  block.innerHTML = html;
  block.querySelectorAll('.quiz-opt').forEach(function(btn){
    btn.addEventListener('click', function(){
      var qi = parseInt(btn.getAttribute('data-qi'), 10);
      var oi = parseInt(btn.getAttribute('data-oi'), 10);
      if(isNaN(qi) || isNaN(oi)) return;
      if(block._quizState[qi].selected !== null) return;
      block._quizState[qi].selected = oi;
      renderQuizBlock(block);
    });
  });
}

function renderAllQuizzes(){
  document.querySelectorAll('.quiz-block[data-quiz]').forEach(renderQuizBlock);
}

/* ── progress tracker ─────────────────────────────────────────────────
   localStorage shape: { visited: { "01-basics.html": true, ... },
                          quizzes: { "quiz-id": { score, total } } } */
var LC_PROGRESS_KEY = 'resi_course_progress';

function lcGetProgress(){
  try{
    var raw = localStorage.getItem(LC_PROGRESS_KEY);
    var p = raw ? JSON.parse(raw) : null;
    if(!p || typeof p !== 'object') p = {};
    if(!p.visited) p.visited = {};
    if(!p.quizzes) p.quizzes = {};
    return p;
  }catch(e){
    return { visited:{}, quizzes:{} };
  }
}
function lcSaveProgress(p){
  try{ localStorage.setItem(LC_PROGRESS_KEY, JSON.stringify(p)); }catch(e){}
}
function markModuleVisited(page){
  if(!page) return;
  var p = lcGetProgress();
  p.visited[page] = true;
  lcSaveProgress(p);
}
function recordQuizScore(quizId, score, total){
  if(!quizId) return;
  var p = lcGetProgress();
  p.quizzes[quizId] = { score: score, total: total };
  lcSaveProgress(p);
}

// Auto-mark the current page visited, unless it's the course home or the
// module template (those aren't "modules completed").
function autoMarkVisited(){
  var page = (location.pathname.split('/').pop() || '').trim();
  if(!page) return;
  if(page === 'index.html' || page === '_template.html') return;
  if(!/^\d\d-.*\.html$/.test(page)) return;
  markModuleVisited(page);
}

// Course home page: stamp a done-badge on any .module-card whose href
// matches a visited module page.
function applyProgressToCourseMap(){
  var map = document.querySelector('.course-map');
  if(!map) return;
  var p = lcGetProgress();
  map.querySelectorAll('.module-card').forEach(function(card){
    var href = card.getAttribute('href') || '';
    var page = href.split('/').pop();
    if(page && p.visited[page]){
      card.classList.add('completed');
      if(!card.querySelector('.module-card-done')){
        var badge = document.createElement('span');
        badge.className = 'module-card-done';
        badge.textContent = '✓';
        card.appendChild(badge);
      }
    }
  });
}

/* ── slider-calculator helper ────────────────────────────────────────
   initCalc(id, computeFn)
   - id: the DOM id of the .calc-card element.
   - computeFn(values): receives { inputName: numericValue, ... } built
     from every input[type=range]/input[type=number] inside the card
     (keyed by name, falling back to id), returns { outKey: displayValue }.
   Each output key is written into a `[data-out="outKey"]` element in the
   card, and each input's live value is echoed into any
   `[data-echo="inputId"]` element (typically next to a slider). */
function initCalc(id, computeFn){
  var card = document.getElementById(id);
  if(!card || typeof computeFn !== 'function') return;
  var inputs = card.querySelectorAll('input[type=range], input[type=number]');
  if(!inputs.length) return;

  function update(){
    var values = {};
    inputs.forEach(function(inp){
      var key = inp.name || inp.id;
      if(!key) return;
      var n = parseFloat(inp.value);
      values[key] = isNaN(n) ? 0 : n;
      if(inp.id){
        var echo = card.querySelector('[data-echo="' + inp.id + '"]');
        if(echo) echo.textContent = inp.value;
      }
    });
    var outputs;
    try{
      outputs = computeFn(values) || {};
    }catch(e){
      console.warn('learn.js: initCalc computeFn threw', e);
      outputs = {};
    }
    Object.keys(outputs).forEach(function(key){
      var out = card.querySelector('[data-out="' + key + '"]');
      if(out) out.textContent = outputs[key];
    });
  }

  inputs.forEach(function(inp){
    inp.addEventListener('input', update);
  });
  update();
}

/* ── boot ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function(){
  initQuizzes();
  setLang(currentLang);
  autoMarkVisited();
  applyProgressToCourseMap();
});
