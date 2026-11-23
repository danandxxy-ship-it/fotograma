const { buildAnswerKey, check } = require('./matcher');
const { TMDB, Demo } = require('./catalog');
const { Music, STYLES } = require('./music');

const PICK_MS = 15000;
const REVEAL_MS = 8000;
const MAX_FRAMES = 3;
const PLACE_BONUS = [120, 70, 35]; // 1º, 2º e 3º a acertar
const EXACT_BONUS = 80;            // escreveu o título completo
const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const rooms = new Map();
let globalCatalog = null;
let musicSource = new Music();
function setGlobalMusic(m) { musicSource = m; }

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
    this.settings = { cats: ['filmes', 'series', 'animes', 'desenhos'], rounds: 10, time: 60, diff: 'medio', musicStyle: 'mix' };
    this.phase = 'lobby';
    this.catalog = globalCatalog; this.catalogError = null;
    this.round = 0; this.used = new Set(); this.timers = [];
    this.feed = []; this.touched = Date.now();
  }

  // ---------- jogadores ----------
  addPlayer(id, name, socket) {
    let p = this.players.get(id);
    if (!p) {
      p = { id, name, score: 0, connected: true, guessed: false, skipped: false, roundPts: 0, lastGuess: 0, joinedAt: Date.now(), sockets: new Set() };
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
  removePlayer(id, socketId) {
    const p = this.players.get(id); if (!p) return;
    this.players.delete(id); this.order = this.order.filter((x) => x !== id);
    this.push({ t: 'sys', text: `${p.name} saiu` });
    const sock = this.io.sockets.sockets.get(socketId); if (sock) sock.leave(this.code);
    if (this.hostId === id) this.hostId = this.order.find((x) => this.players.get(x)?.connected) || null;
    if (this.phase === 'picking' && this.pickerId === id) this.autoPick();
    this.checkAllGuessed();
    this.broadcast();
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
    const cats = (s.cats || []).filter((c) => ['filmes', 'series', 'animes', 'desenhos', 'musicas'].includes(c));
    if (cats.length) this.settings.cats = cats.includes('musicas') ? ['musicas'] : cats;
    if ([5, 10, 15, 20].includes(+s.rounds)) this.settings.rounds = +s.rounds;
    if ([30, 45, 60, 90].includes(+s.time)) this.settings.time = +s.time;
    if (['facil', 'medio', 'dificil'].includes(s.diff)) this.settings.diff = s.diff;
    if (STYLES.includes(s.musicStyle)) this.settings.musicStyle = s.musicStyle;
    this.broadcast();
  }

  // a chave do TMDB só é exigida se houver filmes, séries, animes ou desenhos
  needKey() { return !this.catalog && this.settings.cats.some((c) => c !== 'musicas'); }

  async pickTitle() {
    const { cats, diff, musicStyle } = this.settings;
    if (cats.includes('musicas')) return musicSource.pick(musicStyle, diff, this.used); // modo música: só toca
    return this.catalog.pick(cats, diff, this.used);
  }

  // ---------- partida ----------
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  start() {
    if (this.needKey()) return;
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
      this.title = await this.pickTitle();
    } catch (e) {
      this.phase = 'lobby'; this.catalogError = e.message; this.round = 0;
      this.push({ t: 'sys', text: (this.settings.cats.includes('musicas') ? 'Erro ao buscar músicas: ' : 'Erro ao buscar títulos: ') + e.message });
      return this.broadcast();
    }
    if (this.phase !== 'loading') return;
    this.used.add(this.title.id);
    if (this.title.artistKey) this.used.add(this.title.artistKey);
    this.key = buildAnswerKey(this.title.titles);
    this.artistKey = this.title.artistTitles ? buildAnswerKey(this.title.artistTitles) : null;
    this.revealed = []; this.correctCount = 0; this.firstDone = false;
    for (const p of this.players.values()) { p.guessed = false; p.skipped = false; p.skipSaid = false; p.roundPts = 0; }
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
      this.push({ t: 'sys', text: (() => { const w = this.title && this.title.isMusic ? 'Trecho' : 'Frame'; return auto ? `${w} ${i + 1} sorteado` : `${who} escolheu ${w === 'Trecho' ? 'o trecho' : 'o frame'} ${i + 1}`; })() });
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

  guess(id, text, alts = []) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'guessing' || p.guessed) return null;
    const now = Date.now();
    if (now - p.lastGuess < 700) return null;
    p.lastGuess = now;
    const clean = String(text || '').slice(0, 80).trim();
    if (!clean) return null;
    const evalOne = (txt) => {
    let r = check(txt, this.key);
    let artistOnly = false;
    if (this.artistKey) {
      // música: vale acertar a música OU o artista (só o artista vale 60%)
      const ra = check(txt, this.artistKey);
      if (r.result !== 'correct' && ra.result === 'correct') { r = { ...ra, exact: false }; artistOnly = true; }
      else if (r.result === 'wrong' && ra.result === 'close') r = ra;
      else r.score = Math.max(r.score, ra.score);
    }
    return { r, artistOnly };
    };
    // voz: o reconhecimento manda até 5 versões do que ouviu; vale a melhor
    const rank = (x) => (x.r.result === 'correct' ? 2 : x.r.result === 'close' ? 1 : 0) + x.r.score / 10 - (x.artistOnly ? 0.5 : 0);
    let best = evalOne(clean);
    for (const a of (Array.isArray(alts) ? alts : []).slice(0, 5)) {
      const t = String(a || '').slice(0, 80).trim(); if (!t) continue;
      const c = evalOne(t); if (rank(c) > rank(best)) best = c;
    }
    let { r, artistOnly } = best;
    if (r.result === 'correct') {
      const T = this.settings.time * 1000;
      const left = Math.max(0, this.endsAt - now) / T;
      const mult = [1, 1, 0.75, 0.5][this.revealed.length] || 0.5;
      const place = ++this.correctCount; // 1º, 2º, 3º...
      const speed = Math.round((100 + 200 * left) * mult);
      const placeBonus = PLACE_BONUS[place - 1] || 0;
      const exactBonus = r.exact ? EXACT_BONUS : 0;
      const pts = Math.round((speed + placeBonus + exactBonus) * (artistOnly ? 0.6 : 1));
      this.firstDone = true;
      p.guessed = true; p.roundPts = pts; p.score += pts;
      r.artistOnly = artistOnly; r.pts = pts; r.place = place; r.placeBonus = placeBonus; r.exactBonus = exactBonus;
      const picker = this.players.get(this.pickerId);
      if (picker && picker.id !== id) { picker.score += 20; picker.roundPts += 20; }
      // a mensagem pública nunca contém o palpite: o nome só aparece no fim da rodada
      this.push({ t: 'ok', who: p.name, text: `${p.name} acertou em ${place}º${artistOnly ? ', só o artista' : r.exact ? ', título exato' : ''}! +${pts}` });
      this.checkAllGuessed();
    } else {
      // chute errado só aparece para os outros se estiver longe da resposta (não dá pista)
      const hide = r.result === 'close' || r.score >= 0.45 || this.correctCount > 0 && r.score >= 0.3;
      this.push({ t: r.result === 'close' ? 'close' : 'guess', who: p.name, text: r.result === 'close' ? `${p.name} chegou perto…` : hide ? '••••••' : clean });
    }
    this.broadcast();
    return r;
  }

  // "Não sei": passa a vez. Se todo mundo que falta acertar passar, a rodada acaba na hora.
  skip(id) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'guessing' || p.guessed) return;
    p.skipped = !p.skipped;
    if (p.skipped && !p.skipSaid) { p.skipSaid = true; this.push({ t: 'skip', who: p.name, text: `${p.name} não sabe` }); }
    this.checkAllGuessed();
    this.broadcast();
  }

  checkAllGuessed() {
    if (this.phase !== 'guessing') return;
    const conn = this.connected();
    if (!conn.length || !conn.every((p) => p.guessed || p.skipped)) return;
    if (conn.some((p) => p.skipped)) this.push({ t: 'sys', text: conn.some((p) => p.guessed) ? 'Quem faltava passou a vez' : 'Ninguém sabia: todo mundo passou' });
    this.endRound();
  }

  endRound() {
    if (this.phase !== 'guessing') return;
    this.clearTimers();
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_MS;
    this.push({ t: 'answer', text: `Era: ${this.title.title}${this.title.artist ? ' — ' + this.title.artist : ''}${this.title.year ? ' (' + this.title.year + ')' : ''}` });
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
      needKey: this.needKey(), catalogError: this.catalogError,
      settings: this.settings, round: this.round, rounds: this.settings.rounds,
      pickerId: this.pickerId, endsIn: this.endsAt ? Math.max(0, this.endsAt - now) : 0,
      totalMs: this.phase === 'picking' ? PICK_MS : this.phase === 'reveal' ? REVEAL_MS : T,
      canExtraIn: this.phase === 'guessing' ? Math.max(0, 8000 - (now - this.startedAt)) : 0,
      frameCount: t && this.phase !== 'lobby' && this.phase !== 'loading' ? t.frames.length : 0,
      mode: t && !['lobby', 'loading'].includes(this.phase) ? (t.isMusic ? 'music' : 'film') : null,
      audio: t && t.isMusic && ['picking', 'guessing', 'reveal'].includes(this.phase) ? t.audio : null,
      revealed: (this.revealed || []).map((i) => ({ i, full: t.frames[i].full, thumb: t.frames[i].thumb, start: t.frames[i].start, len: t.frames[i].len })),
      allFrames: showAll && t ? t.frames.map((f, i) => ({ i, thumb: f.thumb, full: f.full })) : null,
      mask,
      answer: showAll && t ? { title: t.title, original: t.original, artist: t.artist || null, year: t.year, kind: t.kind, poster: t.poster } : null,
      players: this.order.map((id) => this.players.get(id)).filter(Boolean).map((p) => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, guessed: p.guessed, skipped: p.skipped, roundPts: p.roundPts, joinedAt: p.joinedAt,
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

// quantas pessoas estão jogando agora no site todo
function stats() {
  let players = 0, playing = 0, active = 0;
  for (const r of rooms.values()) {
    const n = r.connected().length;
    if (!n) continue;
    active++; players += n;
    if (r.phase !== 'lobby' && r.phase !== 'end') playing += n;
  }
  return { rooms: active, players, playing };
}

module.exports = { getRoom, createRoom, setGlobalCatalog, setGlobalMusic, rooms, stats };
