const { buildAnswerKey, check } = require('./matcher');
const { TMDB, Demo } = require('./catalog');

const PICK_MS = 15000;
const REVEAL_MS = 8000;
const MAX_FRAMES = 3;
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map();
let globalCatalog = null;

function setGlobalCatalog(c) { globalCatalog = c; }

function newCode() {
  let c;
  do { c = Array.from({ length: 4 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join(''); } while (rooms.has(c));
  return c;
}

function makeMask(title, level) {
  // level 0: nada; 1: só o formato; 2: algumas letras
  if (level <= 0) return null;
  const chars = [...title];
  const letterIdx = chars.map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? i : -1)).filter((i) => i >= 0);
  const show = new Set();
  if (level >= 2) {
    // primeira letra de cada palavra + algumas aleatórias determinísticas
    chars.forEach((ch, i) => { if (/[\p{L}\p{N}]/u.test(ch) && (i === 0 || !/[\p{L}\p{N}]/u.test(chars[i - 1]))) show.add(i); });
    letterIdx.forEach((i, k) => { if ((k * 7 + title.length) % 5 === 0) show.add(i); });
  }
  return chars.map((ch, i) => (/[\p{L}\p{N}]/u.test(ch) ? (show.has(i) ? ch.toUpperCase() : '_') : ch)).join('');
}

class Room {
  constructor(io, code) {
    this.io = io; this.code = code;
    this.players = new Map(); // id -> player
    this.order = [];
    this.hostId = null;
    this.settings = { cats: ['filmes', 'series', 'animes', 'desenhos'], rounds: 10, time: 60, diff: 'medio' };
    this.phase = 'lobby';
    this.catalog = globalCatalog; this.catalogError = null;
    this.round = 0; this.used = new Set(); this.timers = [];
    this.feed = []; this.touched = Date.now();
  }

  // ---------- jogadores ----------
  addPlayer(id, name, socket) {
    let p = this.players.get(id);
    if (!p) {
      p = { id, name, score: 0, connected: true, guessed: false, roundPts: 0, lastGuess: 0, sockets: new Set() };
      this.players.set(id, p); this.order.push(id);
      this.push({ t: 'sys', text: `${name} entrou na sala` });
    }
    p.name = name; p.connected = true; p.sockets.add(socket.id);
    if (!this.hostId || !this.players.get(this.hostId)?.connected) this.hostId = id;
    socket.join(this.code);
    this.touched = Date.now();
    this.broadcast();
  }
  dropSocket(id, socketId) {
    const p = this.players.get(id); if (!p) return;
    p.sockets.delete(socketId);
    if (p.sockets.size) return;
    p.connected = false;
    setTimeout(() => {
      if (p.connected) return;
      if (this.phase === 'lobby' || this.phase === 'end') {
        this.players.delete(id); this.order = this.order.filter((x) => x !== id);
        this.push({ t: 'sys', text: `${p.name} saiu` });
      }
      if (this.hostId === id) this.hostId = this.order.find((x) => this.players.get(x)?.connected) || null;
      if (this.phase === 'picking' && this.pickerId === id) this.autoPick();
      this.checkAllGuessed();
      this.broadcast();
    }, 8000);
  }
  connected() { return this.order.map((id) => this.players.get(id)).filter((p) => p && p.connected); }

  push(item) { this.feed.push({ ...item, at: Date.now() }); if (this.feed.length > 40) this.feed.shift(); }

  // ---------- configuração ----------
  async setKey(key) {
    const c = new TMDB(key);
    await c.validate();
    this.catalog = c; this.catalogError = null; this.broadcast();
  }
  updateSettings(s) {
    const cats = (s.cats || []).filter((c) => ['filmes', 'series', 'animes', 'desenhos'].includes(c));
    if (cats.length) this.settings.cats = cats;
    if ([5, 10, 15, 20].includes(+s.rounds)) this.settings.rounds = +s.rounds;
    if ([30, 45, 60, 90].includes(+s.time)) this.settings.time = +s.time;
    if (['facil', 'medio', 'dificil'].includes(s.diff)) this.settings.diff = s.diff;
    this.broadcast();
  }

  // ---------- partida ----------
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  start() {
    if (!this.catalog) return;
    this.clearTimers();
    this.round = 0; this.used.clear(); this.pickerTurn = -1;
    for (const p of this.players.values()) p.score = 0;
    this.push({ t: 'sys', text: 'Partida começou' });
    this.nextRound();
  }

  async nextRound() {
    this.clearTimers();
    if (this.round >= this.settings.rounds) return this.finish();
    this.round++;
    this.phase = 'loading'; this.broadcast();
    try {
      this.title = await this.catalog.pick(this.settings.cats, this.settings.diff, this.used);
    } catch (e) {
      this.phase = 'lobby'; this.catalogError = e.message; this.round = 0;
      this.push({ t: 'sys', text: 'Erro ao buscar títulos: ' + e.message });
      return this.broadcast();
    }
    if (this.phase !== 'loading') return;
    this.used.add(this.title.id);
    this.key = buildAnswerKey(this.title.titles);
    this.revealed = []; this.correctCount = 0; this.firstDone = false;
    for (const p of this.players.values()) { p.guessed = false; p.roundPts = 0; }
    const conn = this.connected();
    this.pickerTurn = (this.pickerTurn + 1) % Math.max(1, conn.length);
    this.pickerId = conn[this.pickerTurn]?.id;
    this.phase = 'picking';
    this.endsAt = Date.now() + PICK_MS;
    this.later(PICK_MS, () => this.autoPick());
    this.broadcast();
  }

  autoPick() {
    if (this.phase !== 'picking') return;
    this.pick(this.pickerId, Math.floor(Math.random() * this.title.frames.length), true);
  }

  pick(by, index, auto = false) {
    const i = +index;
    if (!Number.isInteger(i) || i < 0 || i >= this.title.frames.length) return;
    if (this.phase === 'picking') {
      if (!auto && by !== this.pickerId) return;
      this.revealed = [i];
      this.phase = 'guessing';
      const T = this.settings.time * 1000;
      this.startedAt = Date.now(); this.endsAt = this.startedAt + T;
      const who = this.players.get(this.pickerId)?.name || 'Projecionista';
      this.push({ t: 'sys', text: auto ? `Frame ${i + 1} sorteado` : `${who} escolheu o frame ${i + 1}` });
      this.later(T * 0.3 + 30, () => this.broadcast());
      this.later(T * 0.6 + 30, () => this.broadcast());
      this.later(T * 0.45, () => this.autoExtra());
      this.later(T * 0.75, () => this.autoExtra());
      this.later(T, () => this.endRound());
      this.broadcast();
    } else if (this.phase === 'guessing') {
      // frame extra escolhido pelo projecionista
      if (by !== this.pickerId || this.revealed.includes(i) || this.revealed.length >= MAX_FRAMES) return;
      if (Date.now() - this.startedAt < 8000) return;
      this.revealed.push(i);
      this.push({ t: 'sys', text: `Pista: frame ${i + 1} revelado` });
      this.broadcast();
    }
  }

  autoExtra() {
    if (this.phase !== 'guessing') return;
    const frac = (Date.now() - this.startedAt) / (this.settings.time * 1000);
    const want = frac >= 0.74 ? 3 : 2;
    while (this.revealed.length < Math.min(want, MAX_FRAMES)) {
      const free = this.title.frames.map((_, k) => k).filter((k) => !this.revealed.includes(k));
      if (!free.length) break;
      const k = free[Math.floor(Math.random() * free.length)];
      this.revealed.push(k);
      this.push({ t: 'sys', text: `Pista: frame ${k + 1} revelado` });
    }
    this.broadcast();
  }

  guess(id, text) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'guessing' || p.guessed) return null;
    const now = Date.now();
    if (now - p.lastGuess < 700) return null;
    p.lastGuess = now;
    const clean = String(text || '').slice(0, 80).trim();
    if (!clean) return null;
    const r = check(clean, this.key);
    if (r.result === 'correct') {
      const T = this.settings.time * 1000;
      const left = Math.max(0, this.endsAt - now) / T;
      const mult = [1, 1, 0.75, 0.5][this.revealed.length] || 0.5;
      let pts = Math.round((100 + 200 * left) * mult);
      if (!this.firstDone) { pts += 30; this.firstDone = true; }
      p.guessed = true; p.roundPts = pts; p.score += pts; this.correctCount++;
      const picker = this.players.get(this.pickerId);
      if (picker && picker.id !== id) { picker.score += 20; picker.roundPts += 20; }
      this.push({ t: 'ok', who: p.name, text: `${p.name} acertou! +${pts}` });
      this.checkAllGuessed();
    } else {
      this.push({ t: r.result === 'close' ? 'close' : 'guess', who: p.name, text: r.result === 'close' ? `${p.name} chegou perto…` : clean });
    }
    this.broadcast();
    return r.result;
  }

  checkAllGuessed() {
    if (this.phase !== 'guessing') return;
    const conn = this.connected();
    if (conn.length && conn.every((p) => p.guessed)) this.endRound();
  }

  endRound() {
    if (this.phase !== 'guessing') return;
    this.clearTimers();
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_MS;
    this.push({ t: 'answer', text: `Era: ${this.title.title}${this.title.year ? ' (' + this.title.year + ')' : ''}` });
    this.later(REVEAL_MS, () => this.nextRound());
    this.broadcast();
  }

  finish() {
    this.clearTimers();
    this.phase = 'end';
    this.push({ t: 'sys', text: 'Fim de jogo' });
    this.broadcast();
  }

  backToLobby() { this.clearTimers(); this.phase = 'lobby'; this.round = 0; this.broadcast(); }

  // ---------- estado enviado ao cliente ----------
  snapshot(forId) {
    const now = Date.now();
    const T = this.settings.time * 1000;
    let mask = null;
    if (this.phase === 'guessing') {
      const frac = (now - this.startedAt) / T;
      mask = makeMask(this.title.title, frac >= 0.6 ? 2 : frac >= 0.3 ? 1 : 0);
    }
    const showAll = this.phase === 'reveal' || this.phase === 'end';
    const t = this.title;
    return {
      code: this.code, me: forId, hostId: this.hostId, phase: this.phase,
      needKey: !this.catalog, catalogError: this.catalogError,
      settings: this.settings, round: this.round, rounds: this.settings.rounds,
      pickerId: this.pickerId, endsIn: this.endsAt ? Math.max(0, this.endsAt - now) : 0,
      totalMs: this.phase === 'picking' ? PICK_MS : this.phase === 'reveal' ? REVEAL_MS : T,
      canExtraIn: this.phase === 'guessing' ? Math.max(0, 8000 - (now - this.startedAt)) : 0,
      frameCount: t && this.phase !== 'lobby' && this.phase !== 'loading' ? t.frames.length : 0,
      revealed: (this.revealed || []).map((i) => ({ i, full: t.frames[i].full, thumb: t.frames[i].thumb })),
      allFrames: showAll && t ? t.frames.map((f, i) => ({ i, thumb: f.thumb, full: f.full })) : null,
      mask,
      answer: showAll && t ? { title: t.title, original: t.original, year: t.year, kind: t.kind, poster: t.poster } : null,
      players: this.order.map((id) => this.players.get(id)).filter(Boolean).map((p) => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, guessed: p.guessed, roundPts: p.roundPts,
      })),
      feed: this.feed.slice(-25),
    };
  }
  broadcast() {
    for (const p of this.players.values()) {
      for (const sid of p.sockets) this.io.to(sid).emit('state', this.snapshot(p.id));
    }
  }
}

function getRoom(code) { return rooms.get(String(code || '').toUpperCase()); }
function createRoom(io) { const code = newCode(); const r = new Room(io, code); rooms.set(code, r); return r; }

// limpa salas abandonadas
setInterval(() => {
  for (const [code, r] of rooms) {
    if (!r.connected().length && Date.now() - r.touched > 10 * 60 * 1000) { r.clearTimers(); rooms.delete(code); }
  }
}, 60000).unref();

module.exports = { getRoom, createRoom, setGlobalCatalog, rooms };
