import { encodeLobbyState } from './protocol.js?v=20261002b';

// Lobby choices travel through the same authenticated room relay as gameplay.
// Only the current host chooses the chapter or starts a run. Late joiners can
// choose a character before entering the already-running chapter.
export class RoomLoadout {
  constructor({ client, character = 'violet', chapter = 0, onLaunch, onChange = () => {}, currentChapter = () => this.chapter }) {
    this.client = client; this.character = ['violet', 'azure', 'amber'].includes(character) ? character : 'violet';
    this.chapter = this.validChapter(chapter) ? chapter : 0;
    this.ready = false; this.choices = new Map(); this.run = 0; this.launched = 0; this.room = null; this.revision = 0;
    this.onLaunch = onLaunch; this.onChange = onChange; this.currentChapter = currentChapter;
    client.on('welcome', () => {
      if (client.room !== this.room) { this.room = client.room; this.ready = false; this.run = this.launched = this.revision = 0; this.choices.clear(); }
      this.publish(); this.changed();
    });
    client.on('join', () => { this.publish(); this.changed(); });
    client.on('leave', id => { this.choices.delete(id); this.changed(); this.maybeStart(); });
    client.on('host', () => { if (this.isHost && this.launched) this.chapter = currentChapter(); this.publish(); this.changed(); });
    client.on('signal', (id, d) => this.receive(id, d));
  }
  validChapter(value) { return Number.isInteger(value) && value >= 0 && value < 5; }
  get isHost() { return !!this.client.you && this.client.host === this.client.you; }
  choice(id) { const value = id === this.client.you ? { character: this.character, ready: this.ready, revision: this.revision } : this.choices.get(id) || { character: 'violet', ready: false }; return { ...value, ready: value.ready && value.revision === this.revision }; }
  changed() { this.onChange(this); }
  publish() {
    if (!this.client.room || !this.client.you) return;
    this.client.send('s', encodeLobbyState(this.character, this.ready, this.revision));
    if (this.isHost) this.client.send('e', { loadout: { ch: this.character, ready: this.ready ? 1 : 0, rv: this.revision, lv: this.launched ? this.currentChapter() : this.chapter, ...(this.run ? { go: this.run } : {}) } });
  }
  setCharacter(value) {
    if (this.launched || !['violet', 'azure', 'amber'].includes(value)) return false;
    this.character = value; this.ready = false; this.publish(); this.changed(); return true;
  }
  setChapter(value) {
    if (!this.isHost || this.launched || !this.validChapter(value)) return false;
    this.chapter = value; this.ready = false; this.revision = Math.max(Date.now(), this.revision + 1);
    for (const choice of this.choices.values()) choice.ready = false;
    this.publish(); this.changed(); return true;
  }
  prepare() {
    if (this.launched) return;
    this.ready = true; this.publish(); this.changed();
    if (this.run) this.launch(); else this.maybeStart();
  }
  maybeStart() {
    if (!this.isHost || !this.ready || this.run) return;
    if (![...this.client.members.keys()].every(id => this.choice(id).ready)) return;
    this.run = Date.now(); this.publish(); this.launch();
  }
  launch() {
    if (!this.ready || !this.run || this.launched === this.run) return;
    this.launched = this.run;
    this.onLaunch({ character: this.character, chapter: this.chapter }); this.changed();
  }
  receive(id, d) {
    if (!this.client.members.has(id)) return;
    const choice = this.choices.get(id) || { character: 'violet', ready: false };
    if (['violet', 'azure', 'amber'].includes(d.ch)) choice.character = d.ch;
    if (d.ready === 0 || d.ready === 1) choice.ready = d.ready === 1;
    if (Number.isInteger(d.rv)) choice.revision = d.rv;
    this.choices.set(id, choice);
    if (id === this.client.host) {
      if (this.validChapter(d.lv) && Number.isInteger(d.rv) && d.rv >= this.revision && (d.lv !== this.chapter || d.rv !== this.revision)) {
        this.chapter = d.lv;
        this.revision = d.rv;
        if (!this.launched) { this.ready = false; this.publish(); }
      }
      if (Number.isInteger(d.go) && d.go > this.run) this.run = d.go;
      this.launch();
    }
    this.changed(); this.maybeStart();
  }
  failed() { this.launched = 0; this.ready = false; this.publish(); this.changed(); }
}
