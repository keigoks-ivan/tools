// Four original eight-bar arrangements. Chords and melodic notes use MIDI pitches.
const COURIER_TRACKS = {
  dusk: {
    bpm: 94, voice: "triangle",
    chords: [[50, 57, 60, 65], [46, 53, 57, 62], [53, 60, 64, 69], [48, 55, 60, 64],
      [50, 57, 60, 65], [46, 53, 57, 62], [55, 62, 65, 69], [45, 52, 58, 64]],
    melody: [[69, 72, 74, -1, 77, -1, 74, 72], [69, -1, 65, -1, 67, 69, 74, -1],
      [72, -1, 69, 65, 64, -1, 65, 69], [67, -1, 64, 60, 64, -1, 67, 72],
      [74, -1, 77, 81, 79, -1, 77, 74], [72, -1, 69, -1, 65, 67, 69, -1],
      [74, -1, 70, 69, 67, -1, 65, 67], [69, -1, 76, 74, 73, -1, 76, -1]],
  },
  morning: {
    bpm: 108, voice: "sine",
    chords: [[55, 62, 66, 71], [52, 59, 62, 67], [48, 55, 59, 64], [50, 57, 62, 66],
      [55, 62, 66, 71], [54, 61, 66, 69], [52, 59, 62, 67], [50, 57, 60, 66]],
    melody: [[74, 76, 79, -1, 83, -1, 81, 79], [76, -1, 79, 74, 71, -1, 67, -1],
      [72, -1, 76, 79, 76, -1, 74, 72], [69, 71, 74, -1, 78, -1, 76, 74],
      [79, -1, 81, 83, 86, -1, 83, 81], [78, -1, 81, 78, 73, -1, 76, -1],
      [74, 76, 79, -1, 76, -1, 74, 71], [69, -1, 72, 74, 78, -1, 81, -1]],
  },
  copper: {
    bpm: 118, voice: "triangle",
    chords: [[45, 52, 55, 60], [45, 52, 59, 64], [41, 48, 52, 57], [43, 50, 55, 59],
      [45, 52, 57, 60], [48, 55, 59, 64], [41, 48, 52, 57], [40, 47, 56, 62]],
    melody: [[69, -1, 72, 76, 74, -1, 72, -1], [71, 72, 76, -1, 79, 76, 71, -1],
      [69, -1, 72, 77, 76, 72, -1, 69], [67, 71, 74, -1, 79, 74, 71, -1],
      [72, -1, 76, 81, 79, 76, 74, -1], [76, 79, 84, -1, 79, 76, 72, -1],
      [77, -1, 76, 72, 69, -1, 65, 69], [68, 71, 74, -1, 76, 74, 71, 68]],
  },
  night: {
    bpm: 82, voice: "sine",
    chords: [[47, 54, 57, 62], [43, 50, 54, 59], [50, 57, 61, 66], [45, 52, 57, 61],
      [47, 54, 61, 66], [43, 50, 54, 59], [52, 59, 62, 66], [42, 49, 58, 64]],
    melody: [[78, -1, -1, 76, 74, -1, 73, -1], [71, -1, 74, -1, 78, -1, -1, 76],
      [81, -1, -1, 78, 76, -1, 73, -1], [76, -1, 73, -1, 69, -1, -1, 73],
      [78, -1, 83, -1, 85, -1, 81, -1], [79, -1, -1, 78, 74, -1, 71, -1],
      [76, -1, 78, -1, 83, -1, -1, 78], [76, -1, 73, -1, 70, -1, 73, -1]],
  },
};

const noteHz = pitch => 440 * 2 ** ((pitch - 69) / 12);

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
    this.bus.gain.value = .48;
    this.bus.connect(this.audio.destination);
    this.next = this.audio.currentTime + .07;
  }

  stop() {
    if (!this.bus) return;
    const bus = this.bus;
    this.bus = null;
    bus.gain.setTargetAtTime(.0001, this.audio.currentTime, .045);
    setTimeout(() => bus.disconnect(), 350);
  }

  note(pitch, time, length, strength, wave = "sine", attack = .016) {
    const voice = this.audio.createOscillator();
    const envelope = this.audio.createGain();
    voice.type = wave;
    voice.frequency.value = noteHz(pitch);
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.exponentialRampToValueAtTime(strength, time + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + length);
    voice.connect(envelope);
    envelope.connect(this.bus);
    voice.start(time);
    voice.stop(time + length + .015);
  }

  update() {
    if (!this.bus || this.audio.state !== "running") return;
    const track = COURIER_TRACKS[this.theme];
    const beat = 60 / track.bpm;
    const now = this.audio.currentTime;
    if (this.next < now) this.next = now + .02;
    while (this.next < now + .2) {
      const bar = Math.floor(this.step / 8);
      const eighth = this.step % 8;
      const chord = track.chords[bar];
      const melody = track.melody[bar][eighth];
      const time = this.next;
      if (eighth === 0) {
        this.note(chord[0] - 12, time, beat * 3.75, .115, "sine", .15);
        for (const pitch of chord.slice(1)) this.note(pitch, time, beat * 3.95, .045, "sine", .42);
      }
      if (eighth % 2 || this.theme === "copper") {
        const arpeggio = [0, 1, 3, 2, 1, 2, 3, 1];
        this.note(chord[arpeggio[eighth]] + 12, time, beat * 1.3, .045);
      }
      if (eighth === 0 || eighth === 4) this.note(32, time, .16, this.theme === "night" ? .033 : .07);
      if (melody >= 0) {
        this.note(melody, time, beat * 1.56, .125, track.voice);
        this.note(melody + 12, time + .06, beat * .88, .022);
      }
      this.step = (this.step + 1) % (track.chords.length * 8);
      this.next += beat / 2;
    }
  }
}
