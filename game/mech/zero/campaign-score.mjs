// Original chamber-orchestra scores. Durations are quarter notes; the sequel's
// written 6/8 has two dotted-quarter beats per bar.
import { Score, bassOf, chordOf, fanfare, voiceLeadChord } from '../audio.js';

const falcon = [62, 69, 70, 69, 65, 67]; // D–A, then the semitone above the call.
const names = [67, 68, 70, 75, 74, 70];  // Three rising eighths lead into the high E-flat.
const four = {
  call: [1.5, .5, 1, 1, 2.5, 1.5],
  march: [.75, .25, 1.5, 1.5, 3, 1],
  chase: [.5, 1, .5, 2, 2.5, 1.5],
  hymn: [2, 1.5, .5, 2, 1, 1],
};
const six = {
  call: [.5, .5, .5, 2.5, .5, 1.5],
  tide: [1.5, 1, .5, 1.5, .5, 1],
  drive: [.5, .5, 1.5, .5, 2, 1],
  hymn: [2, .5, .5, 1.5, 1, .5],
};

// Eight chords for the exposition, four for the development. Each cue has
// separate A and B lines. The recurring campaign call enters as an answer.
function cue(title, bpm, style, chords, tune, reply) {
  return { title, bpm, style, chords, tune, reply };
}
const zero = {
  zTheme: cue('隼的火種', 101, 'hymn', 'Dm Bbmaj7 F C Gm Dm Bb A7 Bb F Gm A', falcon, [77,76,74,72,69,73]),
  zFall: cue('第三夜的鐘', 112, 'march', 'Dm Gm Bb A Dm C Bb A7 F C Gm A', [69,69,65,62,64,67], [70,74,72,69,67,64]),
  zCord: cue('封鎖線以西', 123, 'chase', 'Gm Dm Eb Bb Gm Cm Dsus D7 Bb F Cm D', [67,74,72,70,69,74], [77,75,74,70,72,69]),
  zNorth: cue('空床旁的錄音', 83, 'hymn', 'Dm F C Gm Bb Dm Em7 A7 Gm Bb F A', [65,69,67,64,62,65], [74,72,69,70,67,64]),
  zKey: cue('留給活人的金鑰', 120, 'march', 'Dm Bb F C Gm Bb A7 Dm Eb Bb Gm A', [74,73,74,77,76,72], [69,70,74,79,77,76]),
  zRoad: cue('橋墩間的引擎', 132, 'chase', 'Am G F E Am C Dm E7 F C G E', [69,72,76,74,71,72], [76,79,77,74,72,71]),
  zHangar: cue('第七扇鐵門', 99, 'march', 'Em C G D Am Em C B7 C G Am B', [64,71,67,66,64,71], [79,78,76,74,71,75]),
  zIgnite: cue('蒼焰甦醒', 116, 'hymn', 'Dm F Bb C Dm Bb Csus A7 Gm Bb F A', [69,74,77,76,74,72], [65,67,69,74,73,69]),
  zSortie: cue('越過東牆', 126, 'chase', 'Dm C Bb F Gm Dm C A7 F Gm Bb A', [74,77,76,74,69,72], [70,74,79,77,76,73]),
  zHound: cue('黑犬的影子', 116, 'march', 'Em C Am B7 Em G Am B C Am Em B', [64,64,71,70,67,66], [76,74,71,72,69,66]),
  zPursuit: cue('穿城的蒼焰', 136, 'chase', 'Am F C G Am Dm F E7 Dm Am F E', [76,72,69,71,74,72], [77,76,74,69,72,71]),
  zDuel: cue('敲響破曉之前', 128, 'tutti', 'Dm Bb Gm A7 Dm F Bb A Gm Eb Bb A7', [74,81,82,81,77,76], [77,79,82,81,76,73]),
  zHill: cue('山手坡上的餘燼', 78, 'hymn', 'F C Dm Am Bb F Gm C Dm Bb Gm C', [69,72,74,72,67,65], [77,76,72,74,70,67]),
  zHome: cue('把黎明交給你', 88, 'end', 'D G D A Bm G Asus D Em Bm G A7', [66,69,74,73,71,69], [74,78,76,74,71,69]),
};
const line = {
  lTheme: cue('六十四個名字', 108, 'hymn', 'Eb Ab Bb Eb Cm Ab Fm Bb7 Cm Gm Ab Bb', names, [75,77,79,77,75,74]),
  lCustoms: cue('海關的名冊', 110, 'tide', 'Cm Ab Eb Bb Cm Fm Ab G7 Eb Bb Fm G', [67,63,65,67,68,70], [72,75,74,70,67,71]),
  lDark: cue('斷訊的港口', 96, 'drive', 'Cm Fm Ab G7 Cm Eb Fm G Ab Eb Fm G', [60,67,66,67,63,62], [72,70,68,67,65,62]),
  lManifest: cue('氧氣與名字', 98, 'hymn', 'Ab Eb Fm Db Ab Cm Db Eb7 Fm Db Bbm Eb', [72,70,68,75,72,70], [77,75,72,73,70,68]),
  lOrders: cue('冷藏站的假命令', 121, 'drive', 'Cm Gm Ab G Cm Bb Fm G7 Ab Eb Fm G', [67,70,68,67,63,62], [72,74,75,71,72,67]),
  lAuth: cue('隼的第二份簽章', 110, 'hymn', 'Dm Bb F C Gm Dm Bb A7 Bb F Gm A', falcon, [77,76,74,69,70,73]),
  lDocks: cue('吊架之下', 116, 'tide', 'Fm Db Ab Eb Fm Bbm Db C7 Ab Eb Bbm C', [65,68,72,70,68,67], [77,75,73,72,70,67]),
  lBreak: cue('船塢啟航', 141, 'drive', 'Eb Bb Cm Ab Fm Cm Absus Bb7 Gm Ab Fm Bb', [70,75,77,79,77,75], [79,82,80,77,75,74]),
  lConvoy: cue('最後一班撤離車', 122, 'tide', 'Ab Db Fm Eb Ab Bbm Db Eb7 Fm Ab Bbm Eb', [68,72,75,77,75,72], [80,79,77,75,72,70]),
  lRescue: cue('橋頭仍有人', 106, 'hymn', 'F Bb Dm C F Gm Bb C7 Dm Am Bb C', [69,70,72,77,76,72], [77,79,81,77,74,72]),
  lBatteryRun: cue('砲火下的岔路', 143, 'drive', 'Gm Eb Bb F Gm Cm Eb D7 Cm Gm Eb D', [67,70,74,72,69,67], [79,77,75,74,70,69]),
  lRadio: cue('讓港外聽見', 112, 'tide', 'Eb Cm Ab Bb Eb Ab Fm Bb7 Cm Ab Eb Bb', [70,67,68,70,75,74], [75,79,77,75,74,70]),
  lAir: cue('封鎖線上的廣播', 132, 'tutti', 'Ab Eb Fm Db Ab Bbm Db Eb7 Fm Db Ab Eb', [75,80,79,77,75,72], [77,80,82,84,80,79]),
  lBattery: cue('沉默砲陣', 138, 'drive', 'Fm Eb Db C Fm Ab Bbm C7 Db Ab Bbm C', [72,72,68,65,67,70], [77,80,79,77,73,72]),
  lGate: cue('閘門未開', 118, 'tide', 'Cm Eb Ab Bb Cm Gm Fm G7 Ab Cm Fm G', [67,72,70,68,67,65], [75,74,72,70,68,71]),
  lCaptain: cue('港外第一道光', 144, 'tutti', 'Eb Ab Cm Bb Eb Fm Ab Bb7 Cm Db Ab Bb', [75,79,82,84,82,79], [79,80,82,87,86,82]),
  lHill: cue('山坡望見的船燈', 84, 'hymn', 'Ab Fm Db Eb Ab Cm Bbm Eb Db Ab Fm Eb', [68,70,72,75,73,72], [80,77,75,73,72,70]),
  lHome: cue('每個人都有名字', 96, 'end', 'Eb Ab Cm Bb Eb Fm Bb7 Eb Ab Fm Eb Bb', [67,68,70,75,77,79], [79,77,75,74,70,75]),
};

// Separate violin lines for the two final reprises. The infantry line holds
// against the dotted brass call; the convoy line climbs in compound time.
const houndDescant = [
  [[81, 3], [79, 1], [77, 2], [74, 2]],
  [[79, 2], [77, 1.5], [76, .5], [73, 3], [76, 1]],
  [[77, 2], [81, 2], [84, 3], [81, 1]],
  [[82, 1.5], [81, .5], [77, 2], [76, 3], [73, 1]],
];
const harbourDescant = [
  [[79, 1.5], [82, 1.5], [84, 2.5], [80, .5]],
  [[79, 2], [75, 1], [77, 2.5], [74, .5]],
  [[82, 2.5], [79, .5], [80, 1.5], [84, 1.5]],
  [[84, 1.5], [80, 1.5], [77, 1.5], [74, 1.5]],
];

function melody(score, beat, instrument, pitches, lengths, velocity, gate) {
  for (let i = 0; i < pitches.length; i++) {
    const length = lengths[i];
    score.at(beat, { k: instrument, m: pitches[i], ...gate, d: length * .94, v: velocity * (i === 0 || i === 3 ? 1 : .87) });
    beat += length;
  }
}

// Fit the campaign quotation to the movement's tonal centre while preserving
// its intervals (including the borrowed minor sixth of the prequel call).
function transposeCall(call, from, to) {
  const delta = (to - from + 18) % 12 - 6;
  return call.map(note => note + delta);
}
function arrange(cue, sequel) {
  const bar = sequel ? 3 : 4, rhythms = sequel ? six : four;
  const end = cue.style === 'end', tutti = cue.style === 'tutti';
  const drive = ['drive', 'chase', 'march'].includes(cue.style);
  const lyrical = cue.style === 'hymn' || end;
  const bars = end ? 6 : 24;
  const adaptive = drive || cue.style === 'tide';
  const score = new Score(bars * bar / 4, cue.bpm), changes = cue.chords.split(' ').map(chordOf);
  const theme = transposeCall(sequel ? names : falcon, sequel ? 3 : 2, changes[0].r);
  const rhythm = rhythms[cue.style] || (lyrical ? rhythms.hymn : rhythms.call);
  const answerRhythm = sequel ? six.tide : four.call;
  const voicings = new Map();
  let previous = null;
  for (let i = 0; i < bars; i++) {
    const t = i * bar, j = i % 8, bridge = i >= 8 && i < 16, reprise = i >= 16;
    const closing = end && i === bars - 1;
    const chord = closing ? changes[0] : end && i === bars - 2 ? changes[11] : changes[bridge ? 8 + j % 4 : j];
    const id = [chord.r, ...chord.iv, '/', ...(previous || [])].join(',');
    if (!voicings.has(id)) voicings.set(id, voiceLeadChord(chord, previous));
    const n = voicings.get(id), bass = bassOf(chord);
    previous = n;
    const weight = bridge ? .62 : reprise || tutti ? .94 : .77;
    score.at(t, { k: 'pad', n, d: bar - .09, v: weight });
    score.at(t, { k: 'bass', m: bass, d: drive ? bar * .47 : bar * .9, v: .70 });
    if (closing) {
      score.at(t, { k: 'brass', n: fanfare((chord.r + chord.iv[1]) % 12, chord.r, n[3]), d: bar * .9, v: .80 });
      score.at(t, { k: 'bell', m: bass + 36, v: .55 });
      score.at(t, { k: 'str', m: bass + 36, d: bar * .94, v: .82 });
      continue;
    }
    if (j % 2 === 0) {
      let pitches = cue.tune, lens = cue.tune === names || cue.tune === falcon ? rhythms.call : rhythm;
      if (i === 2 || i === 16) { pitches = theme; lens = rhythms.call; }
      else if (bridge || j === 4) { pitches = cue.reply; lens = bridge ? rhythms.hymn : answerRhythm; }
      if (i === 10) {
        pitches = [n[2], n[1], n[0], n[1], n[2], n[3]];
        lens = answerRhythm;
      }
      if (i === 12) { pitches = cue.tune.map(m => m - 12); lens = rhythms.hymn; }
      if (end && i === bars - 2) {
        melody(score, t, 'horn', [n[2], n[1]], [bar * .5, bar * .5], .8);
      } else {
        const lead = bridge ? 'str' : (j === 4 && !reprise ? 'str' : 'horn');
        melody(score, t, lead, pitches, lens, bridge ? .83 : .95);
        if (adaptive && lead === 'horn') melody(score, t, 'str', pitches, lens, .74, { max: .52 });
        if (tutti && reprise) {
          const desk = (sequel ? harbourDescant : houndDescant)[j / 2];
          const shift = (changes[0].r - (sequel ? 3 : 2) + 18) % 12 - 6;
          score.mel(t, 'str', desk.map(([m, d]) => [m + shift, d]), { v: .82 });
        } else if (tutti && i === 0) {
          melody(score, t, 'str', pitches.map(m => m >= 80 ? m : m + 12), lens, .64);
        }
      }
    }
    const brass = fanfare((chord.r + chord.iv[1]) % 12, chord.r, n[3]);
    if (!bridge && (tutti || reprise || j % 2 === 0)) {
      score.at(t, { k: 'brass', n: brass, d: drive ? bar * .39 : bar * .84, v: weight * .86 });
      if ((drive || tutti) && j % 2) score.at(t + bar * .5, { k: 'brass', n: brass, d: bar * .34, v: .66 });
    }
    if ((lyrical || tutti || reprise) && j % 2 === 0 && !bridge) {
      score.at(t, { k: 'choir', n: [n[0], n[1], n[3]], d: bar * .95, v: .59 });
    }
    if (bridge || lyrical || (j % 2 === 1 && !drive)) {
      const counter = bridge ? 'pno' : 'ctr';
      melody(score, t + bar * .5, counter, [n[0], n[1]], [bar * .25, bar * .25], .68);
    }
    if (!bridge && (drive || tutti || (sequel && !lyrical))) {
      const beats = sequel ? [0,.5,1,1.5,2.5] : cue.style === 'march' ? [0,1.5,2,3.5] : [0,.75,1.5,2.5,3.5];
      beats.forEach((offset, k) => score.at(t + offset, { k: 'ost', bow: true, m: bass + (k % 3 === 2 ? 19 : 12), d: .36, v: k === 0 ? .88 : .64 }));
    }
    if (!bridge || j % 2 === 0) score.at(t, { k: 'ti', m: bass, v: weight * .84 });
    if (!bridge && (drive || tutti)) score.at(t + bar * .5, { k: 's', v: .43 });
    if (j === 7 && !(end && reprise)) {
      for (const [k, q] of [bar - 1, bar - .5, bar - .25].entries()) score.at(t + q, { k: 'ti', m: bass + 7, v: .40 + k * .14 });
      score.at(t + bar - 1, { k: 'sw', d: 1, v: .47 });
    }
    if (j === 0 && reprise) score.at(t, { k: 'c', v: .62 });
  }
  return Object.assign(score, { title: cue.title, orchestra: true, loop: !end, flat: !adaptive, rv: .27, padA: .4, tail: 3,
    mix: { pad: 7.2, str: 6.3, horn: 4.7, dr: .78, pno: 2.7 } });
}

// Keep only the current movement and its neighbour for immediate retries.
const cache = new Map();
function movement(key, cue, sequel) {
  if (!cache.has(key)) {
    if (cache.size >= 2) cache.delete(cache.keys().next().value);
    cache.set(key, arrange(cue, sequel));
  }
  return cache.get(key);
}
export const fieldScores = Object.create(null);
for (const [sequel, suite] of [[false, zero], [true, line]]) {
  for (const [key, cue] of Object.entries(suite)) fieldScores[key] = () => movement(key, cue, sequel);
}
