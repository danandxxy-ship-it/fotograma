/* Fotograma — sons sintetizados na hora (Web Audio). Tema: cabine de projeção. */
window.SFX = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let on = true, vol = 0.8;
  try { on = localStorage.getItem('fg_sound') !== 'off'; const v = localStorage.getItem('fg_vol'); if (v !== null) vol = +v; } catch {}

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 1.2 * vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp).connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }
  // celular só libera áudio depois de um toque
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, init, { passive: true }));

  const ready = () => on && ctx && ctx.state === 'running';
  const T = () => ctx.currentTime;

  function env(g, t, a, peak, dur) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function tone(freq, t, dur, { type = 'sine', vol = 0.3, a = 0.005, glide = 0, dest = master } = {}) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + dur);
    env(g, t, a, vol, dur);
    o.connect(g).connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(t, dur, { vol = 0.3, type = 'bandpass', freq = 2000, q = 1, a = 0.002, sweep = 0 } = {}) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true;
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
    env(g, t, a, vol, dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const S = {
    // projetor ligando: motor sobe + garra puxando a película
    projector() {
      const t = T();
      tone(38, t, 1.6, { type: 'sawtooth', vol: 0.05, a: 0.15, glide: 62 });
      for (let i = 0; i < 26; i++) {
        const tt = t + 0.05 + i * (0.075 - i * 0.0012);
        noise(tt, 0.025, { vol: 0.32 * Math.min(1, (26 - i) / 8), freq: 3200, q: 3 });
        noise(tt, 0.03, { vol: 0.2, type: 'lowpass', freq: 400 });
      }
    },
    // lápis dermatográfico circulando o frame
    pencil() {
      const t = T();
      noise(t, 0.32, { vol: 0.5, freq: 1400, q: 2.5, a: 0.03, sweep: 3600 });
      noise(t + 0.12, 0.2, { vol: 0.3, freq: 2600, q: 4, sweep: 1500 });
    },
    // rolo novo: catraca da bobina
    reel() {
      const t = T();
      for (let i = 0; i < 9; i++) noise(t + i * 0.055, 0.03, { vol: 0.45 - i * 0.025, freq: 1800 + i * 120, q: 6 });
      tone(180, t, 0.5, { type: 'triangle', vol: 0.14, glide: 240 });
    },
    correct() {
      const t = T();
      [784, 988, 1175, 1568].forEach((f, i) => {
        tone(f, t + i * 0.07, 0.6, { type: 'triangle', vol: 0.22 });
        tone(f * 2.01, t + i * 0.07, 0.35, { vol: 0.05 });
      });
    },
    exact() {
      const t = T();
      S.correct();
      [1568, 2093, 2637].forEach((f, i) => tone(f, t + 0.32 + i * 0.06, 0.5, { type: 'triangle', vol: 0.16 }));
      noise(t + 0.32, 0.4, { vol: 0.18, type: 'highpass', freq: 6000 });
    },
    close() {
      const t = T();
      tone(440, t, 0.14, { type: 'square', vol: 0.12 });
      tone(523, t + 0.12, 0.22, { type: 'square', vol: 0.12, glide: 494 });
    },
    wrong() {
      const t = T();
      tone(150, t, 0.22, { type: 'sine', vol: 0.5, glide: 70 });
      noise(t, 0.06, { vol: 0.08, type: 'lowpass', freq: 600 });
    },
    // outra pessoa acertou
    ding() { const t = T(); tone(1319, t, 0.4, { type: 'triangle', vol: 0.22 }); tone(1760, t + 0.06, 0.3, { vol: 0.1 }); },
    tick(last) {
      const t = T();
      tone(last ? 1600 : 1100, t, 0.06, { type: 'square', vol: last ? 0.16 : 0.1 });
      noise(t, 0.02, { vol: 0.15, freq: 5000, q: 2 });
    },
    // dica de letras apareceu
    hint() { const t = T(); noise(t, 0.35, { vol: 0.3, freq: 600, q: 0.8, a: 0.12, sweep: 4000 }); },
    // claquete + acorde de abertura
    reveal() {
      const t = T();
      noise(t, 0.09, { vol: 0.5, type: 'highpass', freq: 1200 });
      tone(90, t, 0.12, { vol: 0.35, glide: 50 });
      [262, 330, 392].forEach((f) => {
        const o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = f;
        lp.type = 'lowpass'; lp.frequency.setValueAtTime(500, t + 0.12); lp.frequency.linearRampToValueAtTime(2200, t + 0.4);
        env(g, t + 0.12, 0.04, 0.07, 0.9);
        o.connect(lp).connect(g).connect(master); o.start(t + 0.12); o.stop(t + 1.1);
      });
    },
    // créditos finais: rufar + acorde maior
    finale() {
      const t = T();
      for (let i = 0; i < 22; i++) noise(t + i * 0.045, 0.05, { vol: 0.05 + i * 0.008, freq: 900, q: 0.7 });
      [262, 330, 392, 523].forEach((f, i) => tone(f, t + 1.05 + i * 0.02, 1.6, { type: 'triangle', vol: 0.15 }));
      noise(t + 1.05, 0.5, { vol: 0.25, type: 'highpass', freq: 5000, a: 0.005 });
    },
    // último lugar: trombone triste (wah wah wah waaah)
    sad() {
      const t = T();
      [[311, 0], [294, 0.42], [277, 0.84]].forEach(([f, d]) => tone(f, t + d, 0.38, { type: 'sawtooth', vol: 0.09, a: 0.03, glide: f * 0.97 }));
      tone(262, t + 1.26, 1.1, { type: 'sawtooth', vol: 0.1, a: 0.03, glide: 233 });
    },
    // alguém entrou na sala: fita crepe
    join() { const t = T(); noise(t, 0.16, { vol: 0.4, freq: 2500, q: 1.2, sweep: 900 }); },
    // arcade: levou um ataque
    zap() {
      const t = T();
      tone(880, t, 0.25, { type: 'sawtooth', vol: 0.16, glide: 110 });
      noise(t, 0.3, { vol: 0.35, freq: 900, q: 1.5, sweep: 200 });
    },
    // usou uma lâmina: slide caindo no projetor
    power() {
      const t = T();
      noise(t, 0.05, { vol: 0.45, type: 'highpass', freq: 2500 });
      tone(330, t + 0.03, 0.3, { type: 'triangle', vol: 0.2, glide: 660 });
      tone(990, t + 0.12, 0.25, { vol: 0.08 });
    },
    // espelho devolveu
    mirror() {
      const t = T();
      [2093, 2637, 3136].forEach((f, i) => tone(f, t + i * 0.04, 0.5, { type: 'sine', vol: 0.1 }));
      noise(t, 0.25, { vol: 0.2, type: 'highpass', freq: 7000 });
    },
    freeze() {
      const t = T();
      for (let i = 0; i < 6; i++) tone(2400 + i * 300, t + i * 0.03, 0.12, { type: 'sine', vol: 0.06 });
      noise(t, 0.4, { vol: 0.25, type: 'highpass', freq: 5000, sweep: 9000 });
    },
    click() { const t = T(); tone(900, t, 0.04, { type: 'square', vol: 0.08 }); },
  };

  return {
    play(name, ...a) { if (ready() && S[name]) try { S[name](...a); } catch {} },
    get on() { return on; },
    get volume() { return vol; },
    setVolume(v) {
      vol = Math.max(0, Math.min(1, v)); try { localStorage.setItem('fg_vol', vol); } catch {}
      if (master) master.gain.setTargetAtTime(1.2 * vol, ctx.currentTime, 0.02);
    },
    toggle() {
      on = !on; try { localStorage.setItem('fg_sound', on ? 'on' : 'off'); } catch {}
      init(); if (on) S.click(); return on;
    },
  };
})();
