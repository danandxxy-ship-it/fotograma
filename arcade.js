/* Fotograma — modo Arcade (cartas de poder) e bots. */
const { check } = require('./matcher');

// ataques vão num adversário; truques são para você mesmo
const VISUAL = ['film', 'game', 'char', 'vf'], TEXT = ['film', 'game', 'char', 'music'];
const POWERS = {
  // ataques visuais (só no modo filme)
  borrao:  { type: 'atk', dur: 12000, modes: VISUAL, name: 'Borrão' },
  virada:  { type: 'atk', dur: 12000, modes: VISUAL, name: 'Tela virada' },
  tinta:   { type: 'atk', dur: 12000, modes: VISUAL, name: 'Tinta na lente' },
  apagao:  { type: 'atk', dur: 10000, modes: VISUAL, name: 'Apagão' },
  // ataques de áudio (só no modo música)
  mudo:    { type: 'atk', dur: 10000, modes: ['music'], name: 'Fone mudo' },
  acelera: { type: 'atk', dur: 12000, modes: ['music'], name: 'Esquilo' },
  // ataques que valem em qualquer modo
  congela: { type: 'atk', dur: 7000, name: 'Congelar' },
  teclado: { type: 'atk', dur: 12000, modes: TEXT, name: 'Teclado doido' },
  pedagio: { type: 'atk', name: 'Pedágio' },
  // truques para si
  espiar:  { type: 'buf', modes: TEXT, name: 'Espiada' },
  dica:    { type: 'buf', modes: TEXT, name: 'Lupa' },
  escudo:  { type: 'buf', name: 'Espelho' },
  dobro:   { type: 'buf', name: 'Dobro' },
  radar:   { type: 'buf', modes: TEXT, name: 'Radar' },
};
const allowed = (k, mode) => !POWERS[k].modes || POWERS[k].modes.includes(mode);
const HAND_MAX = 3;
const COOLDOWN = 3500;

let deckI = 0;
function draw(mode, hand) {
  if (process.env.FG_DECK) { const d = process.env.FG_DECK.split(','); return d[deckI++ % d.length]; } // só para testes
  const pool = Object.keys(POWERS).filter((k) => allowed(k, mode));
  const atk = pool.filter((k) => POWERS[k].type === 'atk'), buf = pool.filter((k) => POWERS[k].type === 'buf');
  for (let i = 0; i < 10; i++) {
    const list = Math.random() < 0.55 ? atk : buf;
    const k = list[Math.floor(Math.random() * list.length)];
    if (hand.filter((h) => h === k).length < 2) return k;
  }
  return pool[0];
}

// ---------- bots ----------
const BOT_NAMES = ['Bot Pipoca', 'Bot Claquete', 'Bot Lanterninha', 'Bot Spoiler', 'Bot Trailer', 'Bot Rolo', 'Bot Pirata'];
const SKILL = { facil: 0.3, medio: 0.55, craque: 0.82 };
const WRONG_FILM = ['Titanic', 'Matrix', 'Friends', 'Avatar', 'Shrek', 'Frozen', 'Vingadores', 'Harry Potter', 'Pokémon', 'Dragon Ball', 'Os Incríveis',
  'O Rei Leão', 'La Casa de Papel', 'Round 6', 'Homem-Aranha', 'Batman', 'Coringa', 'Procurando Nemo', 'One Piece', 'Wandinha', 'Cidade de Deus', 'Tropa de Elite',
  'Jurassic Park', 'Star Wars', 'De Volta para o Futuro', 'Toy Story', 'The Office', 'Game of Thrones', 'Demon Slayer', 'Scooby-Doo'];
const WRONG_MUSIC = ['Anitta', 'Coldplay', 'Beyoncé', 'Marília Mendonça', 'Linkin Park', 'Taylor Swift', 'Drake', 'Daft Punk', 'Madonna', 'Ivete Sangalo',
  'Despacito', 'Thriller', 'Imagine', 'Evidências', 'Hey Jude'];
const WRONG_GAME = ['Minecraft', 'Fortnite', 'Roblox', 'GTA', 'Free Fire', 'League of Legends', 'Valorant', 'FIFA', 'Zelda', 'Mario Kart', 'Call of Duty', 'Sonic', 'Pac-Man', 'Clash Royale'];
const WRONG_CHAR = ['Harry Potter', 'Batman', 'Homem-Aranha', 'Goku', 'Naruto', 'Hermione', 'Jack Sparrow', 'Coringa', 'Elsa', 'Shrek', 'Luffy', 'Sherlock', 'Darth Vader', 'Wandinha'];
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// jeito "humano" de escrever a resposta certa (minúscula, sem acento, às vezes com erro)
function humanize(text, key) {
  const base = String(text).split(':')[0];
  let t = Math.random() < 0.6 ? base.toLowerCase() : base;
  if (Math.random() < 0.5) t = t.normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (Math.random() < 0.3 && t.length > 6) { const i = 2 + Math.floor(Math.random() * (t.length - 3)); t = t.slice(0, i) + t.slice(i + 1); }
  return check(t, key).result === 'correct' ? t : text;
}

class Bots {
  constructor(room) { this.room = room; }
  get list() { return [...this.room.players.values()].filter((p) => p.isBot); }

  add() {
    const r = this.room;
    if (this.list.length >= 7 || r.players.size >= 16) return;
    const used = new Set(this.list.map((b) => b.name));
    const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot ' + (this.list.length + 1);
    const id = 'bot:' + Math.random().toString(36).slice(2, 9);
    r.players.set(id, { id, name, isBot: true, score: 0, connected: true, guessed: false, skipped: false, roundPts: 0, lastGuess: 0, joinedAt: Date.now(), sockets: new Set(), hand: [], fx: {} });
    r.order.push(id);
    r.push({ t: 'sys', text: `${name} entrou na sala` });
    r.broadcast();
  }
  remove(id) {
    const r = this.room, b = r.players.get(id);
    if (!b || !b.isBot) return;
    r.players.delete(id); r.order = r.order.filter((x) => x !== id);
    r.push({ t: 'sys', text: `${b.name} saiu` });
    if (r.phase === 'picking' && r.pickerId === id) r.autoPick();
    r.checkAllGuessed();
    r.broadcast();
  }
  skill() { return SKILL[this.room.settings.botLevel] || SKILL.medio; }

  // projecionista bot
  onPicking() {
    const r = this.room, b = r.players.get(r.pickerId);
    if (!b || !b.isBot) return;
    r.later(rnd(1200, 3000), () => r.pick(b.id, Math.floor(Math.random() * r.title.frames.length)));
  }

  onGuessing() {
    const r = this.room;
    for (const b of this.list) { b.bot = { gen: 0, rolls: 0, knows: false, boost: 0 }; this.plan(b); }
    // projecionista bot solta uma pista extra
    const pb = r.players.get(r.pickerId);
    if (pb && pb.isBot && Math.random() < 0.6) r.later(rnd(10000, 18000), () => {
      const free = r.title.frames.map((_, k) => k).filter((k) => !r.revealed.includes(k));
      if (free.length) r.pick(pb.id, pick(free));
    });
    if (r.settings.arcade) for (const b of this.list) r.later(rnd(2500, 11000), () => this.usePower(b));
  }

  // Verdadeiro ou Falso: cada bot responde sozinho
  onVF() {
    const r = this.room, s = this.skill(), left = r.endsAt - Date.now();
    for (const b of this.list) {
      const right = Math.random() < Math.min(0.92, s + 0.15);
      const go = () => {
        if (r.phase !== 'guessing' || b.vf) return;
        const fr = (b.fx.congela || 0) - Date.now();
        if (fr > 0) return r.later(fr + 300, go);
        r.answerVF(b.id, right ? r.title.truth : !r.title.truth);
      };
      r.later(Math.min(left - 800, rnd(2000, left * (1.2 - s))), go);
    }
    if (r.settings.arcade) for (const b of this.list) r.later(rnd(1500, 6000), () => this.usePower(b));
  }

  onExtraFrame() { for (const b of this.list) if (b.bot && !b.guessed && !b.skipped && !b.bot.knows) this.plan(b); }

  plan(b) {
    const r = this.room;
    if (r.phase !== 'guessing' || b.guessed) return;
    const st = b.bot, gen = ++st.gen, s = this.skill();
    const T = r.settings.time * 1000, left = r.endsAt - Date.now();
    if (!st.knows) st.knows = Math.random() < Math.min(0.95, s + 0.13 * (r.revealed.length - 1) + st.boost);
    const slow = () => (['borrao', 'virada', 'tinta', 'apagao', 'mudo', 'acelera'].some((k) => (b.fx[k] || 0) > Date.now()) ? 4000 : 0);
    const live = (fn) => () => { if (st.gen === gen && r.phase === 'guessing' && !b.guessed) fn(); };
    if (st.knows) {
      const d = Math.min(left - 1500, T * rnd(0.1, 0.5) * (1.35 - s));
      r.later(Math.max(1500, d), live(() => this.guessRight(b, gen)));
    } else {
      const n = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < n; i++) r.later(rnd(3000, Math.max(4000, left * 0.5)) + slow(), live(() => this.guessWrong(b)));
      r.later(Math.max(2000, left * rnd(0.5, 0.8)), live(() => { if (!b.skipped) r.skip(b.id); }));
    }
  }

  guessRight(b, gen) {
    const r = this.room, now = Date.now();
    const frozen = (b.fx.congela || 0) - now;
    const slow = ['borrao', 'virada', 'tinta', 'apagao', 'mudo', 'acelera'].some((k) => (b.fx[k] || 0) > now);
    if (frozen > 0 || (slow && !b.bot.waited)) {
      b.bot.waited = true;
      return r.later(Math.max(frozen + 300, slow ? 3500 : 0), () => { if (b.bot.gen === gen && r.phase === 'guessing' && !b.guessed) this.guessRight(b, gen); });
    }
    const t = r.title;
    const useArtist = t.isMusic && Math.random() < 0.3;
    const text = useArtist ? humanize(t.artist, r.artistKey) : humanize(Math.random() < 0.8 ? t.title : t.titles[1] || t.title, r.key);
    if (b.skipped) b.skipped = false;
    r.guess(b.id, text);
  }
  guessWrong(b) {
    const r = this.room;
    const pool = r.title.isMusic ? WRONG_MUSIC : r.title.isGame ? WRONG_GAME : r.title.isChar ? WRONG_CHAR : WRONG_FILM;
    for (let i = 0; i < 6; i++) {
      const g = pick(pool);
      if (check(g, r.key).result === 'wrong' && (!r.artistKey || check(g, r.artistKey).result === 'wrong')) { r.guess(b.id, Math.random() < 0.5 ? g.toLowerCase() : g); return; }
    }
  }
  // só sobraram bots: resolvem rápido para não travar a rodada
  hurry() {
    const r = this.room;
    if (r.title && r.title.isVF) {
      for (const b of this.list) if (!b.vf) r.later(rnd(700, 2000), () => { if (r.phase === 'guessing' && !b.vf) r.answerVF(b.id, Math.random() < this.skill() + 0.15 ? r.title.truth : !r.title.truth); });
      return;
    }
    for (const b of this.list) {
      if (b.guessed || b.skipped || !b.bot) continue;
      const gen = ++b.bot.gen;
      r.later(rnd(800, 2500), () => {
        if (b.bot.gen !== gen || r.phase !== 'guessing' || b.guessed) return;
        if (b.bot.knows || Math.random() < this.skill() * 0.5) this.guessRight(b, gen); else r.skip(b.id);
      });
    }
  }

  usePower(b) {
    const r = this.room;
    if (r.phase !== 'guessing' || !b.hand || !b.hand.length) return;
    if (Math.random() < 0.25) return; // às vezes guarda a carta
    const buffs = b.hand.filter((k) => POWERS[k].type === 'buf'), atks = b.hand.filter((k) => POWERS[k].type === 'atk');
    const all = r.connected().filter((p) => p.id !== b.id && !p.guessed);
    const foes = all.some((p) => !p.skipped) ? all.filter((p) => !p.skipped) : all;
    let card, target = null;
    if (b.hand.includes('escudo') && !b.shield) card = 'escudo';
    else if (atks.length && foes.length && (Math.random() < 0.6 || !buffs.length)) {
      card = pick(atks);
      // prefere quem está liderando, e gente de verdade
      foes.sort((x, y) => (y.score + (y.isBot ? 0 : 150) + Math.random() * 120) - (x.score + (x.isBot ? 0 : 150) + Math.random() * 120));
      target = foes[0].id;
    } else if (buffs.length && !b.guessed) card = pick(buffs.filter((k) => k !== 'escudo').concat(buffs).slice(0, 3));
    if (!card) return;
    r.usePower(b.id, card, target);
    if (['espiar', 'dica'].includes(card) && b.bot && !b.bot.knows) { b.bot.boost += 0.25; this.plan(b); }
    if (b.hand.length && Math.random() < 0.5) r.later(rnd(5000, 12000), () => this.usePower(b));
  }
}

module.exports = { POWERS, HAND_MAX, COOLDOWN, draw, allowed, Bots };
