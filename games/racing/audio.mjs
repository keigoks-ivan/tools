// Original engine synthesis and REDLINE / 144 score. Audio is unlocked by a user gesture.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const finite = (n, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const unit = (n, fallback = 0) => clamp(finite(n, fallback), 0, 1);

export const AUDIO_DEFAULTS = Object.freeze({ enabled: true, musicVolume: .64, effectsVolume: .78 });

export function racingSoundProfile(vehicle = {}) {
  const name = `${vehicle.id || ''} ${vehicle.name || ''}`.toLowerCase();
  const cylinders = finite(vehicle.cylinders, finite(vehicle.engineCylinders,
    /812|revuelto|aventador|v12/.test(name) ? 12 : /hurac|r8|v10/.test(name) ? 10 : /911|porsche|296|gt-r|gtr|v6/.test(name) ? 6 : 8));
  const engineType = String(vehicle.engineType || '').toLowerCase();
  const induction = String(vehicle.induction || '').toLowerCase();
  return {
    firing: clamp(cylinders / 2, 2, 6),
    low: /mustang|corvette|mclaren|amg/.test(name) ? 1 : engineType === 'inline6' ? .85 : engineType === 'flat6' ? .74 : cylinders === 12 ? .38 : .50,
    turbo: induction ? /turbo|supercharg/.test(induction) : /turbo|296|f8|sf90|mclaren|720|750|gt-r|gtr|amg/.test(name),
    flat: engineType ? engineType === 'flat6' : /911|porsche/.test(name),
  };
}

// Pure control values are exported so malformed simulation data and different
// engine layouts can be checked without an audio device.
export function racingAudioFrame(state = {}, vehicle = {}) {
  const profile = racingSoundProfile(vehicle), idle = Math.max(500, finite(vehicle.idle, 950));
  const rpm = clamp(finite(state.rpm, idle), idle, Math.max(idle, finite(vehicle.redline, 9000)));
  const throttle = unit(state.throttle), speed = clamp(finite(state.speed), 0, 130);
  const slip = unit(state.slip), brake = unit(state.brake, unit(state.braking));
  const motion = clamp(speed / 13, 0, 1);
  return {
    profile, rpm, throttle, speed,
    firingHz: clamp(rpm / 60 * profile.firing, 25, 1000),
    crankHz: rpm / 60,
    engineGain: .18 + throttle * .20 + clamp((rpm - idle) / 9500, 0, .10),
    exhaustHz: 580 + rpm * .43 + throttle * 1300,
    intakeGain: throttle * (.018 + rpm / 160000),
    tyreGain: clamp((slip - .24) * .26 + brake * clamp((slip - .10) * .05, 0, .045), 0, .24) * motion,
    tyreHz: 1150 + speed * 13 + slip * 780,
    windGain: clamp((speed / 72) ** 2 * .095, 0, .16),
    roadGain: clamp(speed / 70, 0, 1) * (state.offTrack ? .12 : .021),
    roadHz: state.offTrack ? 470 + speed * 5 : 95 + speed * 2,
    turboGain: profile.turbo ? throttle * clamp(rpm / 9000, 0, 1) * .017 : 0,
    collision: unit(state.collision), gear: Math.max(1, Math.round(finite(state.gear, 1))),
  };
}

function noiseBuffer(context) {
  const buffer = context.createBuffer(1, Math.round(context.sampleRate * 2.17), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let seed = 458296, previous = 0;
  for (let i = 0; i < samples.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = seed / 2147483648 - 1;
    previous += (white - previous) * .16;
    samples[i] = white * .43 + previous * .65;
  }
  const fade = Math.round(context.sampleRate * .008);
  for (let i = 0; i < fade; i++) {
    samples[i] *= i / fade;
    samples[samples.length - 1 - i] *= i / fade;
  }
  return buffer;
}

export function createRacingAudio(options = {}) {
  const Context = options.AudioContext || globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!options.context && !Context) return null;
  const context = options.context || new Context({ latencyHint: 'interactive' });
  const document = options.document || globalThis.document;
  const music = options.musicElement || new Audio();
  const musicURL = new URL('./assets/audio/apex-redline.mp3', import.meta.url).href;
  music.preload = 'none'; music.loop = true;
  music.setAttribute?.('playsinline', '');
  if (!options.musicElement) {
    music.id = 'racing-music'; music.hidden = true; music.setAttribute?.('aria-hidden', 'true');
    document?.body?.append(music);
  }
  const nodes = [], sources = [], voices = new Set(), lastTargets = new WeakMap();
  const own = node => { nodes.push(node); return node; };
  const gain = value => { const node = own(context.createGain()); node.gain.value = value; return node; };
  const target = (parameter, value, time, rate = .06) => {
    if (lastTargets.get(parameter) === value) return;
    parameter.setTargetAtTime(value, time, rate); lastTargets.set(parameter, value);
  };
  const master = gain(.82), effects = gain(0), musicGain = gain(0), musicDuck = gain(1);
  const limiter = own(context.createDynamicsCompressor());
  limiter.threshold.value = -10; limiter.knee.value = 6; limiter.ratio.value = 4;
  limiter.attack.value = .005; limiter.release.value = .16;
  effects.connect(limiter); musicGain.connect(musicDuck); musicDuck.connect(limiter);
  limiter.connect(master); master.connect(context.destination);
  const musicSource = own(context.createMediaElementSource(music)); musicSource.connect(musicGain);
  const noise = noiseBuffer(context);

  const filter = (type, frequency, q = .7) => {
    const node = own(context.createBiquadFilter());
    node.type = type; node.frequency.value = frequency; node.Q.value = q;
    return node;
  };
  const oscillator = (type, output, level) => {
    const source = own(context.createOscillator()), volume = gain(level);
    source.type = type; source.connect(volume); volume.connect(output); source.start(); sources.push(source);
    return { source, volume };
  };
  const noiseLayer = (type, frequency, level = 0) => {
    const source = own(context.createBufferSource()), band = filter(type, frequency), volume = gain(level);
    source.buffer = noise; source.loop = true; source.connect(band); band.connect(volume); volume.connect(effects);
    source.start(0, sources.length * .113); sources.push(source);
    return { source, filter: band, volume };
  };
  const exhaustFilter = filter('lowpass', 1000, .58), engineVolume = gain(0);
  engineVolume.connect(exhaustFilter); exhaustFilter.connect(effects);
  const firing = oscillator('sawtooth', engineVolume, .68);
  const undertone = oscillator('triangle', engineVolume, .32);
  const intakeFilter = filter('bandpass', 1500, .45), intakeVolume = gain(0);
  intakeFilter.connect(intakeVolume); intakeVolume.connect(effects);
  const intake = oscillator('sawtooth', intakeFilter, .32);
  const tyre = noiseLayer('bandpass', 1700), wind = noiseLayer('lowpass', 700), road = noiseLayer('lowpass', 120);
  const squeal = oscillator('sine', tyre.filter, .12);
  const turbo = oscillator('sine', effects, 0);
  const waves = [false, true].map(flat => {
    const real = new Float32Array(17), imaginary = new Float32Array(17);
    for (let harmonic = 1; harmonic < imaginary.length; harmonic++) {
      imaginary[harmonic] = (flat && harmonic % 2 === 0 ? .16 : 1) / harmonic ** 1.12;
    }
    return context.createPeriodicWave(real, imaginary, { disableNormalization: false });
  });
  let mix = { ...AUDIO_DEFAULTS }, unlocked = false, disposed = false, driving = false;
  let playPending = false, musicBlocked = false, musicStatus = 'idle', error = null;
  let previous = null, previousCar = null, shiftUntil = 0, duckUntil = 0, nextImpact = 0;
  let previousThrottle = 0, nextBlowoff = 0;

  const shouldPlayMusic = () => !disposed && unlocked && mix.enabled && driving && mix.musicVolume > .001 && !document?.hidden;
  const playMusic = (warm = false) => {
    if (disposed || playPending || musicBlocked || (!warm && !shouldPlayMusic())) return;
    if (!music.src) music.src = musicURL;
    if (!music.paused) return;
    playPending = true; musicStatus = 'loading';
    let promise;
    try { promise = music.play(); } catch (cause) { promise = Promise.reject(cause); }
    Promise.resolve(promise).then(() => {
      playPending = false;
      if (disposed || !shouldPlayMusic()) { music.pause(); musicStatus = 'paused'; }
      else musicStatus = 'playing';
    }).catch(cause => {
      playPending = false;
      if (cause?.name === 'AbortError' || disposed) return;
      error = cause; musicBlocked = true; musicStatus = cause?.name === 'NotAllowedError' ? 'blocked' : 'error';
    });
  };
  const onMusicError = () => { error = music.error; musicBlocked = true; musicStatus = 'error'; };
  music.addEventListener?.('error', onMusicError);

  const transient = (kind, strength = 1) => {
    if (voices.size >= 8 || disposed) return;
    const at = context.currentTime, hit = context.createGain(), band = context.createBiquadFilter();
    const source = context.createBufferSource(), body = context.createOscillator(), bodyGain = context.createGain();
    const length = kind === 'impact' ? .36 : kind === 'blowoff' ? .21 : .075;
    band.type = kind === 'impact' ? 'lowpass' : kind === 'blowoff' ? 'bandpass' : 'highpass';
    band.frequency.value = kind === 'impact' ? 1550 : kind === 'blowoff' ? 3400 : 500;
    band.Q.value = .6; source.buffer = noise; source.connect(band); band.connect(hit); hit.connect(effects);
    hit.gain.setValueAtTime(kind === 'impact' ? .42 * strength : kind === 'blowoff' ? .075 : .11, at);
    hit.gain.exponentialRampToValueAtTime(.0001, at + length);
    body.type = 'sine'; body.frequency.setValueAtTime(kind === 'impact' ? 91 : 132, at);
    body.frequency.exponentialRampToValueAtTime(kind === 'impact' ? 35 : 57, at + length);
    bodyGain.gain.setValueAtTime(kind === 'blowoff' ? 0 : kind === 'impact' ? .31 * strength : .07, at);
    bodyGain.gain.linearRampToValueAtTime(0, at + length); body.connect(bodyGain); bodyGain.connect(effects);
    const voice = { source, body, nodes: [source, body, hit, band, bodyGain] }; voices.add(voice);
    source.onended = () => { voices.delete(voice); for (const node of voice.nodes) node.disconnect(); };
    source.start(at, .5); body.start(at); source.stop(at + length); body.stop(at + length);
  };

  const silence = (immediate = false) => {
    const time = context.currentTime;
    if (immediate) {
      for (const node of [effects, musicGain]) {
        node.gain.cancelScheduledValues(time); node.gain.setValueAtTime(0, time); lastTargets.set(node.gain, 0);
      }
    } else { target(effects.gain, 0, time, .025); target(musicGain.gain, 0, time, .035); }
    if (!music.paused) music.pause();
    if (musicStatus === 'playing') musicStatus = 'paused';
  };

  return {
    context,
    get musicStatus() { return musicStatus; },
    get error() { return error; },
    get mix() { return { ...mix }; },
    unlock() {
      if (disposed) return Promise.resolve(false);
      // Both calls occur synchronously inside the click/touch gesture; do not
      // await resume before asking the media element to play on iOS.
      unlocked = true; musicBlocked = false; error = null;
      const resumed = context.resume();
      if (mix.enabled && mix.musicVolume > .001) playMusic(true);
      return Promise.resolve(resumed).then(() => !disposed && context.state === 'running').catch(cause => { error = cause; return false; });
    },
    setMix(next = {}) {
      if (disposed) return;
      mix = {
        enabled: next.enabled === undefined ? mix.enabled : Boolean(next.enabled),
        musicVolume: next.musicVolume === undefined ? mix.musicVolume : unit(next.musicVolume, mix.musicVolume),
        effectsVolume: next.effectsVolume === undefined ? mix.effectsVolume : unit(next.effectsVolume, mix.effectsVolume),
      };
      if (!mix.enabled) silence();
      else if (driving && unlocked && !document?.hidden) {
        target(effects.gain, mix.effectsVolume * .8, context.currentTime);
        target(musicGain.gain, mix.musicVolume * .8, context.currentTime, .16);
        if (mix.musicVolume > .001) playMusic(); else music.pause();
      }
    },
    update({ state = {}, vehicle = {}, driving: isDriving = false } = {}) {
      if (disposed) return;
      driving = Boolean(isDriving) && !document?.hidden;
      const at = context.currentTime, audible = driving && mix.enabled && unlocked;
      const frame = racingAudioFrame(state, vehicle), carKey = vehicle.id || vehicle.name || '';
      if (previousCar !== carKey) {
        previous = null; previousCar = carKey;
        firing.source.setPeriodicWave(waves[Number(frame.profile.flat)]);
        target(undertone.volume.gain, frame.profile.low * .35, at);
      }
      if (!audible) {
        silence(); previous = frame; previousThrottle = frame.throttle; return;
      }
      if (previous && frame.gear !== previous.gear && mix.effectsVolume > .001) {
        shiftUntil = at + .08; transient('shift', .8);
      }
      if (frame.collision > .1 && (!previous || frame.collision > previous.collision + .045) && at >= nextImpact && mix.effectsVolume > .001) {
        transient('impact', .4 + frame.collision * .6); nextImpact = at + .18; duckUntil = at + .34;
      }
      if (frame.profile.turbo && previousThrottle - frame.throttle > .12 && previousThrottle > .45 && frame.rpm > 3300 && at > nextBlowoff) {
        transient('blowoff'); nextBlowoff = at + .45;
      }
      target(effects.gain, mix.effectsVolume * .8, at);
      target(musicGain.gain, mix.musicVolume * .8, at, .16);
      target(musicDuck.gain, at < duckUntil ? .64 : 1, at, at < duckUntil ? .025 : .25);
      target(firing.source.frequency, frame.firingHz, at, .035);
      target(undertone.source.frequency, frame.crankHz, at, .05);
      target(engineVolume.gain, frame.engineGain * (at < shiftUntil ? .37 : 1), at, .045);
      target(exhaustFilter.frequency, frame.exhaustHz, at, .075);
      target(intake.source.frequency, frame.firingHz * 2.015, at, .035);
      target(intakeFilter.frequency, 1200 + frame.rpm * .35, at, .09);
      target(intakeVolume.gain, frame.intakeGain, at, .07);
      target(tyre.volume.gain, frame.tyreGain, at, .055);
      target(tyre.filter.frequency, frame.tyreHz, at, .08);
      target(squeal.source.frequency, frame.tyreHz * (.95 + Math.sin(at * 13) * .025), at, .03);
      target(squeal.volume.gain, frame.tyreGain * .15, at, .05);
      target(wind.volume.gain, frame.windGain, at, .12);
      target(wind.filter.frequency, 470 + frame.speed * 14, at, .12);
      target(road.volume.gain, frame.roadGain, at, .09);
      target(road.filter.frequency, frame.roadHz, at, .1);
      target(turbo.source.frequency, 1300 + frame.rpm * .65, at, .09);
      target(turbo.volume.gain, frame.turboGain, at, .07);
      if (mix.musicVolume > .001) playMusic(); else music.pause();
      previous = frame; previousThrottle = frame.throttle;
    },
    suspend() {
      if (disposed) return Promise.resolve();
      driving = false; silence(true);
      return Promise.resolve(context.suspend()).catch(() => {});
    },
    dispose() {
      if (disposed) return;
      disposed = true; silence(true); music.removeEventListener?.('error', onMusicError);
      music.removeAttribute?.('src'); music.load?.();
      if (!options.musicElement) music.remove();
      for (const voice of voices) { voice.source.onended = null; try { voice.source.stop(); voice.body.stop(); } catch {} for (const node of voice.nodes) node.disconnect(); }
      voices.clear();
      for (const source of sources) { try { source.stop(); } catch {} }
      for (const node of nodes) node.disconnect();
      if (!options.context) context.close().catch(() => {});
    },
  };
}
