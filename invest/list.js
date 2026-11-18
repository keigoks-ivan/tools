/* 文章與分類定義在 questions.html。新增文章時指定 data-topic、data-angle 和 data-markets。 */
(function () {
  'use strict';

  var PAGE_SIZE = 8;
  var form = document.getElementById('question-search');
  if (!form) return;
  var query = document.getElementById('question-query');
  var market = document.getElementById('question-market');
  var angle = document.getElementById('question-angle');
  var level = document.getElementById('question-level');
  var topics = document.getElementById('question-topics');
  var results = document.getElementById('question-results');
  var filters = document.getElementById('question-filters');
  var heading = document.getElementById('results-heading');
  var count = document.getElementById('question-count');
  var empty = document.getElementById('question-empty');
  var back = document.getElementById('browse-back');
  var reset = document.getElementById('reset-filters');
  var pages = document.getElementById('question-pages');
  var previous = document.getElementById('previous-page');
  var next = document.getElementById('next-page');
  var position = document.getElementById('page-position');
  var topicLinks = Array.from(document.querySelectorAll('.topic-link'));
  var topicLabels = new Map(topicLinks.map(function (link) {
    return [link.dataset.topic, link.querySelector('.topic-label').textContent];
  }));

  function normalize(text) {
    return text.normalize('NFKC').toLowerCase().trim();
  }

  var articles = Array.from(document.querySelectorAll('.question-row')).map(function (node) {
    return {
      node: node,
      topic: node.dataset.topic,
      markets: node.dataset.markets.split(' '),
      angle: node.dataset.angle,
      level: node.dataset.level === 'advanced' ? 'advanced' : 'basic',
      answers: Array.from(node.querySelectorAll('.question-answer')),
      text: normalize(node.textContent + ' ' + node.dataset.search + ' ' +
        node.dataset.markets + ' ' + node.dataset.angle + ' ' + (topicLabels.get(node.dataset.topic) || ''))
    };
  });

  document.getElementById('article-count').textContent = articles.length;
  topicLinks.forEach(function (link) {
    var n = articles.filter(function (article) { return article.topic === link.dataset.topic; }).length;
    link.querySelector('.topic-count').textContent = n + ' 篇';
  });

  var state;
  function selectOption(control, value) {
    return Array.from(control.options).some(function (option) { return option.value === value; }) ? value : '';
  }

  function readLocation() {
    var params = new URLSearchParams(location.search);
    var topic = params.get('topic');
    var number = Number(params.get('page'));
    state = {
      q: params.get('q') || '',
      topic: topic === 'all' || topicLabels.has(topic) ? topic : '',
      market: selectOption(market, params.get('market')),
      angle: selectOption(angle, params.get('angle')),
      level: selectOption(level, params.get('level')),
      page: Number.isSafeInteger(number) && number > 0 ? number : 1
    };
  }

  function syncLocation(action) {
    var params = new URLSearchParams(location.search);
    ['topic', 'q', 'market', 'angle', 'level', 'page'].forEach(function (key) {
      var value = key === 'page' && state.page === 1 ? '' : state[key];
      if (value) params.set(key, value);
      else params.delete(key);
    });
    var search = params.toString();
    var url = location.pathname + (search ? '?' + search : '') + location.hash;
    if (url !== location.pathname + location.search + location.hash) {
      history[action + 'State'](null, '', url);
    }
  }

  function render() {
    var words = normalize(state.q).split(/\s+/).filter(Boolean);
    var filtered = words.length > 0 || state.market !== '' || state.angle !== '' || state.level !== '';
    var browsing = !state.topic && !filtered;
    var matched = articles.filter(function (article) {
      return (!state.topic || state.topic === 'all' || article.topic === state.topic) &&
        (!state.market || article.markets.includes(state.market)) &&
        (!state.angle || article.angle === state.angle) &&
        (!state.level || article.level === state.level) &&
        words.every(function (word) { return article.text.includes(word); });
    });
    var totalPages = Math.max(1, Math.ceil(matched.length / PAGE_SIZE));
    state.page = Math.min(state.page, totalPages);
    var start = (state.page - 1) * PAGE_SIZE;
    var visible = new Set(matched.slice(start, start + PAGE_SIZE));

    query.value = state.q;
    market.value = state.market;
    angle.value = state.angle;
    level.value = state.level;
    topics.hidden = !browsing;
    results.hidden = browsing;
    filters.hidden = browsing;
    back.hidden = browsing;
    reset.hidden = !filtered;

    articles.forEach(function (article) {
      article.node.hidden = !visible.has(article);
      var answer = article.answers.find(function (candidate) {
        return candidate.dataset.market === state.market;
      }) || article.answers[0];
      article.answers.forEach(function (candidate) { candidate.hidden = candidate !== answer; });
    });

    heading.textContent = topicLabels.get(state.topic) || (words.length ? '搜尋結果' : '全部文章');
    count.textContent = matched.length ? '共 ' + matched.length + ' 篇，顯示 ' + (start + 1) + '–' +
      Math.min(start + PAGE_SIZE, matched.length) + ' 篇' : '共 0 篇';
    empty.hidden = matched.length > 0;
    pages.hidden = totalPages <= 1;
    previous.disabled = state.page === 1;
    next.disabled = state.page === totalPages;
    position.textContent = '第 ' + state.page + ' / ' + totalPages + ' 頁';
  }

  function choose(update, action, focus) {
    Object.assign(state, { page: 1 }, update);
    render();
    syncLocation(action);
    if (focus) (results.hidden ? document.getElementById('topic-heading') : heading).focus();
  }

  document.querySelectorAll('a[data-topic]').forEach(function (link) {
    link.addEventListener('click', function (event) {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      choose({ topic: link.dataset.topic, q: '', market: '', angle: '', level: '' }, 'push', true);
    });
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    choose({ q: query.value }, 'replace', true);
  });
  function searchInput(event) {
    if (!event.isComposing) choose({ q: query.value }, 'replace');
  }
  query.addEventListener('input', searchInput);
  query.addEventListener('compositionend', searchInput);
  market.addEventListener('change', function () { choose({ market: market.value }, 'push'); });
  angle.addEventListener('change', function () { choose({ angle: angle.value }, 'push'); });
  level.addEventListener('change', function () { choose({ level: level.value }, 'push'); });
  reset.addEventListener('click', function () {
    choose({ q: '', market: '', angle: '', level: '' }, 'push');
    query.focus();
  });

  function turnPage(delta) {
    state.page += delta;
    render();
    syncLocation('push');
    heading.focus();
  }

  previous.addEventListener('click', function () { turnPage(-1); });
  next.addEventListener('click', function () { turnPage(1); });
  window.addEventListener('popstate', function () { readLocation(); render(); });

  document.getElementById('topic-heading').tabIndex = -1;
  readLocation();
  render();
  form.hidden = false;
})();
