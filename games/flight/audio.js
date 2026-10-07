// Original procedural aircraft sound: no recordings, downloads, or third-party audio assets.
// Live audio is created only by setEnabled(true), called from the user's sound-button gesture.
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const number = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const finite = (n, fallback = 0) => number(Number(n), fallback);

export function flightAudioFrame(state = {}, data = {}, options = {}) {
  const profile = typeof options.aircraft === 'object' ? options.aircraft : null;
  const requested = profile?.id || options.aircraft || state.aircraft;
  const id = requested === 'hornet' ? 'hornet' : requested === 'fighter' ? 'fighter' : requested === 'light' ? 'light' : 'jet';
  const fighter = id === 'fighter' || id === 'hornet', afterburner = fighter && !state.crashed && state.fuel !== 0 ? clamp(finite(state.afterburnerLevel), 0, 1) : 0;
  const light = id === 'light', cockpit = (options.view ?? 0) === 0;
  const running = state.fuel !== 0 && !state.crashed;
  const power = running ? clamp(finite(state.engine), 0, 1) : 0;
  const n1 = running ? clamp(finite(data.engineN1, 20 + power * 80) / 100, 0, 1) : 0;
  const rpm = running ? clamp(finite(data.engineRpm, 700 + power * 2000), 0, 3000) : 0;
  const speed = Math.max(0, finite(data.indicatedAirspeed, finite(data.airspeed)));
  const groundSpeed = state.onGround ? Math.max(0, finite(data.groundSpeed)) : 0;
  const turbulent = options.weather === 'crosswind' ? 1.12 : options.weather === 'overcast' ? 1.06 : 1;
  const warningProfile = profile?.ui?.warnings;
  let warning = '';
  if (!state.onGround && !state.crashed && options.warnings !== false) {
    if (data.stallWarning) warning = 'stall';
    else if (data.overspeedWarning) warning = 'overspeed';
    else if (finite(data.agl, Infinity) < (warningProfile?.bankAgl ?? (light ? 80 : 100)) && Math.abs(finite(data.roll)) > (warningProfile?.bankDeg ?? (light ? 45 : 35))) warning = 'bank';
  }
  return {
    id, light, cockpit, ...(fighter ? { fighter, afterburner, twin: id === 'hornet' } : {}), view: options.view ?? 0, power, n1, rpm, running,
    audible: Boolean(options.active && !options.paused && !state.crashed),
    engineLevel: cockpit ? (light ? 0.42 : fighter ? .42 : 0.30) : options.view === 2 ? 0.88 : 0.72,
    cabinCutoff: cockpit ? (light ? 1100 : fighter ? 1100 : 760) : 6800,
    fanHz: (id === 'hornet' ? 125 : fighter ? 150 : 92) + 490 * Math.pow(n1, 1.35), coreHz: 34 + 71 * n1,
    firingHz: rpm / 30, propHz: rpm / 30,
    windGain: Math.min(0.11, Math.pow(speed / (light ? 65 : 155), 2.25) * (cockpit ? (light ? 0.045 : 0.020) : 0.09)) * turbulent,
    windHz: 650 + Math.min(1800, speed * (light ? 18 : 9)),
    wheelGain: Math.min(0.095, Math.pow(groundSpeed / (light ? 35 : 80), 1.25) * 0.075) * (cockpit ? 0.8 : 1),
    wheelHz: 90 + Math.min(500, groundSpeed * 4), wheelBeat: Math.min(18, groundSpeed / 5),
    ventilation: cockpit ? (light ? 0.0025 : 0.010) : 0,
    warning, warningVolume: clamp(finite(options.warningVolume, 0.65), 0, 1),
    fixedGear: profile?.fixedGear ?? light,
  };
}

export function createAudioEventTracker() {
  let previous = null, previousState = null, touchdownKey = null, nextWarning = 0;
  return {
    update(state, frame, time) {
      const snapshot = { elapsed: finite(state.elapsed), gear: finite(state.gearPosition, Number(state.gear)), flaps: finite(state.flapPosition, state.flaps) };
      const reset = !previous || state !== previousState || snapshot.elapsed < previous.elapsed;
      if (reset) { previous = snapshot; previousState = state; touchdownKey = state.touchdown; nextWarning = time + 0.8; }
      const events = [];
      const gearMoving = !frame.fixedGear && Math.abs(snapshot.gear - previous.gear) > 0.0001;
      const flapsMoving = Math.abs(snapshot.flaps - previous.flaps) > 0.0001;
      if (frame.audible) {
        if (!reset && !frame.fixedGear && previous.gear > 0.001 && previous.gear < 0.999 && (snapshot.gear <= 0.001 || snapshot.gear >= 0.999)) events.push({ type: 'gear-lock' });
        if (!reset && state.touchdown && state.touchdown !== touchdownKey) events.push({ type: 'touchdown', sinkRate: finite(state.touchdown.sinkRate), speed: finite(state.touchdown.speed) });
        if (frame.warning && time >= nextWarning) {
          events.push({ type: frame.warning, volume: frame.warningVolume });
          nextWarning = time + (frame.warning === 'stall' ? 3.2 : frame.warning === 'overspeed' ? 5.5 : 8);
        }
      } else nextWarning = time + 0.8;
      touchdownKey = state.touchdown;
      previous = snapshot; previousState = state;
      return { gearMoving, flapsMoving, events };
    },
  };
}

function noiseBuffer(context, seed, shade = 'pink') {
  const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * 3.13), context.sampleRate);
  const samples = buffer.getChannelData(0);
  let a = 0, b = 0, c = 0, mean = 0, peak = 0;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  for (let i = 0; i < samples.length; i++) {
    const white = random();
    a += (white - a) * 0.025; b += (white - b) * 0.12; c += (white - c) * 0.48;
    const value = shade === 'white' ? white * 0.36 : shade === 'brown' ? a * 2.4 : a * 1.2 + b * 0.58 + c * 0.18 + white * 0.09;
    samples[i] = value; mean += value;
  }
  mean /= samples.length;
  for (let i = 0; i < samples.length; i++) { samples[i] -= mean; peak = Math.max(peak, Math.abs(samples[i])); }
  const scale = Math.min(1.5, 0.8 / Math.max(0.001, peak)), fade = Math.ceil(context.sampleRate * 0.025);
  for (let i = 0; i < samples.length; i++) samples[i] *= scale * Math.min(1, i / fade, (samples.length - 1 - i) / fade);
  return buffer;
}

function buildSoundGraph(context) {
  const nodes = [], sources = new Set();
  const own = node => { nodes.push(node); return node; };
  const gain = (value = 0) => { const node = own(context.createGain()); node.gain.value = value; return node; };
  const filter = (type, frequency, Q = 0.7) => { const node = own(context.createBiquadFilter()); node.type = type; node.frequency.value = frequency; node.Q.value = Q; return node; };
  const pan = value => {
    if (!context.createStereoPanner) return gain(1);
    const node = own(context.createStereoPanner()); node.pan.value = value; return node;
  };
  const smooth = (param, value, time, tau = 0.10) => param.setTargetAtTime(value, time, tau);
  const noise = { pink: noiseBuffer(context, 0x5e91c41), brown: noiseBuffer(context, 0xa27e920, 'brown'), white: noiseBuffer(context, 0x1834211, 'white') };
  const wave = harmonics => context.createPeriodicWave(new Float32Array(harmonics.length), Float32Array.from(harmonics));
  const fanWave = wave([0, 1, 0.19, 0.075, 0.018, 0.012]);
  const coreWave = wave([0, 1, 0.25, 0.11, 0.035]);
  const pistonWave = wave([0, 0.78, 0.55, 0.36, 0.23, 0.14, 0.085, 0.06, 0.03]);
  const propWave = wave([0, 1, 0.31, 0.09, 0.055]);
  const mix = gain(1), highPass = filter('highpass', 28);
  const compressor = own(context.createDynamicsCompressor());
  compressor.threshold.value = -18; compressor.knee.value = 10; compressor.ratio.value = 3.5;
  compressor.attack.value = 0.012; compressor.release.value = 0.24;
  const trim = gain(0.74), master = gain(0), limiter = own(context.createWaveShaper());
  limiter.curve = Float32Array.from({ length: 4097 }, (_, i) => 0.78 * Math.tanh((i / 2048 - 1) / 0.78));
  limiter.oversample = '2x';
  mix.connect(highPass); highPass.connect(compressor); compressor.connect(trim); trim.connect(master); master.connect(limiter); limiter.connect(context.destination);

  function oscillator(harmonics, frequency, destination, start = 0) {
    const source = context.createOscillator(); source.frequency.value = frequency;
    if (harmonics) source.setPeriodicWave(harmonics); else source.type = 'sine';
    source.connect(destination); source.start(start); sources.add(source); return source;
  }
  function loopNoise(buffer, destination, offset = 0) {
    const source = context.createBufferSource(); source.buffer = buffer; source.loop = true;
    source.connect(destination); source.start(0, offset); sources.add(source); return source;
  }
  function toneVoice(harmonics, hz, destination) {
    const level = gain(), source = oscillator(harmonics, hz, level); level.connect(destination);
    return { source, level };
  }
  function noiseVoice(buffer, destination, low = 1600, high = 45, offset = 0) {
    const hp = filter('highpass', high), lp = filter('lowpass', low), level = gain();
    loopNoise(buffer, hp, offset); hp.connect(lp); lp.connect(level); level.connect(destination);
    return { level, lp, hp };
  }
  const jetBus = gain(), jetCabin = filter('lowpass', 760, 0.52); jetBus.connect(jetCabin); jetCabin.connect(mix);
  const jet = [-0.5, 0.5].map((side, index) => {
    const stereo = pan(side); stereo.connect(jetBus);
    return {
      stereo, fan: toneVoice(fanWave, 140, stereo), core: toneVoice(coreWave, 50, stereo), blade: toneVoice(null, 980, stereo),
      roar: noiseVoice(noise.pink, stereo, 2200, 60, index * 0.73),
    };
  });
  const lightBus = gain(), lightCabin = filter('lowpass', 1100, 0.55); lightBus.connect(lightCabin); lightCabin.connect(mix);
  const piston = toneVoice(pistonWave, 36, lightBus), prop = toneVoice(propWave, 36.12, lightBus);
  const exhaust = noiseVoice(noise.brown, lightBus, 1100, 38), propWash = noiseVoice(noise.pink, lightBus, 3100, 320, 1.51);
  // A small blade-beat modulation gives the propeller broadband wash a rhythmic texture.
  const propMod = gain(0), propModOsc = oscillator(null, 40, propMod); propMod.connect(propWash.level.gain);
  const wind = [-0.35, 0.35].map((side, index) => {
    const stereo = pan(side); stereo.connect(mix); return noiseVoice(noise.white, stereo, 3400, 350, index * 0.89);
  });
  const wheels = noiseVoice(noise.brown, mix, 400, 35), wheelTone = toneVoice(coreWave, 68, mix);
  const wheelsMod = gain(), wheelsModOsc = oscillator(null, 5, wheelsMod); wheelsMod.connect(wheels.level.gain);
  const vent = noiseVoice(noise.pink, mix, 1000, 220, 2.03);
  const gearMotor = toneVoice(propWave, 114, mix), flapMotor = toneVoice(propWave, 157, mix);
  const gearHydraulics = noiseVoice(noise.pink, mix, 1000, 220, 1.12);

  function once(type, frequency, amplitude, duration, time, shade) {
    const envelope = context.createGain(); envelope.gain.setValueAtTime(0, time);
    envelope.gain.linearRampToValueAtTime(amplitude, time + Math.min(0.012, duration / 5));
    envelope.gain.exponentialRampToValueAtTime(0.00001, time + duration); envelope.connect(mix);
    let source, band;
    if (shade) {
      source = context.createBufferSource(); source.buffer = noise[shade]; band = context.createBiquadFilter(); band.type = type; band.frequency.value = frequency; band.Q.value = 0.65;
      source.connect(band); band.connect(envelope);
    } else {
      source = context.createOscillator(); source.type = type; source.frequency.setValueAtTime(frequency, time);
      if (type === 'sine' && frequency < 180) source.frequency.exponentialRampToValueAtTime(frequency * 0.65, time + duration);
      source.connect(envelope);
    }
    sources.add(source);
    source.onended = () => { sources.delete(source); source.disconnect(); band?.disconnect(); envelope.disconnect(); };
    source.start(time); source.stop(time + duration + 0.015);
  }
  function event(event, time, frame) {
    if (event.type === 'touchdown') {
      const severity = clamp(0.6 + finite(event.sinkRate) * 0.15, 0.6, 1.6);
      once('sine', frame.light ? 91 : 57, 0.11 * severity, 0.26, time);
      once('lowpass', 360, 0.105 * severity, 0.15, time, 'brown');
      if (finite(event.speed) > 12) once('bandpass', frame.light ? 1900 : 1450, 0.065, 0.13, time + 0.025, 'white');
    } else if (event.type === 'gear-lock') {
      once('sine', 123, 0.032, 0.13, time); once('bandpass', 1800, 0.037, 0.075, time, 'white');
    } else {
      const level = 0.035 * finite(event.volume, 0.65) * (frame.cockpit ? 1 : 0.5);
      const tones = event.type === 'stall' ? [1060, 840] : event.type === 'overspeed' ? [1260, 1260] : [690];
      tones.forEach((hz, index) => once('sine', hz, level, 0.14, time + index * 0.22));
    }
  }
  function configure(frame, motion = {}, time = context.currentTime) {
    smooth(jetBus.gain, !frame.light && frame.running ? frame.engineLevel : 0, time, 0.16);
    smooth(lightBus.gain, frame.id === 'light' && frame.running ? frame.engineLevel : 0, time, 0.16);
    smooth(jetCabin.frequency, frame.cabinCutoff, time, 0.18); smooth(lightCabin.frequency, frame.cabinCutoff, time, 0.18);
    for (let index = 0; index < jet.length; index++) {
      const voice = jet[index], detune = index ? 1.0041 : 0.9985;
      const proximity = frame.fighter ? (frame.twin ? 1 : index ? 0 : 1.65) : frame.view === 2 ? index ? 1.24 : 0.69 : 1;
      if (voice.stereo.pan) smooth(voice.stereo.pan, frame.fighter && !frame.twin ? 0 : (index ? 1 : -1) * (frame.cockpit ? 0.19 : 0.48), time);
      smooth(voice.fan.source.frequency, frame.fanHz * detune, time, 0.14);
      smooth(voice.core.source.frequency, frame.coreHz * detune, time, 0.14);
      smooth(voice.blade.source.frequency, (720 + 1970 * frame.n1) * detune, time, 0.14);
      smooth(voice.fan.level.gain, (0.027 + frame.power * 0.040) * proximity, time);
      smooth(voice.core.level.gain, (0.041 + frame.power * 0.049) * proximity, time);
      smooth(voice.blade.level.gain, Math.pow(frame.n1, 2) * 0.014 * proximity, time);
      smooth(voice.roar.level.gain, (0.09 + Math.pow(frame.power, 1.4) * (frame.fighter ? .42 : .27) + (frame.afterburner || 0) * .28) * proximity, time);
      smooth(voice.roar.lp.frequency, 1200 + frame.power * 4200 + (frame.afterburner || 0) * 1800, time);
    }
    smooth(piston.source.frequency, Math.max(1, frame.firingHz), time, 0.06);
    smooth(prop.source.frequency, Math.max(1, frame.propHz * 1.003), time, 0.06);
    smooth(propModOsc.frequency, Math.max(1, frame.propHz), time, 0.06);
    smooth(piston.level.gain, 0.12 + frame.power * 0.11, time, 0.07);
    smooth(prop.level.gain, 0.062 + Math.pow(frame.power, 0.8) * 0.065, time, 0.07);
    smooth(exhaust.level.gain, 0.12 + frame.power * 0.13, time);
    smooth(propWash.level.gain, 0.018 + frame.power * 0.11, time);
    smooth(propMod.gain, frame.id === 'light' && frame.running ? 0.010 + frame.power * 0.024 : 0, time);
    for (const voice of wind) { smooth(voice.level.gain, frame.windGain, time); smooth(voice.hp.frequency, frame.windHz * 0.5, time); }
    smooth(wheels.level.gain, frame.wheelGain, time, 0.08); smooth(wheels.lp.frequency, frame.wheelHz, time);
    smooth(wheelTone.level.gain, frame.wheelGain * 0.22, time); smooth(wheelTone.source.frequency, 42 + frame.wheelBeat * 3, time);
    smooth(wheelsMod.gain, frame.wheelGain * 0.24, time); smooth(wheelsModOsc.frequency, Math.max(0.2, frame.wheelBeat), time);
    smooth(vent.level.gain, frame.ventilation, time);
    const servoLevel = frame.cockpit ? 1 : 0.5;
    smooth(gearMotor.level.gain, motion.gearMoving ? 0.018 * servoLevel : 0, time, 0.07);
    smooth(gearHydraulics.level.gain, motion.gearMoving ? 0.029 * servoLevel : 0, time, 0.09);
    smooth(flapMotor.level.gain, motion.flapsMoving ? (frame.light ? 0.014 : 0.018) * servoLevel : 0, time, 0.07);
  }
  function gate(audible, time = context.currentTime) {
    master.gain.cancelScheduledValues(time);
    master.gain.setTargetAtTime(audible ? 1 : 0, time, audible ? 0.06 : 0.012);
  }
  return { configure, event, gate, dispose() {
    for (const source of sources) { try { source.stop(); source.disconnect(); } catch {} }
    sources.clear(); for (const node of nodes) { try { node.disconnect(); } catch {} }
  } };
}

export function createFlightAudio() {
  let context = null, graph = null, enabled = false, disposed = false, operation = 0;
  let latest = null, lastAutomation = -Infinity;
  const tracker = createAudioEventTracker();
  function update(state, data, options = {}) {
    if (disposed) return;
    latest = { state, data, options };
    if (!context || !graph) return;
    const frame = flightAudioFrame(state, data, options), now = context.currentTime;
    const motion = tracker.update(state, { ...frame, audible: enabled && frame.audible }, now);
    graph.gate(enabled && frame.audible);
    if (now - lastAutomation >= 0.025 || !frame.audible) {
      graph.configure(frame, motion); lastAutomation = now;
    }
    if (enabled && frame.audible) for (const event of motion.events) graph.event(event, now, frame);
  }
  return {
    async setEnabled(value) {
      const token = ++operation;
      if (disposed) return false;
      if (!value) {
        enabled = false; graph?.gate(false);
        if (context && context.state !== 'closed') {
          await new Promise(resolve => setTimeout(resolve, 90));
          if (token === operation && !enabled && !disposed) await context.suspend();
        }
        return enabled;
      }
      if (!context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) throw new Error('Web Audio is unavailable in this browser.');
        context = new AudioContext({ latencyHint: 'interactive' });
        graph = buildSoundGraph(context);
      }
      await context.resume();
      if (token !== operation || disposed) return enabled;
      enabled = true;
      if (latest) update(latest.state, latest.data, latest.options);
      return true;
    },
    update,
    get enabled() { return enabled; },
    dispose() {
      if (disposed) return;
      disposed = true; enabled = false; operation++; graph?.dispose();
      if (context?.state !== 'closed') context?.close().catch(() => {});
      graph = null; context = null; latest = null;
    },
  };
}

// Silent developer helper: OfflineAudioContext never sends rendered samples to the audio device.
export async function renderFlightAudioPreview(OfflineAudioContext, options = {}) {
  const seconds = clamp(finite(options.seconds, 3), 1, 12), sampleRate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const graph = buildSoundGraph(context), power = clamp(finite(options.power, 0.7), 0, 1);
  const light = options.aircraft === 'light';
  const state = { aircraft: options.aircraft === 'hornet' ? 'hornet' : options.aircraft === 'fighter' ? 'fighter' : light ? 'light' : 'jet', afterburnerLevel: clamp(finite(options.afterburner), 0, 1), engine: power, fuel: 100, onGround: options.onGround || false };
  const data = { indicatedAirspeed: finite(options.airspeed, light ? 48 : 115), groundSpeed: finite(options.groundSpeed), engineN1: 20 + power * 80, engineRpm: 700 + power * 2000 };
  const frame = flightAudioFrame(state, data, { ...options, active: true });
  graph.configure(frame, { gearMoving: options.gearMoving, flapsMoving: options.flapsMoving }, 0);
  graph.gate(frame.audible, 0);
  if (Number.isFinite(options.pauseAt)) graph.gate(false, options.pauseAt);
  for (const event of options.events || []) graph.event(event, event.at || 0.5, frame);
  const buffer = await context.startRendering(); graph.dispose();
  return buffer;
}
