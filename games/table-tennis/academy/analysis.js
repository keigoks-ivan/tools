import { estimatePair, historicalRecord, recentRecord, verifiedMatches } from './matchup-model.mjs?v=4';

let language = 'zh', player = 'all', era = 'all', pairingId = '', playerTopic = 'all', lessonGroup = 'all';
let framePlayer = 'all', frameEra = 'all', frameTopic = 'all', videoPlayer = 'all', videoEra = 'all', videoStatus = 'observed', activeChapter = 'overview';
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
const lessonGroups = [
  { id: 'basics', title: ['基本動作', 'Foundations'], units: ['footwork', 'forehand', 'backhand'] },
  { id: 'table', title: ['發接發與台內球', 'Serve, receive and table play'], units: ['serve', 'receive', 'push', 'flick'] },
  { id: 'tactics', title: ['回合戰術', 'Rally tactics'], units: ['tactics'] },
];
const lessonStroke = { forehand: 'forehand', backhand: 'backhand', flick: 'flick', push: 'push', serve: 'serve' };
const proIds = { '林昀儒': 'lin', '张本智和': 'harimoto', '張本智和': 'harimoto', '樊振東': 'fan', '馬龍': 'ma', '王楚欽': 'wang', '雨果・卡爾德拉諾': 'hugo', '費利克斯・勒布倫': 'felix' };
const proId = name => proIds[name.split(' / ')[0]];
const empty = text => `<p class="empty-state">${escape(text)}</p>`;
function selectOptions(id, entries, value) {
  $(id).innerHTML = entries.map(([key, label]) => `<option value="${escape(key)}">${escape(label)}</option>`).join('');
  $(id).value = entries.some(([key]) => key === value) ? value : entries[0]?.[0] || '';
}
function eraOptions() { return [['all', t('所有時期', 'All eras')], ...(corpus?.eras || []).map(item => [item.id, localized(item.label)])]; }
function primaryPlayers() { return (analysis?.profiles || []).filter(profile => player === 'all' || profile.player === player); }
function evidenceLabel(status) { return status === 'sourceBased' ? t('本人說法／原始報導', 'Testimony / original report') : status === 'notObserved' ? t('本期證據待補', 'Evidence pending for this era') : t('抽樣影片觀察', 'Sampled video observation'); }
function profileName(id) { return localized(matchups?.players.find(item => item.id === id)?.name || corpus?.players.find(item => item.id === id)?.name) || id; }
function pairLink(id) {
  const pair = matchups?.pairings.find(pair => pair.a === id || pair.b === id);
  return pair ? `<a href="#matchups" data-pair="${escape(`${pair.a}-${pair.b}`)}">${t('查看相關對戰', 'Inspect a related matchup')} →</a>` : '';
}
function renderOverview() {
  const counts = corpus?.counts || {};
  $('counts').innerHTML = [[curriculum?.units.length || 0, t('技巧課程', 'Technique lessons')], [matchups?.players.length || 0, t('選手研究', 'Player profiles')], [corpus?.eras.length || 0, t('比較時期', 'Eras compared')], [matchups?.pairings.length || 0, t('對戰組合', 'Pairings')]].map(([value, label]) => `<div><strong>${Number(value)}</strong><span>${label}</span></div>`).join('');
  $('countsNote').textContent = t(`全站研究：整理 ${counts.metadataVideos || 0} 支官方片源，抽看 ${counts.observedVideos || 0} 支；${counts.observedSegments || 0} 筆選手觀察來自 ${counts.uniqueObservedIntervals || 0} 段抽樣序列。已下載 ${counts.downloadedVideos || 0} 支，下載與整理不等於觀看；目前均未整場閱完。`, `Research across the site: ${counts.metadataVideos || 0} official sources listed, ${counts.observedVideos || 0} sampled; ${counts.observedSegments || 0} player observations from ${counts.uniqueObservedIntervals || 0} sampled sequences. ${counts.downloadedVideos || 0} downloaded; downloading and listing are separate from viewing. None has been watched in full.`);
}
function renderDirectory() {
  if (!matchups) return;
  selectOptions('playerSelect', [['all', t('瀏覽全部七人', 'Browse all seven')], ...matchups.players.map(profile => [profile.id, localized(profile.name)])], player);
  $('playerDirectory').innerHTML = matchups.players.map(profile => {
    const observed = corpus?.counts.perPlayer[profile.id], other = otherPlayers?.players.find(item => item.id === profile.id), hand = corpus?.players.find(item => item.id === profile.id)?.hand || other?.hand;
    const scope = observed ? t(`${observed.observedVideos} 支抽看片源 · ${observed.observedSegments} 筆觀察`, `${observed.observedVideos} sampled videos · ${observed.observedSegments} observations`) : t(`${other?.matches.length || 0} 場賽事引用 · 官方賽報`, `${other?.matches.length || 0} match references · official reports`);
    return `<button class="player-card" data-select-player="${escape(profile.id)}" aria-pressed="${player === profile.id}"><span class="player-name">${e(profile.name)}</span><span class="player-meta">${hand === 'left' ? t('左手', 'Left-handed') : t('右手', 'Right-handed')}</span><span class="player-scope">${escape(scope)}</span></button>`;
  }).join('');
  const core = player === 'all' || ['lin', 'harimoto'].includes(player);
  $('corePlayers').hidden = !core; $('playerEraControl').hidden = !core;
  selectOptions('playerEra', eraOptions(), era);
  $('playerScope').textContent = core ? t('年代篩選只套用林昀儒與張本智和的研究；技術主題只作用於細節區。其他選手、影格、影片、對戰與 3D 示範各自選擇。', 'Era filters apply only to the Lin and Harimoto studies. The technical topic filters stroke detail only. Other profiles, frames, videos, matchups and the 3D demonstration have separate controls.') : t('此選手目前以官方賽報與已核對賽果整理，尚無本頁的逐格影片或四期動作比較。', 'This profile currently uses official reports and verified results, without the frame-by-frame or four-era motion study available for Lin and Harimoto.');
  $('playerFocus').innerHTML = player === 'all' ? '' : `<div class="profile-header"><h2>${escape(profileName(player))}</h2>${pairLink(player)}</div>`;
}
function renderResearch() {
  if (!research) return;
  $('researchMethod').textContent = localized(research.method);
  const sources = research.sources.filter(source => (player === 'all' || source.player === player) && (era === 'all' || source.era.replace(/–/g, '-') === era));
  $('research').innerHTML = sources.length ? sources.map(source => `<article class="card ${escape(source.player)}"><div class="meta">${escape(profileName(source.player))} · ${escape(source.era)} · ${escape(source.date || t('日期未標示', 'Undated'))}</div><h3>${e(source.title)}</h3><p>${e(source.finding)}</p><p class="application">${t('遊戲含義：', 'Game implication: ')}${e(source.implication)}</p>${link(source.url, t('閱讀原始來源', 'Read the original source'))}</article>`).join('') : empty(t('所選時期尚無可列的原始訪談；不代表當時沒有這項技術。', 'No original testimony is listed for this era; this does not mean the technique was absent.'));
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
function lessonContext(unit) {
  const frames = frameStudy?.frames.filter(frame => frame.topics.includes(unit.id)) || [];
  return `<div class="related-links">${lessonStroke[unit.id] ? `<a href="#motion-lab" data-lab-stroke="${lessonStroke[unit.id]}">${t('慢放此項遊戲動作', 'Slow down this game stroke')} →</a>` : ''}${frames.length ? `<a href="#frame-study" data-frame-topic="${escape(unit.id)}">${t(`對照 ${frames.length} 組真人影格`, `Inspect ${frames.length} athlete frame studies`)} →</a>` : `<a href="#video-evidence">${t('查閱現有影片觀察', 'Browse the existing video observations')} →</a>`}</div>`;
}
function renderLessons() {
  if (!curriculum) return;
  $('lessonPolicy').textContent = localized(curriculum.authoringPolicy);
  const opened = new Set([...document.querySelectorAll('#lessonList .lesson[open]')].map(node => node.id));
  $('lessonGroups').innerHTML = [['all', t('所有課程', 'All lessons')], ...lessonGroups.map(group => [group.id, group.title[language === 'zh' ? 0 : 1]])].map(([id, label]) => `<button data-lesson-group="${id}" aria-pressed="${lessonGroup === id}">${escape(label)}</button>`).join('');
  const groups = lessonGroups.filter(group => lessonGroup === 'all' || group.id === lessonGroup);
  $('lessonIndex').innerHTML = groups.flatMap(group => group.units.map(id => curriculum.units.find(unit => unit.id === id))).filter(Boolean).map(unit => `<a href="#lesson-${escape(unit.id)}">${e(unit.title)}</a>`).join('');
  $('lessonList').innerHTML = groups.map(group => `<section class="lesson-group" id="lesson-group-${group.id}"><h3>${escape(group.title[language === 'zh' ? 0 : 1])}</h3>${group.units.map(id => curriculum.units.find(unit => unit.id === id)).filter(Boolean).map(unit => `<details class="lesson" id="lesson-${escape(unit.id)}" ${opened.has(`lesson-${unit.id}`) ? 'open' : ''}><summary><span>${String(lessonGroups.flatMap(group => group.units).indexOf(unit.id) + 1).padStart(2, '0')} / ${e(unit.title)}</span><small>${t('動作 · 練習 · 戰術', 'Motion · practice · tactics')}</small></summary><div class="lesson-content"><p>${e(unit.intro)}</p><nav class="local-nav lesson-nav" aria-label="${t('課程內導覽', 'Within this lesson')}">${[['incoming', t('來球', 'Incoming ball')], ['motion', t('動作', 'Motion')], ['errors', t('修正', 'Corrections')], ['drills', t('練習', 'Drills')], ['tactics', t('戰術', 'Tactics')], ['sources', t('來源', 'Sources')]].map(([id, label]) => `<a href="#lesson-${escape(unit.id)}-${id}">${escape(label)}</a>`).join('')}</nav><h3 id="lesson-${escape(unit.id)}-incoming">${t('先讀來球', 'Read the incoming ball')}</h3>${list(unit.suitable)}<h3 id="lesson-${escape(unit.id)}-motion">${t('五個動作階段', 'Five stroke stages')}</h3><div class="phases">${unit.phases.map(phase => `<h4>${e(phase.title)}</h4><p>${e(phase.text)}</p>`).join('')}</div><h3>${t('身體各部位怎樣配合', 'Coordinate the body')}</h3>${unit.bodyKeys.map(key => `<p><b>${escape(bodyPart(key.part))}</b> · ${e(key.text)}</p>`).join('')}<h3 id="lesson-${escape(unit.id)}-errors">${t('常見錯誤與修正', 'Common errors and corrections')}</h3>${unit.mistakes.map(mistake => `<div class="mistake"><h4>${e(mistake.symptom)}</h4><p><b>${t('原因：', 'Cause: ')}</b>${e(mistake.cause)}<br><b>${t('修正：', 'Correction: ')}</b>${e(mistake.fix)}</p></div>`).join('')}<h3 id="lesson-${escape(unit.id)}-drills">${t('練習方法與成功標準', 'Drills and success criteria')}</h3>${unit.drills.map(drill => `<h4>${e(drill.title)}</h4>${list(drill.steps, true)}<p class="application">${t('成功標準：', 'Success criteria: ')}${e(drill.success)}</p>`).join('')}<h3 id="lesson-${escape(unit.id)}-tactics">${t('戰術應用', 'Tactical use')}</h3>${list(unit.tactics.use)}<h4>${t('代價與風險', 'Trade-offs and risks')}</h4>${list(unit.tactics.risk)}<h3>${t('職業選手例子', 'Professional examples')}</h3>${unit.proExamples.map(example => `<p><b>${escape(example.name)}</b> · ${e(example.notes)}${proId(example.name) ? ` <a href="#players" data-select-player="${proId(example.name)}">${t('選手研究', 'Player study')} →</a>` : ''}</p>`).join('')}<h3 id="lesson-${escape(unit.id)}-sources">${t('參考資料', 'References')}</h3>${unit.sources.map(source => `<div class="lesson-source">${link(source.url, source.title)}<span class="caption"> · ${e(source.scope)}</span></div>`).join('')}${lessonContext(unit)}</div></details>`).join('')}</section>`).join('');
}
function frameRecords(frame, source) {
  const id = new URL(source.url).searchParams.get('v');
  const segments = corpus?.segments.filter(segment => segment.videoId === id && segment.start <= frame.time && segment.end >= frame.time && frame.players.includes(segment.player)) || [];
  return segments.map(segment => `<a href="#segment-${escape(segment.id)}">${t('查看觀察紀錄', 'Read the observation')} · ${escape(profileName(segment.player))} →</a>`).join('');
}
function renderFrames() {
  if (!frameStudy) return;
  const players = [['all', t('兩人全部', 'Both players')], ...(corpus?.players || []).map(item => [item.id, localized(item.name)])];
  selectOptions('framePlayer', players, framePlayer); selectOptions('frameEra', eraOptions(), frameEra);
  const topics = (curriculum?.units || []).filter(unit => frameStudy.frames.some(frame => frame.topics.includes(unit.id)));
  selectOptions('frameTopic', [['all', t('全部可見動作', 'All visible movements')], ...topics.map(unit => [unit.id, localized(unit.title)])], frameTopic);
  const filtered = frameStudy.frames.filter(frame => (framePlayer === 'all' || frame.players.includes(framePlayer)) && (frameEra === 'all' || frame.era === frameEra) && (frameTopic === 'all' || frame.topics.includes(frameTopic)) && (!$('frameReplay').checked || frame.slowMotion));
  $('frameResults').textContent = t(`顯示 ${filtered.length} / ${frameStudy.frames.length} 組影格研究。主題只按可見動作整理，不推定未確認的球種或旋轉。`, `Showing ${filtered.length} / ${frameStudy.frames.length} frame studies. Topics describe visible motion without assigning unconfirmed strokes or spin.`);
  $('frameList').innerHTML = filtered.length ? filtered.map(frame => {
    const source = frame.source || frameStudy.source, width = Number(frame.width) || (frame.nativeVideo ? 1280 : 966), height = Number(frame.height) || (frame.nativeVideo ? 720 : 881);
    let timedUrl = source.url;
    try { const url = new URL(source.url); url.searchParams.set('t', `${frame.time}s`); timedUrl = url.href; } catch {}
    return `<article class="frame-study" id="frame-${escape(frame.id)}"><figure><div class="reference-frame${frame.nativeVideo ? ' native-video' : ''}"><img src="${escape(frame.src)}" width="${width}" height="${height}" alt="${e(frame.title)}" loading="lazy"></div><figcaption>${escape(source.publisher)} · ${escape(frame.timestampLabel)} · ${frame.nativeVideo ? t('原始影片影格', 'Original video frame') : t('早期重播截圖', 'Earlier replay screenshot')}</figcaption></figure><div class="frame-notes"><div class="frame-tags"><span class="evidence-tag">${frame.slowMotion ? t('慢動作序列', 'Slow-motion sequence') : t('影格觀察', 'Frame observation')}</span><span class="meta">${frame.players.map(profileName).map(escape).join(' / ')} · ${escape(eraName(frame.era))}</span></div><h3>${e(frame.title)}</h3>${frame.notes.map((note, i) => `<p><b>${i + 1}</b>${e(note)}</p>`).join('')}${link(timedUrl, t('在原片看前後動作', 'Watch the surrounding movement'))}<div class="related-links">${frame.topics.map(id => `<a href="#lesson-${escape(id)}">${e(curriculum?.units.find(unit => unit.id === id)?.title || id)} →</a>`).join('')}${frameRecords(frame, source)}</div></div>${renderSlowMotion(frame.slowMotion, source)}</article>`;
  }).join('') : empty(t('這個組合目前沒有影格。可切換時期、主題，或取消「只看慢動作序列」。', 'No frames match. Change the era or topic, or turn off the slow-motion-only filter.'));
}
function render() { renderOverview(); renderLessons(); renderDirectory(); renderResearch(); renderFrames(); renderPlayerStudy(); renderVideos(); renderOtherPlayers(); renderMatchups(); renderSimulation(); motionLab?.setLanguage(); setChapter(activeChapter, false); }
const techniqueNames = { serve: ['發球', 'Service'], receive: ['接發球', 'Receive'], thirdBall: ['前三板', 'First three strokes'], forehand: ['正手', 'Forehand'], backhand: ['反手', 'Backhand'], transition: ['正反手銜接', 'Stroke transitions'], footwork: ['步法', 'Footwork'], distance: ['離台距離', 'Table distance'], placement: ['落點', 'Placement'], offenseDefense: ['攻防轉換', 'Attack and defense'] };
function eraName(id) { return localized(corpus?.eras.find(item => item.id === id)?.label) || (id === 'undatedRecent' ? t('近期（日期未明）', 'Recent, undated') : id); }
function videoFor(id) { return corpus?.videos.find(video => video.id === id || video.videoId === id); }
function evidenceLinks(evidence = []) {
  return evidence.map(item => { const video = videoFor(item.videoId); return video ? link(`${video.url}&t=${Math.floor(item.start || 0)}s`, `${video.event || localized(video.title)} · ${Math.floor((item.start || 0) / 60)}:${String(Math.floor((item.start || 0) % 60)).padStart(2, '0')}`) + (item.segmentId ? ` · <a href="#segment-${escape(item.segmentId)}">${t('本頁觀察紀錄', 'Observation record')} →</a>` : '') : ''; }).join(' · ');
}
function sourceLinks(sources = []) { return sources.map(source => link(source.url, source.title)).join(' · '); }
function renderOtherPlayers() {
  if (!otherPlayers) return;
  $('otherPlayersMethod').textContent = localized(otherPlayers.method);
  const opened = new Set([...document.querySelectorAll('.other-player[open]')].map(node => node.id));
  const profiles = otherPlayers.players.filter(profile => player === 'all' || profile.id === player);
  $('other-players').hidden = !profiles.length;
  $('otherPlayerList').innerHTML = profiles.map(profile => `<details class="lesson other-player" id="profile-${escape(profile.id)}" ${opened.has(`profile-${profile.id}`) || player === profile.id ? 'open' : ''}><summary><span>${e(profile.name)}</span><small>${profile.hand === 'left' ? t('左手', 'Left-handed') : t('右手', 'Right-handed')} · ${e(profile.grip)}</small></summary><div class="lesson-content"><p>${e(profile.intro)}</p><div class="related-links">${pairLink(profile.id)}</div><h3>${t('如何建立優勢', 'How the advantage is built')}</h3>${list(profile.strengths)}<h3>${t('對手可測試的方向', 'Options an opponent can test')}</h3>${list(profile.vulnerabilities)}<h3>${t('具體比賽與打法證據', 'Specific matches and tactical evidence')}</h3>${profile.matches.map(match => `<article class="match-evidence"><div class="meta">${escape(match.date)} · ${escape(match.event)} · ${escape(match.opponent)}</div><h4>${e(match.result)}</h4><p>${e(match.finding)}</p>${link(match.url, match.title)}</article>`).join('')}<h3>${t('時期變化', 'Changes across eras')}</h3>${profile.changes.map(change => `<h4>${e(change.title)}</h4><p>${e(change.finding)}</p><p class="caption">${e(change.limits)}</p><div class="lesson-source">${change.sourceUrls.map((url, index) => link(url, t(`比賽來源 ${index + 1}`, `Match source ${index + 1}`))).join(' · ')}</div>`).join('')}<h3>${t('對戰時值得觀察的細節', 'What to inspect in a matchup')}</h3>${list(profile.matchupKeys)}<p class="caption">${e(profile.limits)}</p></div></details>`).join('');
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
  $('matchupRates').innerHTML = `<div class="rate-grid history-rates"><article class="card"><div class="meta">${record.complete ? t('官方完整交手紀錄', 'Official complete record') : t('已核對樣本，並非完整交手', 'Verified sample, not a complete record')}</div><h3>${t('歷史樣本勝率', 'Historical sample rate')}</h3><strong class="rate">${record.n ? percent(record.winsA / record.n) : '—'}</strong><p>${escape(nameA)} ${record.winsA} : ${record.winsB} ${escape(nameB)}<br>${t(`共 ${record.n} 場`, `${record.n} matches`)}</p></article><article class="card"><div class="meta">${t('同一樣本的最近兩年', 'Last two years within the same sample')}</div><h3>${t('近期樣本勝率', 'Recent sample rate')}</h3><strong class="rate">${recent.n ? percent(recent.winsA / recent.n) : '—'}</strong><p>${escape(nameA)} ${recent.winsA} : ${recent.winsB} ${escape(nameB)}<br>${t(`共 ${recent.n} 場`, `${recent.n} matches`)}</p></article></div>`;
  $('matchupForecast').innerHTML = `<article class="card forecast"><div class="meta">${t('探索性模型 · 尚未驗證', 'Exploratory model · unvalidated')}</div><h3>${escape(nameA)} × ${escape(nameB)}</h3><p>${t('模型估計：', 'Model estimate: ')}${escape(nameA)}${t('勝出機率', ' win probability')}</p><strong class="rate">${estimate ? percent(estimate.probability) : '—'}</strong><p>${escape(nameA)}<br>${estimate ? t(`90% 可信區間 ${percent(estimate.low)}–${percent(estimate.high)}`, `90% credible interval ${percent(estimate.low)}–${percent(estimate.high)}`) : t('資料不足', 'Insufficient data')}</p><p class="caption">${estimate ? t(`${estimate.n} 場；權重合計 ${estimate.effectiveN.toFixed(1)}。${estimate.n < 5 ? '少量樣本，不適合下強結論。' : '樣本選取仍可能造成偏差。'}`, `${estimate.n} results; total weight ${estimate.effectiveN.toFixed(1)}. ${estimate.n < 5 ? 'Small sample: avoid strong conclusions.' : 'Selection bias remains possible.'}`) : ''}</p></article>`;
  $('matchupStyle').innerHTML = `<article class="card"><h3>${t('球風怎樣互相影響', 'How the styles interact')}</h3><p>${e(pair.styleInteraction)}</p><div class="lesson-source">${sourceLinks(pair.sources)}</div></article>`;
  const matches = verifiedMatches(pair);
  $('matchupHistory').innerHTML = `<table class="matchup-table"><thead><tr><th>${t('日期', 'Date')}</th><th>${t('比賽', 'Event')}</th><th>${t('勝方', 'Winner')}</th><th>${t('局數（勝方在前）', 'Score (winner first)')}</th><th>${t('來源', 'Source')}</th></tr></thead><tbody>${matches.map(match => `<tr><td>${escape(match.date)}</td><td>${escape(match.event)}</td><td>${escape(matchupName(match.winner))}</td><td>${escape(match.score)}</td><td>${link(match.url, t('賽果來源', 'Result source'))}</td></tr>`).join('')}</tbody></table>`;
  $('matchupLimits').textContent = `${t('資料截至：', 'Data as of: ')}${matchups.updatedAt} · ${(pair.evidenceLimits || []).map(localized).join(' · ')}`;
}
function renderSimulation() {
  if (!simulation) return;
  const levels = simulation.pairings.find(pair => pair.a === 'lin' && pair.b === 'harimoto')?.levels || [], labels = { easy: ['球館新手', 'Beginner'], normal: ['熟練球友', 'Regular'], hard: ['球館高手', 'Champion'] };
  $('gameSimulation').innerHTML = `<p>${e(simulation.method)}</p><p>${e(simulation.format)}</p><div class="table-scroll"><table><thead><tr><th>${t('對手設定', 'Opponent setting')}</th><th>${t('完成單局', 'Completed games')}</th><th>${t('林勝 : 張本勝', 'Lin wins : Harimoto wins')}</th><th>${t('林的遊戲勝率', 'Lin’s game win rate')}</th></tr></thead><tbody>${levels.map(level => { const complete = level.winsA + level.winsB; return `<tr><td>${escape(labels[level.level]?.[language === 'zh' ? 0 : 1] || level.level)}</td><td>${complete}</td><td>${level.winsA} : ${level.winsB}</td><td>${complete ? percent(level.winsA / complete) : '—'}</td></tr>`; }).join('')}</tbody></table></div><h4>${t('交換兩端後的分開結果', 'Results by near-side player')}</h4>${levels.map(level => `<p>${escape(labels[level.level]?.[language === 'zh' ? 0 : 1] || level.level)} · ${level.bySide.map(side => `${side.near === 'lin' ? t('林在近端', 'Lin near') : t('張本在近端', 'Harimoto near')} ${side.winsA}:${side.winsB}${side.truncated ? t(`，${side.truncated} 局逾時`, `, ${side.truncated} timed out`) : ''}`).map(escape).join(' ／ ')}</p>`).join('')}${list(simulation.limits)}<p class="caption">${t('另外五人的遊戲角色尚未實作，因此不附上虛構的遊戲勝率；各組真人勝率請見「對戰研究」的實際賽果推算。', 'The other five game profiles are not implemented, so no game win rates are fabricated for them. Real-world estimates using actual results appear in the Matchup studies chapter.')}</p>`;
}
function renderPlayerStudy() {
  if (!corpus || !analysis) return;
  const profiles = primaryPlayers(), eras = corpus.eras.filter(item => era === 'all' || item.id === era);
  $('eraComparison').innerHTML = `<div class="table-scroll era-compare"><table><thead><tr><th>${t('時期', 'Era')}</th>${profiles.map(profile => `<th>${e(profile.name)}</th>`).join('')}</tr></thead><tbody>${eras.map(item => `<tr><th>${e(item.label)}</th>${profiles.map(profile => {
    const period = profile.periods.find(period => period.era === item.id);
    return `<td><span class="evidence-tag${period?.confidence === 'notObserved' ? ' pending' : ''}">${period?.confidence === 'notObserved' ? t('影片比較待核', 'Video comparison pending') : t('有限抽樣', 'Limited sample')}</span><p>${e(period?.summary)}</p></td>`;
  }).join('')}</tr>`).join('')}</tbody></table></div><p class="caption">${t('證據待補代表尚未建立比較，不代表該選手當時沒有這項技術。', 'Pending evidence means a comparison is not established; it does not mean the player lacked a technique.')}</p>`;
  const changes = profiles.flatMap(profile => (profile.changes || []).filter(change => era === 'all' || change.fromEra === era || change.toEra === era || change.evidence?.some(item => videoFor(item.videoId)?.era === era)).map(change => `<article class="card ${escape(profile.player)}"><div class="meta">${e(profile.name)} · ${escape(eraName(change.fromEra))} → ${escape(eraName(change.toEra))}</div><span class="evidence-tag${change.status === 'sourceBased' ? ' source' : ''}">${escape(evidenceLabel(change.status))}</span><h3>${e(change.title || change.topic)}</h3><p>${e(change.observation || change.summary)}</p>${change.inference ? `<p class="application">${t('解讀：', 'Interpretation: ')}${e(change.inference)}</p>` : ''}${change.limits?.length ? `<p class="caption">${change.limits.map(localized).map(escape).join(' · ')}</p>` : ''}<div class="lesson-source">${sourceLinks(change.sources)}${change.sources?.length && change.evidence?.length ? ' · ' : ''}${evidenceLinks(change.evidence)}</div></article>`));
  $('changeList').innerHTML = changes.length ? `<div class="technical-grid">${changes.join('')}</div>` : empty(t('目前沒有涉及所選時期的跨期比較。', 'No cross-era comparison is available for this selection.'));
  selectOptions('playerTopic', [['all', t('所有技術主題', 'All technical topics')], ...Object.entries(techniqueNames).map(([key, names]) => [key, names[language === 'zh' ? 0 : 1]])], playerTopic);
  const opened = new Set([...document.querySelectorAll('.technique-study[open]')].map(node => node.id));
  $('technicalList').innerHTML = profiles.map(profile => {
    const periods = profile.periods.filter(period => era === 'all' || period.era === era), topics = Object.keys(techniqueNames).filter(key => playerTopic === 'all' || key === playerTopic);
    return `<h3>${e(profile.name)}</h3>${topics.map(key => {
      const supported = periods.filter(period => period.techniques[key]?.status !== 'notObserved').length;
      return `<details class="lesson technique-study" id="study-${escape(profile.player)}-${key}" ${opened.has(`study-${profile.player}-${key}`) || playerTopic !== 'all' ? 'open' : ''}><summary><span>${escape(techniqueNames[key][language === 'zh' ? 0 : 1])}</span><small>${t(`${supported} / ${periods.length} 期有依據`, `${supported} / ${periods.length} eras with evidence`)}</small></summary><div class="lesson-content technical-grid">${periods.map(period => {
        const value = period.techniques[key];
        return `<article class="card ${escape(profile.player)}"><div class="meta">${escape(eraName(period.era))}</div><span class="evidence-tag${value.status === 'sourceBased' ? ' source' : value.status === 'notObserved' ? ' pending' : ''}">${escape(evidenceLabel(value.status))}</span><p>${value.status === 'notObserved' ? t('目前沒有這一時期可用的影片或原始報導結論；不據此判定球員當年不用這項技術。', 'No usable video or original-report finding is listed for this era. This does not establish that the player did not use the technique.') : e(value.observation)}</p>${value.inference ? `<p class="application">${t('解讀：', 'Interpretation: ')}${e(value.inference)}</p>` : ''}${value.limits?.length ? `<p class="caption">${value.limits.map(localized).map(escape).join(' · ')}</p>` : ''}<div class="lesson-source">${sourceLinks(value.sources)}${value.sources?.length && value.evidence?.length ? ' · ' : ''}${evidenceLinks(value.evidence)}</div>${lessonStroke[key] ? `<div class="related-links"><a href="#motion-lab" data-lab-stroke="${lessonStroke[key]}" data-lab-player="${profile.player}">${t('查看遊戲動作', 'Inspect the game stroke')} →</a></div>` : ''}</article>`;
      }).join('')}</div></details>`;
    }).join('')}`;
  }).join('');
}
function renderVideos() {
  if (!corpus) return;
  selectOptions('videoPlayer', [['all', t('兩人全部', 'Both players')], ...corpus.players.map(item => [item.id, localized(item.name)])], videoPlayer);
  selectOptions('era', eraOptions(), videoEra);
  selectOptions('videoStatus', [['observed', t('已抽看片段', 'Sampled segments observed')], ['all', t('全部已整理片源', 'All listed sources')], ['listed', t('僅整理片源，未觀看', 'Listed, not watched')]], videoStatus);
  const matching = corpus.videos.filter(video => (videoPlayer === 'all' || video.players.includes(videoPlayer)) && (videoEra === 'all' || video.era === videoEra) && (videoStatus === 'all' || (video.status === 'observed') === (videoStatus === 'observed')));
  const observations = matching.flatMap(video => corpus.segments.filter(segment => (segment.videoId === video.id || segment.videoId === video.videoId) && (videoPlayer === 'all' || segment.player === videoPlayer)));
  const intervals = new Set(observations.map(segment => segment.physicalIntervalId || segment.id));
  $('videoResults').textContent = t(`顯示 ${matching.length} 支片源、${observations.length} 筆選手觀察、${intervals.size} 段抽樣序列。兩名選手在同一段的紀錄不算兩個回合。`, `Showing ${matching.length} videos, ${observations.length} player observations and ${intervals.size} sampled sequences. Two player records in the same interval do not count as two rallies.`);
  const opened = new Set([...document.querySelectorAll('.video[open]')].map(node => node.id));
  $('videos').innerHTML = matching.length ? matching.map(video => {
    const segments = corpus.segments.filter(segment => (segment.videoId === video.id || segment.videoId === video.videoId) && (videoPlayer === 'all' || segment.player === videoPlayer));
    return `<details class="video" id="video-${escape(video.id)}" ${opened.has(`video-${video.id}`) ? 'open' : ''}><summary><span>${e(video.title)}<br><small class="meta">${escape(eraName(video.era))} · ${video.status === 'observed' ? t('已抽看片段，未整場閱完', 'Sampled, not watched in full') : t('片源已整理，尚未觀看', 'Listed, not yet observed')} · ${escape(video.channel)}</small></span>${link(video.url, t('原片', 'Source'))}</summary><div class="segments">${segments.length ? segments.map(segment => `<div class="segment" id="segment-${escape(segment.id)}">${link(`${video.url}&t=${Math.floor(segment.start)}s`, segment.timestampLabel)}<div><p>${e(corpus.players.find(item => item.id === segment.player)?.name)} · ${e(segment.observation)}</p>${renderSegmentDetails(segment, video)}${segment.inference ? `<p class="application">${t('解讀：', 'Interpretation: ')}${e(segment.inference)}</p>` : ''}<small>${(segment.evidenceLimits || []).map(localized).map(escape).join(' · ')}</small></div></div>`).join('') : `<p class="caption">${t('目前僅確認片源，未加入觀察結論。', 'Only the source has been identified; no observation claims are attached.')}</p>`}</div></details>`;
  }).join('') : empty(t('這個篩選組合尚無片源，可改看全部時期或全部已整理片源。', 'No source matches these filters. Try all eras or all listed sources.'));
}
function setChapter(id, scroll = true) {
  if (!document.getElementById(id)?.classList.contains('academy-panel')) id = 'overview';
  activeChapter = id;
  document.querySelectorAll('.academy-panel').forEach(panel => { panel.hidden = panel.id !== id; });
  document.querySelectorAll('[data-chapter]').forEach(item => { if (item.dataset.chapter === id) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current'); });
  const activeLink = document.querySelector(`[data-chapter="${id}"]`), chapterNav = activeLink?.parentElement;
  if (chapterNav && chapterNav.scrollWidth > chapterNav.clientWidth) { const left = activeLink.offsetLeft - chapterNav.offsetLeft; if (left < chapterNav.scrollLeft || left + activeLink.offsetWidth > chapterNav.scrollLeft + chapterNav.clientWidth) chapterNav.scrollLeft = left; }
  document.querySelectorAll('video').forEach(video => { if (video.closest('.academy-panel')?.hidden) video.pause(); });
  const heading = $(id).querySelector('h1'); document.title = `${heading.textContent} — RALLY`;
  if (scroll) window.scrollTo({ top: 0 });
}
function resolveHash(focus = false) {
  let id; try { id = decodeURIComponent(location.hash.slice(1)) || 'overview'; } catch { id = 'overview'; }
  if (id.startsWith('lesson-') && curriculum) { lessonGroup = 'all'; renderLessons(); }
  if (id.startsWith('profile-') && otherPlayers?.players.some(profile => `profile-${profile.id}` === id)) { player = id.slice(8); renderDirectory(); renderOtherPlayers(); }
  if (id.startsWith('segment-') && corpus) {
    const segment = corpus.segments.find(segment => `segment-${segment.id}` === id);
    if (segment) { videoPlayer = segment.player; videoEra = 'all'; videoStatus = 'observed'; renderVideos(); }
  }
  if (id.startsWith('video-') && corpus?.videos.some(video => `video-${video.id}` === id)) { videoPlayer = 'all'; videoEra = 'all'; videoStatus = 'all'; renderVideos(); }
  if (id.startsWith('frame-') && frameStudy?.frames.some(frame => `frame-${frame.id}` === id)) { framePlayer = frameEra = frameTopic = 'all'; $('frameReplay').checked = false; renderFrames(); }
  if ($(id)?.closest('#corePlayers') && $('corePlayers').hidden) { player = 'all'; renderDirectory(); renderResearch(); renderPlayerStudy(); renderOtherPlayers(); }
  const target = $(id), fallback = id.startsWith('lesson-') ? 'lessons' : id.startsWith('segment-') || id.startsWith('video-') || id.startsWith('frame-') ? 'frame-study' : id.startsWith('profile-') ? 'players' : 'overview';
  const panel = target?.closest('.academy-panel'); setChapter(panel?.id || (id === 'content' ? activeChapter : fallback), false);
  target?.closest('details')?.setAttribute('open', '');
  if (target?.matches('details')) target.open = true;
  requestAnimationFrame(() => {
    const scrollTarget = target || $(activeChapter);
    if (scrollTarget.matches('.academy-panel')) window.scrollTo({ top: 0 }); else scrollTarget.scrollIntoView({ block: 'start' });
    if (focus) { const focusTarget = target?.matches('details') ? target.querySelector('summary') : $(activeChapter).querySelector('h1'); focusTarget.setAttribute('tabindex', '-1'); focusTarget.focus({ preventScroll: true }); }
  });
}
function navigateTo(id) { if (location.hash === `#${id}`) resolveHash(true); else location.hash = id; }
let labLoading = null;
async function openMotionLab(stroke, selectedPlayer) {
  if (stroke && lessonStroke[stroke]) $('labStroke').value = lessonStroke[stroke];
  if (selectedPlayer && ['lin', 'harimoto'].includes(selectedPlayer)) $('labPlayer').value = selectedPlayer;
  setChapter('motion-lab'); navigateTo('motion-lab'); $('lab').hidden = false; $('openLab').hidden = true;
  try {
    if (!motionLab) { labLoading ||= import('./motion-lab.js?v=7').then(({ createMotionLab }) => { motionLab = createMotionLab(() => language); }); await labLoading; }
    else $('labStroke').dispatchEvent(new Event('change'));
  } catch (error) { labLoading = null; console.error(error); $('lab').hidden = true; $('openLab').hidden = false; $('error').hidden = false; $('error').textContent = t('3D 示範無法開啟，請開啟硬體加速或重新整理。', 'The 3D lab could not open. Enable hardware acceleration or reload.'); }
}
$('language').addEventListener('click', () => {
  language = language === 'zh' ? 'en' : 'zh'; document.documentElement.lang = language === 'zh' ? 'zh-Hant' : 'en';
  document.querySelectorAll('[data-en]').forEach(node => { if (language === 'en') node.textContent = node.dataset.en; else node.innerHTML = original.get(node); });
  $('language').textContent = language === 'zh' ? 'EN' : '中文'; render();
});
$('playerSelect').addEventListener('change', () => { player = $('playerSelect').value; renderDirectory(); renderResearch(); renderPlayerStudy(); renderOtherPlayers(); });
$('playerEra').addEventListener('change', () => { era = $('playerEra').value; renderResearch(); renderPlayerStudy(); });
$('playerTopic').addEventListener('change', () => { playerTopic = $('playerTopic').value; renderPlayerStudy(); });
$('framePlayer').addEventListener('change', () => { framePlayer = $('framePlayer').value; renderFrames(); });
$('frameEra').addEventListener('change', () => { frameEra = $('frameEra').value; renderFrames(); });
$('frameTopic').addEventListener('change', () => { frameTopic = $('frameTopic').value; renderFrames(); });
$('frameReplay').addEventListener('change', renderFrames);
$('videoPlayer').addEventListener('change', () => { videoPlayer = $('videoPlayer').value; renderVideos(); });
$('era').addEventListener('change', () => { videoEra = $('era').value; renderVideos(); });
$('videoStatus').addEventListener('change', () => { videoStatus = $('videoStatus').value; renderVideos(); });
$('matchupPair').addEventListener('change', () => { pairingId = $('matchupPair').value; renderMatchups(); });
$('matchupHalfLife').addEventListener('change', renderMatchups);
$('openLab').addEventListener('click', () => openMotionLab());
window.addEventListener('hashchange', () => resolveHash(true));
document.addEventListener('click', event => {
  const group = event.target.closest('[data-lesson-group]');
  if (group) { lessonGroup = group.dataset.lessonGroup; renderLessons(); return; }
  const profile = event.target.closest('[data-select-player]');
  if (profile) { event.preventDefault(); player = profile.dataset.selectPlayer; renderDirectory(); renderResearch(); renderPlayerStudy(); renderOtherPlayers(); navigateTo('players'); return; }
  const pair = event.target.closest('[data-pair]');
  if (pair) { event.preventDefault(); pairingId = pair.dataset.pair; renderMatchups(); navigateTo('matchups'); return; }
  const stroke = event.target.closest('[data-lab-stroke]');
  if (stroke) { event.preventDefault(); openMotionLab(stroke.dataset.labStroke, stroke.dataset.labPlayer); return; }
  const frames = event.target.closest('[data-frame-topic]');
  if (frames) { event.preventDefault(); frameTopic = frames.dataset.frameTopic; framePlayer = frameEra = 'all'; $('frameReplay').checked = false; renderFrames(); navigateTo('frame-library'); }
  const anchor = event.target.closest('a[href^="#"]');
  if (anchor && anchor.hash === location.hash && !profile && !pair && !stroke && !frames) { event.preventDefault(); resolveHash(true); }
});
resolveHash();
const results = await Promise.allSettled(['../supporting-research.json', '../reference-corpus.json', '../style-analysis.json', './techniques.json', './reference-frames.json', './other-players.json', './matchups.json', './game-simulation.json'].map(async path => {
  const response = await fetch(`${path}?v=7`); if (!response.ok) throw new Error(path); return response.json();
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
resolveHash();
