import { estimatePair, historicalRecord, recentRecord, verifiedMatches } from './matchup-model.mjs?v=4';

let language = 'zh', player = 'all', era = 'all', pairingId = '';
let research = null, corpus = null, analysis = null, curriculum = null, motionLab = null, frameStudy = null, otherPlayers = null, matchups = null, simulation = null;
const $ = id => document.getElementById(id), original = new Map();
document.querySelectorAll('[data-en]').forEach(node => original.set(node, node.innerHTML));
const t = (zh, en) => language === 'zh' ? zh : en;
const localized = value => typeof value === 'string' ? value : value?.[language] || value?.zh || value?.en || '';
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const e = value => escape(localized(value));
const bodyPartNames = { hand: ['手', 'Hands'], feet: ['腳步', 'Feet'], hips: ['髖與重心', 'Hips and balance'], shoulders: ['肩與軀幹', 'Shoulders and trunk'] };
const bodyPart = value => bodyPartNames[value]?.[language === 'zh' ? 0 : 1] || localized(value);
function link(url, label) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' ? `<a href="${escape(parsed.href)}" target="_blank" rel="noopener">${e(label)} ↗</a>` : ''; } catch { return ''; }
}
function renderResearch() {
  if (!research) return;
  $('researchMethod').textContent = localized(research.method);
  $('research').innerHTML = research.sources.filter(source => player === 'all' || source.player === player).map(source => `<article class="card ${escape(source.player)}"><div class="meta">${escape(source.era)} · ${escape(source.date || t('日期未標示', 'Undated'))}</div><h3>${e(source.title)}</h3><p>${e(source.finding)}</p><p class="application">${t('遊戲含義：', 'Game implication: ')}${e(source.implication)}</p>${link(source.url, t('閱讀原始來源', 'Read the original source'))}</article>`).join('');
}
function list(items, ordered = false) { const tag = ordered ? 'ol' : 'ul'; return `<${tag}>${items.map(item => `<li>${e(item)}</li>`).join('')}</${tag}>`; }
function renderSlowMotion(sequence, source) {
  if (!sequence) return '';
  return `<div class="slow-motion-study"><h4>${t('慢動作拆解：', 'Slow-motion breakdown: ')}${e(sequence.title)}</h4><div class="slow-motion-phases">${sequence.frames.map(frame => `<figure><img src="${escape(frame.src)}" width="1280" height="720" alt="${e(frame.phaseLabel)} · ${e(frame.caption)}" loading="lazy"><figcaption><b>${e(frame.phaseLabel)}</b> · ${link(`${source.url}&t=${frame.time}s`, frame.timestampLabel)}<p>${e(frame.caption)}</p></figcaption></figure>`).join('')}</div><p class="caption">${sequence.limitations.map(localized).map(escape).join(' · ')}</p></div>`;
}
function renderSegmentDetails(segment, video) {
  const items = segment.observations?.map(item => ({ time: item.start, text: item.visible })) || segment.visibleObservations?.map(text => ({ text })) || [];
  if (!items.length) return '';
  return `<details class="segment-observations"><summary>${t('展開逐格觀察', 'Show frame observations')}</summary><ol>${items.map(item => `<li>${item.time === undefined ? '' : `${link(`${video.url}&t=${item.time}s`, `${Math.floor(item.time / 60)}:${(item.time % 60).toFixed(1).padStart(4, '0')}`)} · `}${e(item.text)}</li>`).join('')}</ol></details>`;
}
function renderLessons() {
  if (!curriculum) return;
  $('lessonPolicy').textContent = localized(curriculum.authoringPolicy);
  const opened = new Set([...document.querySelectorAll('.lesson[open]')].map(node => node.id));
  $('lessonList').innerHTML = curriculum.units.map((unit, index) => `<details class="lesson" id="lesson-${escape(unit.id)}" ${opened.has(`lesson-${unit.id}`) ? 'open' : ''}><summary><span>${String(index + 1).padStart(2, '0')} / ${e(unit.title)}</span><small>${t('動作 · 練習 · 戰術', 'Motion · practice · tactics')}</small></summary><div class="lesson-content"><p>${e(unit.intro)}</p><h3>${t('先讀來球', 'Read the incoming ball')}</h3>${list(unit.suitable)}<h3>${t('五個動作階段', 'Five stroke stages')}</h3><div class="phases">${unit.phases.map(phase => `<h4>${e(phase.title)}</h4><p>${e(phase.text)}</p>`).join('')}</div><h3>${t('身體各部位怎樣配合', 'Coordinate the body')}</h3>${unit.bodyKeys.map(key => `<p><b>${escape(bodyPart(key.part))}</b> · ${e(key.text)}</p>`).join('')}<h3>${t('常見錯誤與修正', 'Common errors and corrections')}</h3>${unit.mistakes.map(mistake => `<div class="mistake"><h4>${e(mistake.symptom)}</h4><p><b>${t('原因：', 'Cause: ')}</b>${e(mistake.cause)}<br><b>${t('修正：', 'Correction: ')}</b>${e(mistake.fix)}</p></div>`).join('')}<h3>${t('練習方法與成功標準', 'Drills and success criteria')}</h3>${unit.drills.map(drill => `<h4>${e(drill.title)}</h4>${list(drill.steps, true)}<p class="application">${t('成功標準：', 'Success criteria: ')}${e(drill.success)}</p>`).join('')}<h3>${t('戰術應用', 'Tactical use')}</h3>${list(unit.tactics.use)}<h4>${t('代價與風險', 'Trade-offs and risks')}</h4>${list(unit.tactics.risk)}<h3>${t('職業選手例子', 'Professional examples')}</h3>${unit.proExamples.map(example => `<p><b>${escape(example.name)}</b> · ${e(example.notes)}</p>`).join('')}<h3>${t('參考資料', 'References')}</h3>${unit.sources.map(source => `<div class="lesson-source">${link(source.url, source.title)}<span class="caption"> · ${e(source.scope)}</span></div>`).join('')}<p><a href="#motion-lab">${t('用 3D 示範觀察引拍、擊球與還原', 'Inspect preparation, contact and recovery in the 3D lab')} ↗</a></p></div></details>`).join('');
}
function renderFrames() {
  if (!frameStudy) return;
  $('frameList').innerHTML = frameStudy.frames.map(frame => {
    const source = frame.source || frameStudy.source, width = Number(frame.width) || (frame.nativeVideo ? 1280 : 966), height = Number(frame.height) || (frame.nativeVideo ? 720 : 881);
    let timedUrl = source.url;
    try { const url = new URL(source.url); url.searchParams.set('t', `${frame.time}s`); timedUrl = url.href; } catch {}
    return `<article class="frame-study"><figure><div class="reference-frame${frame.nativeVideo ? ' native-video' : ''}"><img src="${escape(frame.src)}" width="${width}" height="${height}" alt="${e(frame.title)}" loading="lazy"></div><figcaption>${escape(source.publisher)} · ${escape(frame.timestampLabel)} · ${frame.nativeVideo ? t('原始影片影格', 'Original video frame') : t('早期重播截圖', 'Earlier replay screenshot')}</figcaption></figure><div class="frame-notes"><h3>${e(frame.title)}</h3>${frame.notes.map((note, i) => `<p><b>${i + 1}</b>${e(note)}</p>`).join('')}${link(timedUrl, t('在原片看前後動作', 'Watch the surrounding movement'))}</div>${renderSlowMotion(frame.slowMotion, source)}</article>`;
  }).join('');
}
function render() { renderLessons(); renderResearch(); renderFrames(); renderEvidence(); renderOtherPlayers(); renderMatchups(); renderSimulation(); motionLab?.setLanguage(); }
const techniqueNames = { serve: ['發球', 'Service'], receive: ['接發球', 'Receive'], thirdBall: ['前三板', 'First three strokes'], forehand: ['正手', 'Forehand'], backhand: ['反手', 'Backhand'], transition: ['正反手銜接', 'Stroke transitions'], footwork: ['步法', 'Footwork'], distance: ['離台距離', 'Table distance'], placement: ['落點', 'Placement'], offenseDefense: ['攻防轉換', 'Attack and defense'] };
function eraName(id) { return localized(corpus.eras.find(item => item.id === id)?.label) || id; }
function videoFor(id) { return corpus.videos.find(video => video.id === id || video.videoId === id); }
function evidenceLinks(evidence = []) {
  return evidence.map(item => { const video = videoFor(item.videoId); return video ? link(`${video.url}&t=${Math.floor(item.start || 0)}s`, `${video.event || localized(video.title)} · ${Math.floor((item.start || 0) / 60)}:${String(Math.floor((item.start || 0) % 60)).padStart(2, '0')}`) : ''; }).join(' · ');
}
function sourceLinks(sources = []) { return sources.map(source => link(source.url, source.title)).join(' · '); }
function renderOtherPlayers() {
  if (!otherPlayers) return;
  $('otherPlayersMethod').textContent = localized(otherPlayers.method);
  const opened = new Set([...document.querySelectorAll('.other-player[open]')].map(node => node.id));
  $('otherPlayerList').innerHTML = otherPlayers.players.map(profile => `<details class="lesson other-player" id="profile-${escape(profile.id)}" ${opened.has(`profile-${profile.id}`) ? 'open' : ''}><summary><span>${e(profile.name)}</span><small>${profile.hand === 'left' ? t('左手', 'Left-handed') : t('右手', 'Right-handed')} · ${e(profile.grip)}</small></summary><div class="lesson-content"><p>${e(profile.intro)}</p><h3>${t('如何建立優勢', 'How the advantage is built')}</h3>${list(profile.strengths)}<h3>${t('對手可測試的方向', 'Options an opponent can test')}</h3>${list(profile.vulnerabilities)}<h3>${t('具體比賽與打法證據', 'Specific matches and tactical evidence')}</h3>${profile.matches.map(match => `<article class="match-evidence"><div class="meta">${escape(match.date)} · ${escape(match.event)} · ${escape(match.opponent)}</div><h4>${e(match.result)}</h4><p>${e(match.finding)}</p>${link(match.url, match.title)}</article>`).join('')}<h3>${t('時期變化', 'Changes across eras')}</h3>${profile.changes.map(change => `<h4>${e(change.title)}</h4><p>${e(change.finding)}</p><p class="caption">${e(change.limits)}</p><div class="lesson-source">${change.sourceUrls.map((url, index) => link(url, t(`比賽來源 ${index + 1}`, `Match source ${index + 1}`))).join(' · ')}</div>`).join('')}<h3>${t('對戰時值得觀察的細節', 'What to inspect in a matchup')}</h3>${list(profile.matchupKeys)}<p class="caption">${e(profile.limits)}</p></div></details>`).join('');
}
function matchupName(id) { return localized(matchups.players.find(profile => profile.id === id)?.name) || id; }
const percent = value => `${Math.round(value * 100)}%`;
function renderMatchups() {
  if (!matchups) return;
  $('matchupMethod').textContent = localized(matchups.method);
  if (!pairingId) { const first = matchups.pairings.find(pair => pair.a === 'lin' && pair.b === 'harimoto') || matchups.pairings[0]; pairingId = `${first.a}-${first.b}`; }
  $('matchupPair').innerHTML = matchups.pairings.map(pair => `<option value="${escape(`${pair.a}-${pair.b}`)}">${escape(matchupName(pair.a))} × ${escape(matchupName(pair.b))}</option>`).join(''); $('matchupPair').value = pairingId;
  const pair = matchups.pairings.find(pair => `${pair.a}-${pair.b}` === pairingId), record = historicalRecord(pair), recent = recentRecord(pair, matchups.updatedAt);
  const estimate = estimatePair(pair, matchups.updatedAt, Number($('matchupHalfLife').value)), nameA = matchupName(pair.a), nameB = matchupName(pair.b);
  $('matchupRates').innerHTML = `<div class="rate-grid"><article class="card"><div class="meta">${record.complete ? t('官方完整交手紀錄', 'Official complete record') : t('已核對樣本，並非完整交手', 'Verified sample, not a complete record')}</div><h3>${t('歷史樣本勝率', 'Historical sample rate')}</h3><strong class="rate">${record.n ? percent(record.winsA / record.n) : '—'}</strong><p>${escape(nameA)} ${record.winsA} : ${record.winsB} ${escape(nameB)}<br>${t(`共 ${record.n} 場`, `${record.n} matches`)}</p></article><article class="card"><div class="meta">${t('同一樣本的最近兩年', 'Last two years within the same sample')}</div><h3>${t('近期樣本勝率', 'Recent sample rate')}</h3><strong class="rate">${recent.n ? percent(recent.winsA / recent.n) : '—'}</strong><p>${escape(nameA)} ${recent.winsA} : ${recent.winsB} ${escape(nameB)}<br>${t(`共 ${recent.n} 場`, `${recent.n} matches`)}</p></article><article class="card forecast"><div class="meta">${t('探索性模型 · 尚未驗證', 'Exploratory model · unvalidated')}</div><h3>${t('未來對戰估計', 'Future matchup estimate')}</h3><strong class="rate">${estimate ? percent(estimate.probability) : '—'}</strong><p>${escape(nameA)}<br>${estimate ? t(`90% 可信區間 ${percent(estimate.low)}–${percent(estimate.high)}`, `90% credible interval ${percent(estimate.low)}–${percent(estimate.high)}`) : t('資料不足', 'Insufficient data')}</p><p class="caption">${estimate ? t(`${estimate.n} 場；權重合計 ${estimate.effectiveN.toFixed(1)}。${estimate.n < 5 ? '少量樣本，不適合下強結論。' : '樣本選取仍可能造成偏差。'}`, `${estimate.n} results; total weight ${estimate.effectiveN.toFixed(1)}. ${estimate.n < 5 ? 'Small sample: avoid strong conclusions.' : 'Selection bias remains possible.'}`) : ''}</p></article></div>`;
  $('matchupStyle').innerHTML = `<article class="card"><h3>${t('球風怎樣互相影響', 'How the styles interact')}</h3><p>${e(pair.styleInteraction)}</p><div class="lesson-source">${sourceLinks(pair.sources)}</div></article>`;
  const matches = verifiedMatches(pair);
  $('matchupHistory').innerHTML = `<table class="matchup-table"><thead><tr><th>${t('日期', 'Date')}</th><th>${t('比賽', 'Event')}</th><th>${t('勝方', 'Winner')}</th><th>${t('局數（勝方在前）', 'Score (winner first)')}</th><th>${t('來源', 'Source')}</th></tr></thead><tbody>${matches.map(match => `<tr><td>${escape(match.date)}</td><td>${escape(match.event)}</td><td>${escape(matchupName(match.winner))}</td><td>${escape(match.score)}</td><td>${link(match.url, t('賽果來源', 'Result source'))}</td></tr>`).join('')}</tbody></table>`;
  $('matchupLimits').textContent = `${t('資料截至：', 'Data as of: ')}${matchups.updatedAt} · ${(pair.evidenceLimits || []).map(localized).join(' · ')}`;
}
function renderSimulation() {
  if (!simulation) return;
  const levels = simulation.pairings.find(pair => pair.a === 'lin' && pair.b === 'harimoto')?.levels || [], labels = { easy: ['球館新手', 'Beginner'], normal: ['熟練球友', 'Regular'], hard: ['球館高手', 'Champion'] };
  $('gameSimulation').innerHTML = `<p>${e(simulation.method)}</p><p>${e(simulation.format)}</p><div class="table-scroll"><table><thead><tr><th>${t('對手設定', 'Opponent setting')}</th><th>${t('完成單局', 'Completed games')}</th><th>${t('林勝 : 張本勝', 'Lin wins : Harimoto wins')}</th><th>${t('林的遊戲勝率', 'Lin’s game win rate')}</th></tr></thead><tbody>${levels.map(level => { const complete = level.winsA + level.winsB; return `<tr><td>${escape(labels[level.level]?.[language === 'zh' ? 0 : 1] || level.level)}</td><td>${complete}</td><td>${level.winsA} : ${level.winsB}</td><td>${complete ? percent(level.winsA / complete) : '—'}</td></tr>`; }).join('')}</tbody></table></div><h4>${t('交換兩端後的分開結果', 'Results by near-side player')}</h4>${levels.map(level => `<p>${escape(labels[level.level]?.[language === 'zh' ? 0 : 1] || level.level)} · ${level.bySide.map(side => `${side.near === 'lin' ? t('林在近端', 'Lin near') : t('張本在近端', 'Harimoto near')} ${side.winsA}:${side.winsB}${side.truncated ? t(`，${side.truncated} 局逾時`, `, ${side.truncated} timed out`) : ''}`).map(escape).join(' ／ ')}</p>`).join('')}${list(simulation.limits)}<p class="caption">${t('另外五人的遊戲角色尚未實作，因此不附上虛構的遊戲勝率；上方各組使用實際比賽結果推算。', 'The other five game profiles are not implemented, so no game win rates are fabricated for them. The pairings above use actual match results.')}</p>`;
}
function renderEvidence() {
  if (!corpus || !analysis) return;
  const counts = player === 'all' ? corpus.counts : corpus.counts.perPlayer[player];
  $('countsNote').textContent = t(`已下載 ${Number(corpus.counts.downloadedVideos || 0)} 支官方影片；下載不等於觀看。${corpus.counts.observedSegments} 筆選手觀察來自 ${corpus.counts.uniqueObservedIntervals} 段抽樣序列，同一序列可能分別記錄兩名選手。各影片尚未整場閱完。`, `${Number(corpus.counts.downloadedVideos || 0)} official videos downloaded; downloading is separate from viewing. ${corpus.counts.observedSegments} player observation records come from ${corpus.counts.uniqueObservedIntervals} sampled sequences; one sequence may include both players. None of the videos has been watched in full.`);
  $('counts').innerHTML = [[curriculum?.units.length || 0, t('詳細技術單元', 'Detailed lessons')], [counts.metadataVideos, t('已整理官方片源', 'Official sources listed')], [counts.observedVideos, t('實際觀看片源', 'Videos observed')], [counts.observedSegments, t('選手觀察紀錄', 'Player observations')]].map(([value, label]) => `<div><strong>${Number(value || 0)}</strong><span>${label}</span></div>`).join('');
  const selectedEra = era; $('era').innerHTML = `<option value="all">${t('所有時期', 'All eras')}</option>${corpus.eras.map(item => `<option value="${escape(item.id)}">${e(item.label)}</option>`).join('')}`; $('era').value = selectedEra;
  const profiles = analysis.profiles.filter(profile => player === 'all' || profile.player === player);
  $('eras').innerHTML = `<div class="era-grid">${profiles.flatMap(profile => profile.periods.map(period => {
    const articles = research?.sources.filter(source => source.player === profile.player && source.era.replace(/–/g, '-') === period.era) || [];
    return `<article class="card ${escape(profile.player)}"><div class="meta">${e(profile.name)} · ${escape(eraName(period.era))}</div><h3>${period.confidence === 'notObserved' ? t('影片比較待核', 'Video comparison pending') : t('這一時期的重點', 'This era’s features')}</h3><p>${e(period.summary)}</p>${articles.map(article => `<p>${link(article.url, localized(article.title))}</p>`).join('')}</article>`;
  })).join('')}</div>`;
  $('technical').innerHTML = profiles.map(profile => {
    const periods = profile.periods.filter(period => era === 'all' || period.era === era);
    const details = periods.flatMap(period => Object.entries(period.techniques).filter(([, value]) => value.status !== 'notObserved').map(([key, value]) => `<article class="card ${escape(profile.player)}"><div class="meta">${e(profile.name)} · ${escape(eraName(period.era))} · ${value.status === 'sourceBased' ? t('本人說法／原始報導', 'Testimony / original report') : t('影片觀察', 'Video observation')}</div><h3>${escape(techniqueNames[key]?.[language === 'zh' ? 0 : 1] || key)}</h3><p>${e(value.observation)}</p>${value.inference ? `<p class="application">${t('解讀：', 'Interpretation: ')}${e(value.inference)}</p>` : ''}${value.limits?.length ? `<p class="caption">${value.limits.map(localized).map(escape).join(' · ')}</p>` : ''}<div class="lesson-source">${sourceLinks(value.sources)}${value.sources?.length && value.evidence?.length ? ' · ' : ''}${evidenceLinks(value.evidence)}</div></article>`));
    return `<h3>${e(profile.name)}</h3>${details.length ? `<div class="technical-grid">${details.join('')}</div>` : `<p class="caption">${t('更多影片觀察待核；已確認的本人說法與原始技術報導見下方。', 'Further video observations are pending; verified testimony and original technical reports appear below.')}</p>`}${(profile.changes || []).map(change => `<article class="card"><h3>${e(change.title || change.topic)}</h3><p>${e(change.observation || change.summary)}</p>${change.inference ? `<p class="application">${e(change.inference)}</p>` : ''}<div class="lesson-source">${sourceLinks(change.sources)}${change.sources?.length && change.evidence?.length ? ' · ' : ''}${evidenceLinks(change.evidence)}</div></article>`).join('')}`;
  }).join('');
  const matching = corpus.videos.filter(video => (player === 'all' || video.players.includes(player)) && (era === 'all' || video.era === era));
  const opened = new Set([...document.querySelectorAll('.video[open]')].map(node => node.id));
  $('videos').innerHTML = matching.length ? matching.map(video => {
    const segments = corpus.segments.filter(segment => (segment.videoId === video.id || segment.videoId === video.videoId) && (player === 'all' || segment.player === player));
    return `<details class="video" id="video-${escape(video.id)}" ${opened.has(`video-${video.id}`) ? 'open' : ''}><summary><span>${e(video.title)}<br><small class="meta">${escape(eraName(video.era))} · ${video.status === 'observed' ? t('已看片段', 'Segments observed') : t('片源已整理，尚未觀看', 'Listed, not yet observed')} · ${escape(video.channel)}</small></span>${link(video.url, t('原片', 'Source'))}</summary><div class="segments">${segments.length ? segments.map(segment => `<div class="segment">${link(`${video.url}&t=${Math.floor(segment.start)}s`, segment.timestampLabel)}<div><p>${e(corpus.players.find(item => item.id === segment.player)?.name)} · ${e(segment.observation)}</p>${renderSegmentDetails(segment, video)}${segment.inference ? `<p class="application">${t('解讀：', 'Interpretation: ')}${e(segment.inference)}</p>` : ''}<small>${(segment.evidenceLimits || []).map(localized).map(escape).join(' · ')}</small></div></div>`).join('') : `<p class="caption">${t('目前僅確認片源，未加入觀察結論。', 'Only the source has been identified; no observation claims are attached.')}</p>`}</div></details>`;
  }).join('') : `<p class="caption">${t('這一時期的片源尚待整理。', 'Sources for this era are pending.')}</p>`;
}
$('language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh'; document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-en]').forEach(node => { if (language === 'en') node.textContent = node.dataset.en; else node.innerHTML = original.get(node); });
  $('language').textContent = language === 'zh' ? 'EN' : '中文'; render();
});
document.querySelectorAll('[data-player]').forEach(button => button.addEventListener('click', () => {
  player = button.dataset.player; document.querySelectorAll('[data-player]').forEach(node => { const selected = node === button; node.classList.toggle('selected', selected); node.setAttribute('aria-pressed', String(selected)); }); render();
}));
$('era').addEventListener('change', () => { era = $('era').value; renderEvidence(); });
$('matchupPair').addEventListener('change', () => { pairingId = $('matchupPair').value; renderMatchups(); });
$('matchupHalfLife').addEventListener('change', renderMatchups);
$('openLab').addEventListener('click', async () => {
  $('lab').hidden = false; $('openLab').hidden = true;
  try { const { createMotionLab } = await import('./motion-lab.js?v=4'); motionLab = createMotionLab(() => language); } catch (error) {
    console.error(error); $('lab').hidden = true; $('openLab').hidden = false; $('error').hidden = false; $('error').textContent = t('3D 示範無法開啟，請開啟硬體加速或重新整理。', 'The 3D lab could not open. Enable hardware acceleration or reload.');
  }
});
const results = await Promise.allSettled(['../supporting-research.json', '../reference-corpus.json', '../style-analysis.json', './techniques.json', './reference-frames.json', './other-players.json', './matchups.json', './game-simulation.json'].map(async path => {
  const response = await fetch(`${path}?v=5`); if (!response.ok) throw new Error(path); return response.json();
}));
research = results[0].status === 'fulfilled' ? results[0].value : null;
corpus = results[1].status === 'fulfilled' ? results[1].value : null;
analysis = results[2].status === 'fulfilled' ? results[2].value : null;
curriculum = results[3].status === 'fulfilled' ? results[3].value : null;
frameStudy = results[4].status === 'fulfilled' ? results[4].value : null;
otherPlayers = results[5].status === 'fulfilled' ? results[5].value : null;
matchups = results[6].status === 'fulfilled' ? results[6].value : null;
simulation = results[7].status === 'fulfilled' ? results[7].value : null;
if (results.some(result => result.status === 'rejected')) { $('error').hidden = false; $('error').textContent = t('部分分析資料無法載入，請重新整理。', 'Some analysis data could not load. Please reload.'); }
render();
