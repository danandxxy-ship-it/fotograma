const { roast, blank } = require('./roast');
const { buildAnswerKey, check, norm } = require('./matcher');
const { TMDB, Demo } = require('./catalog');
const { Music, STYLES } = require('./music');
const { POWERS, HAND_MAX, COOLDOWN, draw, allowed, Bots } = require('./arcade');
const { Games, Characters, TrueFalse } = require('./extras');
let extras = { games: new Games(), chars: new Characters(), tf: new TrueFalse() };
function setGlobalExtras(x) { extras = x; }
const SPECIAL = ['musicas', 'games', 'personagens', 'vf'];
const VF_MAX = 20;

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
    this.settings = { cats: ['filmes', 'series', 'animes', 'desenhos'], rounds: 10, time: 60, diff: 'medio', musicStyle: 'mix', arcade: false, botLevel: 'medio', charSrc: 'mix' };
    this.phase = 'lobby';
    this.catalog = globalCatalog; this.catalogError = null;
    this.round = 0; this.used = new Set(); this.timers = [];
    this.feed = []; this.touched = Date.now();
    this.bots = new Bots(this);
    this.screens = new Set(); // TVs ligadas na sala (modo transmissão): só assistem
  }
  addScreen(socket) { this.screens.add(socket.id); socket.join(this.code); this.touched = Date.now(); this.broadcast(); }
  dropScreen(sid) { if (this.screens.delete(sid)) { this.touched = Date.now(); this.broadcast(); } }

  // ---------- jogadores ----------
  addPlayer(id, name, socket) {
    let p = this.players.get(id);
    if (!p) {
      p = { id, name, score: 0, connected: true, guessed: false, skipped: false, roundPts: 0, lastGuess: 0, joinedAt: Date.now(), sockets: new Set(), hand: [], fx: {}, st: blank() };
      const back = this.gone && this.gone.get(id); // saiu no meio da partida e voltou: recupera os pontos
      if (back && this.phase !== 'lobby') { p.score = back.score; p.st = back.st; }
      if (this.gone) this.gone.delete(id);
      this.players.set(id, p); this.order.push(id);
      this.push({ t: 'sys', text: back ? `${name} voltou` : `${name} entrou na sala` });
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
    if (this.hostId === id) this.hostId = this.order.find((x) => this.players.get(x)?.connected && !this.players.get(x).isBot) || id;
    this.broadcast();
    // celular que só bloqueou a tela ou trocou de app tem um tempinho para voltar; depois disso sai da sala de vez
    const grace = this.phase === 'lobby' || this.phase === 'end' ? 12000 : 25000;
    clearTimeout(p.dropT);
    p.dropT = setTimeout(() => { if (!p.connected && this.players.get(id) === p) this.removePlayer(id, null); }, grace);
  }
  removePlayer(id, socketId) {
    const p = this.players.get(id); if (!p) return;
    clearTimeout(p.dropT);
    if (this.phase !== 'lobby' && p.score) (this.gone || (this.gone = new Map())).set(id, { score: p.score, st: p.st });
    this.players.delete(id); this.order = this.order.filter((x) => x !== id);
    this.push({ t: 'sys', text: `${p.name} saiu` });
    const sock = socketId && this.io.sockets.sockets.get(socketId); if (sock) sock.leave(this.code);
    if (this.hostId === id) this.hostId = this.order.find((x) => this.players.get(x)?.connected && !this.players.get(x).isBot) || null;
    if (this.phase === 'picking' && this.pickerId === id) this.autoPick();
    this.checkAllGuessed();
    this.broadcast();
  }
  connected() { return this.order.map((id) => this.players.get(id)).filter((p) => p && p.connected); }
  humans() { return this.connected().filter((p) => !p.isBot); }

  push(item) {
    this.feedSeq = (this.feedSeq || 0) + 1;
    this.feed.push({ ...item, n: this.feedSeq, re: {}, at: Date.now() });
    if (this.feed.length > 40) this.feed.shift();
    // bots às vezes reagem a quem acertou primeiro
    if (item.t === 'ok' && /em 1º/.test(item.text)) { const n = this.feedSeq; this.botReactMsg(0.5, n, ['🔥', '👏', '😱', '😡'], item.pid); }
  }
  // reagir a uma mensagem do feed: uma reação por pessoa por mensagem (tocar no mesmo emoji tira)
  reactMsg(id, n, e) {
    const p = this.players.get(id), f = this.feed.find((x) => x.n === n);
    if (!p || !f) return;
    const had = (f.re[e] || []).includes(id);
    for (const k of Object.keys(f.re)) { f.re[k] = f.re[k].filter((x) => x !== id); if (!f.re[k].length) delete f.re[k]; }
    if (!had) {
      (f.re[e] = f.re[e] || []).push(id);
      const to = f.pid && this.players.get(f.pid);
      if (to && to.id !== id) for (const sid of to.sockets) this.io.to(sid).emit('msgReact', { name: p.name, e, text: f.text });
    }
    this.broadcast();
  }
  botReactMsg(chance, n, list, exceptId) {
    const bots = [...this.players.values()].filter((p) => p.isBot && p.id !== exceptId);
    if (!bots.length || Math.random() > chance) return;
    const b = bots[Math.floor(Math.random() * bots.length)];
    this.later(700 + Math.random() * 2000, () => this.reactMsg(b.id, n, list[Math.floor(Math.random() * list.length)]));
  }

  // ---------- configuração ----------
  async setKey(key) {
    const c = new TMDB(key);
    await c.validate();
    this.catalog = c; this.catalogError = null; this.broadcast();
  }
  updateSettings(s) {
    const cats = (s.cats || []).filter((c) => ['filmes', 'series', 'animes', 'desenhos', ...SPECIAL].includes(c));
    if (cats.length) { const sp = cats.find((c) => SPECIAL.includes(c)); this.settings.cats = sp ? [sp] : cats; }
    if ([5, 10, 15, 20].includes(+s.rounds)) this.settings.rounds = +s.rounds;
    if ([30, 45, 60, 90].includes(+s.time)) this.settings.time = +s.time;
    if (['facil', 'medio', 'dificil'].includes(s.diff)) this.settings.diff = s.diff;
    if (STYLES.includes(s.musicStyle)) this.settings.musicStyle = s.musicStyle;
    if (s.arcade !== undefined) this.settings.arcade = s.arcade === true || s.arcade === '1' || s.arcade === 1;
    if (['facil', 'medio', 'craque'].includes(s.botLevel)) this.settings.botLevel = s.botLevel;
    if (['mix', 'live', 'anime'].includes(s.charSrc)) this.settings.charSrc = s.charSrc;
    this.broadcast();
  }

  // a chave do TMDB só é exigida se houver filmes, séries, animes ou desenhos
  needKey() {
    const c = this.settings.cats;
    return !this.catalog && (c.some((x) => !SPECIAL.includes(x)) || (c[0] === 'personagens' && this.settings.charSrc === 'live'));
  }
  modeOf(t) { return !t ? null : t.isMusic ? 'music' : t.isGame ? 'game' : t.isChar ? 'char' : t.isVF ? 'vf' : 'film'; }

  async pickTitle() {
    const { cats, diff, musicStyle } = this.settings;
    if (cats.includes('musicas')) return musicSource.pick(musicStyle, diff, this.used); // modo música: só toca
    if (cats.includes('games')) return extras.games.pick(diff, this.used);
    if (cats.includes('personagens')) return extras.chars.pick(this.catalog, this.settings.charSrc, diff, this.used);
    if (cats.includes('vf')) return extras.tf.pick(this.catalog, diff, this.used);
    return this.catalog.pick(cats, diff, this.used);
  }

  // ---------- partida ----------
  clearTimers() { this.timers.forEach(clearTimeout); this.timers = []; }
  later(ms, fn) { this.timers.push(setTimeout(fn, ms)); }

  start() {
    if (this.needKey()) return;
    this.clearTimers();
    this.round = 0; this.used.clear(); this.pickerTurn = -1;
    for (const p of this.players.values()) { p.score = 0; p.hand = []; p.fx = {}; p.shield = false; p.st = blank(); }
    this.gone = new Map(); this.roast = null;
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
      this.push({ t: 'sys', text: ({ musicas: 'Erro ao buscar músicas: ', games: 'Erro ao buscar games: ', personagens: 'Erro ao buscar personagens: ', vf: 'Erro: ' }[this.settings.cats[0]] || 'Erro ao buscar títulos: ') + e.message });
      return this.broadcast();
    }
    if (this.phase !== 'loading') return;
    this.used.add(this.title.id);
    if (this.title.artistKey) this.used.add(this.title.artistKey);
    this.key = buildAnswerKey(this.title.titles);
    this.artistKey = this.title.artistTitles ? buildAnswerKey(this.title.artistTitles) : null;
    this.actorKey = this.title.actorTitles ? buildAnswerKey(this.title.actorTitles) : null;
    this.revealed = []; this.correctCount = 0; this.firstDone = false;
    const mode = this.modeOf(this.title);
    for (const p of this.players.values()) {
      p.guessed = false; p.skipped = false; p.skipSaid = false; p.roundPts = 0;
      p.fx = {}; p.toll = null; p.double = false; p.radar = false; p.hint = false; p.peek = []; p.vf = null;
      if (this.settings.arcade) {
        p.hand = (p.hand || []).filter((k) => allowed(k, mode));
        const n = this.round === 1 ? 2 : 1;
        for (let k = 0; k < n && p.hand.length < HAND_MAX; k++) p.hand.push(draw(mode, p.hand));
      }
    }
    const conn = this.connected();
    if (this.title.isVF) { // sem projecionista: a afirmação já aparece
      this.pickerId = null; this.phase = 'guessing';
      const T = Math.min(this.settings.time, VF_MAX) * 1000;
      this.startedAt = Date.now(); this.endsAt = this.startedAt + T;
      this.later(T, () => this.endRound());
      this.bots.onVF();
      return this.broadcast();
    }
    this.pickerTurn = (this.pickerTurn + 1) % Math.max(1, conn.length);
    this.pickerId = conn[this.pickerTurn]?.id;
    this.phase = 'picking';
    this.endsAt = Date.now() + PICK_MS;
    this.later(PICK_MS, () => this.autoPick());
    this.bots.onPicking();
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
      this.push({ t: 'sys', text: (() => { const w = this.title.isMusic ? 'Trecho' : this.title.isGame ? 'Captura' : this.title.isChar ? 'Foto' : 'Frame'; return auto ? `${w} ${i + 1} ${['Trecho', 'Frame'].includes(w) ? 'sorteado' : 'sorteada'}` : `${who} escolheu ${{ Trecho: 'o trecho', Captura: 'a captura', Foto: 'a foto', Frame: 'o frame' }[w]} ${i + 1}`; })() });
      this.later(T * 0.3 + 30, () => this.broadcast());
      this.later(T * 0.6 + 30, () => this.broadcast());
      this.later(T * 0.45, () => this.autoExtra());
      this.later(T * 0.75, () => this.autoExtra());
      this.later(T, () => this.endRound());
      this.bots.onGuessing();
      this.broadcast();
    } else if (this.phase === 'guessing') {
      // frame extra escolhido pelo projecionista
      if (by !== this.pickerId || this.revealed.includes(i) || this.revealed.length >= MAX_FRAMES) return;
      if (Date.now() - this.startedAt < 8000) return;
      this.revealed.push(i);
      this.push({ t: 'sys', text: this.title.frames[i].scene ? `Pista: cena ${i + 1} revelada` : `Pista: ${this.clueWord()} ${i + 1} revelad${this.clueWord() === 'frame' || this.clueWord() === 'trecho' ? 'o' : 'a'}` });
      this.bots.onExtraFrame();
      this.broadcast();
    }
  }

  clueWord() { const t = this.title || {}; return t.isMusic ? 'trecho' : t.isGame ? 'captura' : t.isChar ? 'foto' : 'frame'; }

  autoExtra() {
    if (this.phase !== 'guessing') return;
    const frac = (Date.now() - this.startedAt) / (this.settings.time * 1000);
    const want = frac >= 0.74 ? 3 : 2;
    while (this.revealed.length < Math.min(want, MAX_FRAMES)) {
      const free = this.title.frames.map((_, k) => k).filter((k) => !this.revealed.includes(k));
      if (!free.length) break;
      const k = free[Math.floor(Math.random() * free.length)];
      this.revealed.push(k);
      this.push({ t: 'sys', text: this.title.frames[k].scene ? `Pista: cena ${k + 1} revelada` : `Pista: ${this.clueWord()} ${k + 1} revelad${this.clueWord() === 'frame' || this.clueWord() === 'trecho' ? 'o' : 'a'}` });
    }
    this.bots.onExtraFrame();
    this.broadcast();
  }

  guess(id, text, alts = []) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'guessing' || p.guessed) return null;
    const now = Date.now();
    if ((p.fx.congela || 0) > now) return { result: 'frozen', left: p.fx.congela - now };
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
    if (this.title.isVF) return null; // V ou F usa answerVF
    if (this.actorKey) { // modo personagens: chutou o ator?
      const all = [clean, ...(Array.isArray(alts) ? alts : [])].map((x) => String(x || '').slice(0, 80));
      const rk = check(clean, this.key);
      if (rk.result !== 'correct' && all.some((x) => check(x, this.actorKey).result === 'correct') && !all.some((x) => check(x, this.key).result === 'correct')) {
        p.lastGuess = now; if (p.st) p.st.actor++; return { result: 'actor' };
      }
    }
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
      if (this.title.isChar && r.exact) { // personagem: só o nome completo vale como exato
        const f = (x) => norm(x).replace(/ /g, '');
        r.exact = [clean, ...(Array.isArray(alts) ? alts : [])].some((x) => f(x) === f(this.title.title));
      }
      const exactBonus = r.exact ? EXACT_BONUS : 0;
      let pts = Math.round((speed + placeBonus + exactBonus) * (artistOnly ? 0.6 : 1));
      if (p.double) { pts *= 2; p.double = false; r.double = true; }
      let tollMsg = '';
      const taker = p.toll && this.players.get(p.toll);
      if (taker) { const cut = Math.round(pts * 0.3); pts -= cut; taker.score += cut; r.toll = cut; tollMsg = ` (pedágio: ${cut} para ${taker.name})`; p.toll = null; }
      // em arcade, quem acerta primeiro ganha uma carta
      if (this.settings.arcade && place === 1 && p.hand.length < HAND_MAX) { p.hand.push(draw(this.title.isMusic ? 'music' : 'film', p.hand)); r.card = true; }
      this.firstDone = true;
      p.guessed = true; p.roundPts = pts; p.score += pts;
      const s = p.st || (p.st = blank()); s.hits++; if (place === 1) s.firsts++; if (r.exact) s.exacts++;
      const took = now - (this.startedAt || now); if (took > 0 && (!s.fastest || took < s.fastest)) s.fastest = took;
      r.artistOnly = artistOnly; r.pts = pts; r.place = place; r.placeBonus = placeBonus; r.exactBonus = exactBonus;
      const picker = this.players.get(this.pickerId);
      if (picker && picker.id !== id) { picker.score += 20; picker.roundPts += 20; }
      // a mensagem pública nunca contém o palpite: o nome só aparece no fim da rodada
      this.push({ t: 'ok', who: p.name, pid: p.id, text: `${p.name} acertou em ${place}º${artistOnly ? ', só o artista' : r.exact ? (this.title.isChar ? ', nome completo' : ', título exato') : ''}! +${pts}${r.double ? ' (dobro)' : ''}${tollMsg}` });
      if (place === 1) this.botReact(0.35, ['😱', '👏', '🔥'], p.id);
      this.checkAllGuessed();
    } else {
      // chute errado só aparece para os outros se estiver longe da resposta (não dá pista)
      if (p.radar) r.heat = r.score >= 0.6 ? 'quente' : r.score >= 0.35 ? 'morno' : 'frio';
      const hide = r.result === 'close' || r.score >= 0.45 || this.correctCount > 0 && r.score >= 0.3;
      if (p.st) { if (r.result === 'close') p.st.close++; else p.st.wrong++; }
      this.push({ t: r.result === 'close' ? 'close' : 'guess', who: p.name, pid: p.id, text: r.result === 'close' ? `${p.name} chegou perto…` : hide ? '••••••' : clean });
    }
    this.broadcast();
    return r;
  }

  // "Não sei": passa a vez. Se todo mundo que falta acertar passar, a rodada acaba na hora.
  skip(id) {
    const p = this.players.get(id);
    if (!p || this.phase !== 'guessing' || p.guessed) return;
    p.skipped = !p.skipped;
    if (p.skipped && !p.skipSaid) { p.skipSaid = true; if (p.st) p.st.skips++; this.push({ t: 'skip', who: p.name, pid: p.id, text: `${p.name} não sabe` }); }
    this.checkAllGuessed();
    this.broadcast();
  }

  // ---------- reações ----------
  react(id, e) {
    const p = this.players.get(id); if (!p) return;
    this.io.to(this.code).emit('react', { from: id, name: p.name, e });
  }
  botReact(chance, list, exceptId) {
    const bots = [...this.players.values()].filter((p) => p.isBot && p.id !== exceptId);
    if (!bots.length || Math.random() > chance) return;
    const b = bots[Math.floor(Math.random() * bots.length)];
    this.later(400 + Math.random() * 1500, () => this.react(b.id, list[Math.floor(Math.random() * list.length)]));
  }

  // ---------- Verdadeiro ou Falso ----------
  answerVF(id, v) {
    const p = this.players.get(id), now = Date.now();
    if (!p || this.phase !== 'guessing' || !this.title.isVF || p.vf) return null;
    if ((p.fx.congela || 0) > now) return { result: 'frozen', left: p.fx.congela - now };
    p.vf = { v: !!v, at: now }; p.guessed = true;
    this.push({ t: 'sys', pid: p.id, text: `${p.name} respondeu` });
    this.checkAllGuessed();
    this.broadcast();
    return { result: 'answered' };
  }
  scoreVF() {
    const T = this.endsAt - this.startedAt;
    const right = [...this.players.values()].filter((p) => p.vf && p.vf.v === this.title.truth).sort((a, b) => a.vf.at - b.vf.at);
    right.forEach((p, k) => {
      const left = Math.max(0, 1 - (p.vf.at - this.startedAt) / T);
      let pts = Math.round(100 + 200 * left) + ([120, 70, 35][k] || 0);
      if (p.double) { pts *= 2; p.double = false; }
      const taker = p.toll && this.players.get(p.toll);
      if (taker) { const cut = Math.round(pts * 0.3); pts -= cut; taker.score += cut; }
      p.score += pts; p.roundPts = pts;
      if (p.st) { p.st.hits++; if (k === 0) p.st.firsts++; const took = p.vf.at - this.startedAt; if (!p.st.fastest || took < p.st.fastest) p.st.fastest = took; }
      if (this.settings.arcade && k === 0 && p.hand.length < HAND_MAX) p.hand.push(draw('vf', p.hand));
    });
    for (const p of this.players.values()) if (p.vf && p.vf.v !== this.title.truth) { p.guessed = false; if (p.st) p.st.wrong++; } // ✓ só pra quem acertou
    const n = right.length, tot = [...this.players.values()].filter((p) => p.vf).length;
    this.push({ t: 'sys', text: `${n} de ${tot} acertaram` });
  }

  // ---------- arcade: cartas de poder ----------
  usePower(id, card, targetId) {
    const p = this.players.get(id), now = Date.now(), P = POWERS[card];
    if (!this.settings.arcade || !p || !P || !p.hand || !p.hand.includes(card)) return 'nope';
    if (P.type === 'atk' ? this.phase !== 'guessing' : !['picking', 'guessing'].includes(this.phase)) return 'fase';
    if ((p.cdUntil || 0) > now) return 'espera';
    let t = null;
    if (P.type === 'atk') {
      t = this.players.get(targetId);
      if (!t || t.id === id || !t.connected || t.guessed) return 'alvo';
    }
    p.hand.splice(p.hand.indexOf(card), 1);
    p.cdUntil = now + COOLDOWN;
    let from = p, bounced = false, blocked = false;
    if (t && t.shield) {
      t.shield = false;
      if (p.shield) { p.shield = false; blocked = true; } else { bounced = true; [from, t] = [t, p]; }
    }
    if (blocked) {
      this.push({ t: 'power', pid: p.id, text: `${p.name} jogou ${P.name} em ${this.players.get(targetId).name}, mas os dois espelhos se anularam` });
    } else if (t) {
      if (P.dur) t.fx[card] = now + P.dur;
      if (from.st) from.st.atkSent++; if (t.st) t.st.atkTaken++;
      if (card === 'pedagio') t.toll = from.id;
      this.push({ t: 'power', pid: p.id, text: bounced ? `${p.name} jogou ${P.name} em ${from.name}, mas o espelho devolveu!` : `${p.name} jogou ${P.name} em ${t.name}` });
      if (P.dur) this.later(P.dur + 50, () => this.broadcast());
      if (t.isBot && Math.random() < 0.6) this.later(500 + Math.random() * 900, () => this.react(t.id, Math.random() < 0.5 ? '😡' : '💀'));
    } else {
      if (card === 'espiar') {
        const free = this.title.frames.map((_, k) => k).filter((k) => !(this.revealed || []).includes(k) && !p.peek.includes(k));
        if (free.length) p.peek.push(free[Math.floor(Math.random() * free.length)]);
      }
      if (card === 'dica') p.hint = true;
      if (card === 'escudo') p.shield = true;
      if (card === 'dobro') p.double = true;
      if (card === 'radar') p.radar = true;
      this.push({ t: 'power', pid: p.id, text: `${p.name} usou ${P.name}` });
    }
    this.io.to(this.code).emit('power', { from: p.id, to: t ? t.id : p.id, via: targetId || null, card, bounced, blocked });
    this.broadcast();
    return 'ok';
  }

  checkAllGuessed() {
    if (this.phase !== 'guessing') return;
    const conn = this.connected();
    const hum = conn.filter((p) => !p.isBot);
    if (hum.length && hum.every((p) => p.guessed || p.skipped) && conn.some((p) => p.isBot && !p.guessed && !p.skipped)) this.bots.hurry();
    if (!conn.length || !conn.every((p) => p.guessed || p.skipped)) return;
    if (conn.some((p) => p.skipped)) this.push({ t: 'sys', text: conn.some((p) => p.guessed) ? 'Quem faltava passou a vez' : 'Ninguém sabia: todo mundo passou' });
    this.endRound();
  }

  endRound() {
    if (this.phase !== 'guessing') return;
    this.clearTimers();
    this.phase = 'reveal';
    this.endsAt = Date.now() + REVEAL_MS;
    if (this.title.isVF) this.scoreVF();
    for (const p of this.players.values()) if (!p.roundPts && p.st) p.st.blank++;
    this.botReact(0.45, ['😂', '🤯', '👏', '💀']);
    this.push({ t: 'answer', text: this.title.isVF ? `${this.title.title}! ${this.title.original}` : `Era: ${this.title.title}${this.title.artist ? ' — ' + this.title.artist : ''}${this.title.isChar && this.title.original ? ' — ' + this.title.original : ''}${this.title.year ? ' (' + this.title.year + ')' : ''}` });
    this.later(REVEAL_MS, () => this.nextRound());
    this.broadcast();
  }

  finish() {
    this.clearTimers();
    this.phase = 'end';
    this.roast = roast([...this.players.values()], this.round);
    this.push({ t: 'sys', text: 'Fim de jogo' });
    this.broadcast();
  }

  backToLobby() { this.clearTimers(); this.phase = 'lobby'; this.round = 0; this.broadcast(); }

  // ---------- estado enviado ao cliente ----------
  snapshot(forId) {
    const now = Date.now();
    const T = this.settings.time * 1000;
    let mask = null;
    if (this.phase === 'guessing' && !this.title.isVF) {
      const frac = (now - this.startedAt) / T;
      mask = makeMask(this.title.title, frac >= 0.6 ? 2 : frac >= 0.3 ? 1 : 0);
    }
    const showAll = this.phase === 'reveal' || this.phase === 'end';
    const t = this.title;
    return {
      code: this.code, me: forId, tv: forId === null, roast: this.phase === 'end' ? this.roast : null, screens: this.screens.size, hostId: this.hostId, phase: this.phase,
      needKey: this.needKey(), catalogError: this.catalogError,
      settings: this.settings, round: this.round, rounds: this.settings.rounds,
      pickerId: this.pickerId, endsIn: this.endsAt ? Math.max(0, this.endsAt - now) : 0,
      totalMs: this.phase === 'picking' ? PICK_MS : this.phase === 'reveal' ? REVEAL_MS : T,
      canExtraIn: this.phase === 'guessing' ? Math.max(0, 8000 - (now - this.startedAt)) : 0,
      frameCount: t && this.phase !== 'lobby' && this.phase !== 'loading' ? t.frames.length : 0,
      mode: t && !['lobby', 'loading'].includes(this.phase) ? this.modeOf(t) : null,
      audio: t && t.isMusic && ['picking', 'guessing', 'reveal'].includes(this.phase) ? t.audio : null,
      revealed: (this.revealed || []).map((i) => ({ i, full: t.frames[i].full, thumb: t.frames[i].thumb, start: t.frames[i].start, len: t.frames[i].len, portrait: !!t.frames[i].portrait, scene: !!t.frames[i].scene })),
      allFrames: showAll && t ? t.frames.map((f, i) => ({ i, thumb: f.thumb, full: f.full, scene: !!f.scene })) : null,
      mask,
      answer: showAll && t ? { title: t.title, original: t.original, artist: t.artist || null, year: t.year, kind: t.kind, poster: t.poster, truth: t.isVF ? t.truth : undefined } : null,
      vf: t && t.isVF && ['guessing', 'reveal'].includes(this.phase) ? { text: t.statement, image: t.image, mine: (this.players.get(forId) || {}).vf ? this.players.get(forId).vf.v : null,
        votes: this.phase === 'reveal' ? [...this.players.values()].filter((p) => p.vf).map((p) => ({ id: p.id, v: p.vf.v })) : null } : null,
      portrait: !!(t && t.isChar),
      charWork: t && t.isChar && t.work && ['guessing', 'reveal'].includes(this.phase) ? { name: t.work, kind: t.workKind || '' } : null,
      face: t && t.isChar && ['guessing', 'reveal'].includes(this.phase) ? t.face || null : null,
      players: this.order.map((id) => this.players.get(id)).filter(Boolean).map((p) => ({
        id: p.id, name: p.name, score: p.score, connected: p.connected, guessed: p.guessed, skipped: p.skipped, roundPts: p.roundPts, joinedAt: p.joinedAt,
        isBot: !!p.isBot, shield: !!p.shield, cards: (p.hand || []).length,
        fx: Object.keys(p.fx || {}).filter((k) => p.fx[k] > now), toll: !!p.toll,
      })),
      arcade: this.settings.arcade ? this.arcadeFor(forId, now) : null,
      feed: this.feed.slice(-25).map(({ re, pid, ...f }) => ({ ...f, mine: pid === forId, re: Object.entries(re).map(([e, ids]) => ({ e, n: ids.length, me: ids.includes(forId), who: ids.map((x) => this.players.get(x)?.name).filter(Boolean) })) })),
    };
  }
  arcadeFor(id, now) {
    const p = this.players.get(id); if (!p) return null;
    const t = this.title, live = t && ['guessing', 'reveal'].includes(this.phase);
    const fx = {}; for (const k in p.fx) if (p.fx[k] > now) fx[k] = p.fx[k] - now;
    return {
      hand: p.hand || [], cd: Math.max(0, (p.cdUntil || 0) - now), fx,
      shield: !!p.shield, double: !!p.double, radar: !!p.radar, toll: !!p.toll,
      peek: live ? (p.peek || []).map((i) => ({ i, full: t.frames[i].full, thumb: t.frames[i].thumb, start: t.frames[i].start, len: t.frames[i].len, portrait: !!t.frames[i].portrait, scene: !!t.frames[i].scene })) : [],
      hint: live && p.hint && this.phase === 'guessing' ? makeMask(t.title, 2) + (t.year ? ` · ${t.year}` : '') : null,
    };
  }
  broadcast() {
    for (const p of this.players.values()) {
      for (const sid of p.sockets) this.io.to(sid).emit('state', this.snapshot(p.id));
    }
    if (this.screens.size) { const s = this.snapshot(null); for (const sid of this.screens) this.io.to(sid).emit('state', s); }
  }
}

function getRoom(code) { return rooms.get(String(code || '').toUpperCase()); }
function createRoom(io) { const code = newCode(); const r = new Room(io, code); rooms.set(code, r); return r; }

// limpa salas abandonadas
setInterval(() => {
  for (const [code, r] of rooms) {
    if (!r.humans().length && !r.screens.size && Date.now() - r.touched > 10 * 60 * 1000) { r.clearTimers(); rooms.delete(code); }
  }
}, 60000).unref();

// quantas pessoas estão jogando agora no site todo
function stats() {
  let players = 0, playing = 0, active = 0;
  for (const r of rooms.values()) {
    const n = r.humans().length;
    if (!n) continue;
    active++; players += n;
    if (r.phase !== 'lobby' && r.phase !== 'end') playing += n;
  }
  return { rooms: active, players, playing };
}

module.exports = { getRoom, createRoom, setGlobalCatalog, setGlobalMusic, setGlobalExtras, rooms, stats };
