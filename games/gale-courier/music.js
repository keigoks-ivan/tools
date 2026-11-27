// Each track has two eight-bar themes and returns to the first theme with a
// fuller arrangement. Chords and melodies use MIDI pitches.
const COURIER_TRACKS = {
  dusk: {
    bpm: 148, lead: "pulse", brightness: 2900, kicks: [0, 6, 8, 14],
    chords: [
      [50, 57, 65, 69], [46, 53, 62, 65], [53, 60, 69, 72], [48, 55, 64, 67],
      [50, 57, 65, 69], [46, 53, 62, 65], [55, 62, 70, 74], [45, 52, 61, 67],
      [55, 62, 70, 74], [46, 53, 62, 65], [50, 57, 65, 69], [45, 52, 61, 67],
      [46, 53, 62, 65], [48, 55, 64, 67], [53, 60, 69, 72], [45, 52, 61, 67],
    ],
    melody: [
      [74, 74, 77, 81, 79, -1, 77, 72], [74, 77, -1, 74, 70, 72, 74, -1],
      [72, 77, 76, 72, 69, 72, 77, 81], [79, 76, 72, -1, 76, 79, 84, -1],
      [81, 81, 84, 86, 84, 81, 79, 77], [74, -1, 77, 74, 70, 72, 74, 77],
      [79, 79, 82, 86, 85, 82, 79, 77], [76, 73, 76, 79, 81, -1, 76, 73],
      [82, 79, -1, 82, 86, 82, 79, 77], [77, 74, -1, 77, 82, 81, 77, 74],
      [81, 77, 81, 86, 84, -1, 81, 77], [79, 76, -1, 79, 85, 81, 79, 76],
      [77, 79, 82, 86, 84, 82, 79, 77], [76, 79, 84, 88, 86, 84, 79, 76],
      [77, 81, 84, -1, 81, 77, 76, 72], [76, -1, 79, 81, 85, 79, 76, 73],
    ],
  },
  morning: {
    bpm: 156, lead: "triangle", brightness: 4800, kicks: [0, 5, 8, 11],
    chords: [
      [55, 62, 67, 71], [52, 59, 67, 71], [48, 55, 64, 67], [50, 57, 66, 69],
      [55, 62, 67, 71], [54, 57, 66, 69], [52, 59, 67, 71], [50, 57, 66, 72],
      [57, 64, 69, 72], [48, 55, 64, 67], [55, 62, 67, 71], [50, 57, 66, 69],
      [52, 59, 67, 71], [48, 55, 64, 67], [57, 64, 69, 72], [50, 57, 66, 72],
    ],
    melody: [
      [79, 83, 81, 79, 74, -1, 76, 78], [79, 76, 71, 76, 79, 83, 81, -1],
      [76, 79, 84, 83, 79, 76, 74, 72], [74, 78, 81, -1, 86, 84, 81, 78],
      [79, 83, 86, 83, 81, 79, 74, 79], [78, 81, -1, 78, 74, 76, 78, 81],
      [83, 86, 88, 86, 83, 79, 76, 79], [81, -1, 78, 74, 72, 74, 78, 81],
      [84, 81, 84, 88, 86, -1, 84, 81], [79, 76, -1, 79, 84, 83, 79, 76],
      [79, 83, 86, -1, 88, 86, 83, 79], [81, 78, 81, 86, 84, 81, 78, 74],
      [76, 79, 83, 88, 86, 83, 81, 79], [76, 79, 84, -1, 86, 84, 79, 76],
      [81, 84, 88, 86, 84, 81, 79, 76], [78, 81, 84, 86, 84, 81, 78, 74],
    ],
  },
  copper: {
    bpm: 168, lead: "sawtooth", brightness: 2050, kicks: [0, 3, 7, 8, 10, 14],
    chords: [
      [45, 52, 60, 64], [45, 52, 59, 64], [41, 48, 57, 60], [43, 50, 59, 62],
      [45, 52, 60, 64], [48, 55, 64, 67], [41, 48, 57, 60], [40, 47, 56, 62],
      [41, 48, 57, 60], [43, 50, 59, 62], [45, 52, 60, 64], [40, 47, 56, 62],
      [41, 48, 57, 60], [48, 55, 64, 67], [43, 50, 59, 62], [40, 47, 56, 62],
    ],
    melody: [
      [69, 72, 76, 72, 69, -1, 74, 76], [71, 76, 79, 76, 74, 71, 72, -1],
      [77, 77, 76, 72, 69, 72, 77, 76], [74, 79, 83, 79, 74, 71, 74, -1],
      [81, 76, 81, 84, 82, 81, 79, 76], [84, 79, 84, 88, 86, 84, 79, 76],
      [77, -1, 81, 84, 81, 77, 76, 72], [76, 80, 83, 86, 83, 80, 76, 68],
      [81, 77, 81, 84, 86, -1, 84, 81], [83, 79, 83, 86, 88, 86, 83, 79],
      [84, 81, 84, 88, 86, 84, 81, 76], [80, 83, 86, -1, 88, 86, 83, 80],
      [81, 84, 89, 88, 84, 81, 77, 81], [79, 84, 88, 91, 88, 84, 81, 79],
      [83, 86, 91, -1, 86, 83, 79, 74], [80, 83, 86, 88, 86, 83, 80, 76],
    ],
  },
  night: {
    bpm: 152, lead: "pulse", brightness: 2350, kicks: [0, 6, 8, 12],
    chords: [
      [47, 54, 62, 66], [43, 50, 59, 62], [50, 57, 66, 69], [45, 52, 61, 64],
      [47, 54, 62, 66], [43, 50, 59, 62], [52, 59, 67, 71], [42, 49, 58, 64],
      [43, 50, 59, 62], [45, 52, 61, 64], [47, 54, 62, 66], [54, 61, 69, 73],
      [52, 59, 67, 71], [43, 50, 59, 62], [45, 52, 61, 64], [42, 49, 58, 64],
    ],
    melody: [
      [78, -1, 81, 78, 74, 78, 73, 74], [79, 74, 71, 74, 79, -1, 78, 74],
      [81, 78, 81, 86, 85, 81, 78, 74], [76, 73, 76, 81, 79, -1, 76, 73],
      [78, 83, 86, 85, 81, 78, 74, 78], [79, 83, 86, -1, 83, 79, 78, 74],
      [76, 79, 83, 88, 86, 83, 79, 76], [78, 82, 85, 88, 85, 82, 78, 73],
      [83, 79, 83, 86, 88, 86, 83, 79], [81, 76, 81, 85, 88, 85, 81, 76],
      [78, 83, 86, 90, 88, 86, 83, 78], [81, 85, 90, 88, 85, -1, 81, 78],
      [79, 83, 88, 91, 88, 86, 83, 79], [79, 83, 86, 91, 90, 86, 83, 79],
      [81, 85, 88, 93, 90, 88, 85, 81], [82, 85, 88, 90, 88, 85, 82, 78],
    ],
  },
};

const noteHz = pitch => 440 * 2 ** ((pitch - 69) / 12);
const bassPattern = [0, 0, 1, 0, 0, 2, 1, 0];
const arpeggioPattern = [0, 2, 1, 3, 0, 1, 2, 3];
const barLength = 16;
const phraseBars = 24;

class CourierScore {
  constructor(audio) {
    this.audio = audio;
    this.theme = null;
    this.step = 0;
    this.bus = null;
  }

  play(theme) {
    if (this.bus && this.theme === theme) return;
    this.stop();
    if (theme !== this.theme) this.step = 0;
    this.theme = theme;
    this.bus = this.audio.createGain();
    this.bus.gain.value = .54;
    this.compressor = this.audio.createDynamicsCompressor();
    this.compressor.threshold.value = -19;
    this.compressor.knee.value = 12;
    this.compressor.ratio.value = 2.4;
    this.compressor.attack.value = .004;
    this.compressor.release.value = .11;
    this.bus.connect(this.compressor);
    this.compressor.connect(this.audio.destination);
    this.next = this.audio.currentTime + .07;
  }

  stop() {
    if (!this.bus) return;
    const bus = this.bus;
    const compressor = this.compressor;
    this.bus = null;
    this.compressor = null;
    bus.gain.setTargetAtTime(.0001, this.audio.currentTime, .032);
    setTimeout(() => {
      bus.disconnect();
      compressor.disconnect();
    }, 220);
  }

  pulseWave() {
    if (!this.pulse) {
      const real = new Float32Array(13);
      const imaginary = new Float32Array(real.length);
      for (let harmonic = 1; harmonic < real.length; harmonic += 1) {
        const angle = 2 * Math.PI * harmonic * .27;
        real[harmonic] = Math.sin(angle) / harmonic;
        imaginary[harmonic] = (1 - Math.cos(angle)) / harmonic;
      }
      this.pulse = this.audio.createPeriodicWave(real, imaginary);
    }
    return this.pulse;
  }

  noiseBuffer() {
    if (!this.noise) {
      const rate = this.audio.sampleRate;
      this.noise = this.audio.createBuffer(1, Math.ceil(rate * .24), rate);
      const samples = this.noise.getChannelData(0);
      let state = 73;
      for (let i = 0; i < samples.length; i += 1) {
        state = (Math.imul(1664525, state) + 1013904223) >>> 0;
        samples[i] = state / 2147483648 - 1;
      }
    }
    return this.noise;
  }

  shape(source, time, duration, strength, attack, hold) {
    const envelope = this.audio.createGain();
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.linearRampToValueAtTime(strength, time + attack);
    if (hold) envelope.gain.exponentialRampToValueAtTime(strength * hold, time + duration * .53);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + duration);
    source.connect(envelope);
    envelope.connect(this.bus);
  }

  note(pitch, time, duration, strength, wave = "triangle", cutoff = 0) {
    const voice = this.audio.createOscillator();
    if (wave === "pulse") voice.setPeriodicWave(this.pulseWave());
    else voice.type = wave;
    voice.frequency.value = noteHz(pitch);
    let signal = voice;
    if (cutoff) {
      signal = this.audio.createBiquadFilter();
      signal.type = "lowpass";
      signal.frequency.value = cutoff;
      signal.Q.value = .6;
      voice.connect(signal);
    }
    this.shape(signal, time, duration, strength, .008, .66);
    voice.start(time);
    voice.stop(time + duration + .01);
  }

  drumTone(time, duration, strength, from, to, wave = "sine") {
    const voice = this.audio.createOscillator();
    voice.type = wave;
    voice.frequency.setValueAtTime(from, time);
    voice.frequency.exponentialRampToValueAtTime(to, time + duration * .57);
    this.shape(voice, time, duration, strength, .003, 0);
    voice.start(time);
    voice.stop(time + duration + .01);
  }

  drumNoise(time, duration, strength, frequency, filterType) {
    const noise = this.audio.createBufferSource();
    noise.buffer = this.noiseBuffer();
    const filter = this.audio.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = .75;
    noise.connect(filter);
    this.shape(filter, time, duration, strength, .002, 0);
    noise.start(time, time % .065, duration);
  }

  drums(track, position, time, fill, chorus) {
    if (track.kicks.includes(position) || (chorus && position === 11)) {
      this.drumTone(time, .165, position === 0 ? .39 : .31, 136, 49);
      this.drumNoise(time, .022, .045, 2100, "highpass");
    }
    if (position === 4 || position === 12 || (fill && (position === 14 || position === 15))) {
      const ghost = position > 12;
      this.drumNoise(time, .132, ghost ? .13 : .235, 2300, "bandpass");
      this.drumTone(time, .075, ghost ? .04 : .083, 194, 137, "triangle");
    }
    if (position % 2 === 0 || (chorus && position % 4 === 3) || fill) {
      const open = position % 4 === 2;
      this.drumNoise(time, open ? .105 : .041, open ? .115 : .08, 6800, "highpass");
    }
  }

  update() {
    if (!this.bus || this.audio.state !== "running") return;
    const track = COURIER_TRACKS[this.theme];
    const pulse = 60 / track.bpm / 4;
    const now = this.audio.currentTime;
    if (this.next < now) this.next = now + .02;
    while (this.next < now + .2) {
      const bar = Math.floor(this.step / barLength);
      const position = this.step % barLength;
      const eighth = Math.floor(position / 2);
      const phrase = bar % track.chords.length;
      const chord = track.chords[phrase];
      const melody = track.melody[phrase][eighth];
      const time = this.next;
      const chorus = bar >= 16;
      const fill = bar % 8 === 7;
      this.drums(track, position, time, fill, chorus);
      if (position % 2 === 0) {
        const bass = chord[bassPattern[eighth]];
        this.note(bass - 12, time, pulse * 1.87, .19, "sine");
        this.note(bass, time, pulse * 1.37, .085, "triangle", 760);
        if (melody >= 0) {
          this.note(melody, time, pulse * 1.78, .15, track.lead, track.brightness);
          if (chorus && position % 4 === 0) this.note(melody - 12, time, pulse * 1.44, .064, "triangle");
        }
      } else if (chorus || bar < 8 || position % 4 === 3) {
        this.note(chord[arpeggioPattern[eighth]] + 12, time, pulse * 1.27, .058, "triangle");
      }
      if (position === 0 || position === 7 || position === 11) {
        for (const pitch of chord.slice(1)) this.note(pitch, time, pulse * 2.55, .042, "triangle");
      }
      this.step = (this.step + 1) % (phraseBars * barLength);
      this.next += pulse;
    }
  }
}
