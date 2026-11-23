/* Fotograma na TV — tela de transmissão: só mostra, quem joga é o celular */
(() => {
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const socket = io({ transports: ['websocket', 'polling'] });
  const params = new URLSearchParams(location.search);
  let S = null, stateAt = 0, code = null;

  // ---------- palco 1920×1080 escalado ----------
  const fit = () => document.documentElement.style.setProperty('--k', Math.min(innerWidth / 1920, innerHeight / 1080));
  addEventListener('resize', fit); fit();

  // ---------- áudio (músicas tocam na TV) ----------
  const aud = new Audio(); aud.preload = 'auto';
  let segTimer = null, audUrl = '';
  aud.addEventListener('play', () => $('#t-vinyl').classList.add('playing'));
  ['pause', 'ended'].forEach((ev) => aud.addEventListener(ev, () => $('#t-vinyl').classList.remove('playing')));
  const SILENT = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
  let unlocked = false;
  const unlock = () => {
    if (unlocked) return; unlocked = true;
    aud.src = SILENT; audUrl = ''; aud.play().then(() => aud.pause()).catch(() => {});
  };
  addEventListener('pointerdown', unlock); addEventListener('keydown', unlock);
  const stopAudio = () => { clearTimeout(segTimer); try { aud.pause(); } catch {} };
  const loadAudio = (u) => { if (u && audUrl !== u) { audUrl = u; aud.src = u; aud.load(); } };
  function playSeg(start, len) {
    if (!S || !S.audio) return;
    stopAudio(); loadAudio(S.audio); aud.volume = 1;
    const go = () => { try { aud.currentTime = start; } catch {} aud.play().catch(() => {}); segTimer = setTimeout(() => aud.pause(), len * 1000); };
    if (aud.readyState >= 1) go(); else aud.addEventListener('loadedmetadata', go, { once: true });
  }

  // ---------- ligar ----------
  const connectTo = (c) => { $('#start-msg').textContent = ''; socket.emit('screen', c ? { code: c } : {}); };
  $('#b-new').onclick = () => { unlock(); goFull(); connectTo(null); };
  $('#f-code').onsubmit = (e) => {
    e.preventDefault(); unlock(); goFull();
    const c = $('#in-code').value.trim().toUpperCase();
    if (!/^[A-Z]{4}$/.test(c)) { $('#start-msg').textContent = 'O código tem 4 letras.'; return; }
    connectTo(c);
  };
  function goFull() { const d = document.documentElement; try { (d.requestFullscreen || d.webkitRequestFullscreen)?.call(d).catch?.(() => {}); } catch {} }
  if (params.get('sala')) $('#in-code').value = params.get('sala').toUpperCase().slice(0, 4);

  socket.on('screenOk', ({ code: c }) => {
    code = c; history.replaceState(null, '', '/tv?sala=' + c);
    $('#t-url').textContent = location.host;
    for (const id of ['#qr-big', '#qr-mini']) $(id).src = '/qr/' + c + '.svg';
    $('#t-code-big').textContent = c; $('#t-code-mini').textContent = c;
    $('#t-start').hidden = true; $('#t-room').hidden = false;
  });
  socket.on('fail', (m) => { $('#start-msg').textContent = m; $('#t-start').hidden = false; $('#t-room').hidden = true; });
  socket.on('connect', () => { $('#t-off').hidden = true; const c = code || params.get('sala'); if (c) connectTo(c); });
  socket.on('disconnect', () => { if (code) $('#t-off').hidden = false; });

  // controle remoto da TV / teclado / gamepad na tela inicial
  addEventListener('keydown', (e) => {
    if ($('#t-start').hidden) return;
    const list = [$('#b-new'), $('#in-code'), $('#f-code button')];
    const i = list.indexOf(document.activeElement);
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) { list[(i + 1) % list.length].focus(); e.preventDefault(); }
    if (['ArrowLeft', 'ArrowUp'].includes(e.key) && document.activeElement !== $('#in-code')) { list[(i + list.length - 1) % list.length].focus(); e.preventDefault(); }
  });
  let padPrev = {};
  (function pad() {
    for (const g of navigator.getGamepads ? navigator.getGamepads() : []) {
      if (!g) continue;
      const a = g.buttons[0]?.pressed;
      if (a && !padPrev[g.index] && !$('#t-start').hidden) document.activeElement?.click?.();
      padPrev[g.index] = a;
    }
    requestAnimationFrame(pad);
  })();

  // ---------- estado ----------
  const nameOf = (id) => (S.players.find((p) => p.id === id) || {}).name || 'alguém';
  const rot = (i) => (((i * 37) % 7) - 3) * 0.45 + 'deg';
  socket.on('state', (st) => {
    const prev = S; S = st; stateAt = performance.now();
    sounds(prev, st);
    render(prev);
  });

  const MODE = { filmes: 'Filmes', series: 'Séries', animes: 'Animes', desenhos: 'Desenhos', musicas: 'Músicas', games: 'Games', personagens: 'Personagens', vf: 'Verdadeiro ou falso' };
  const DIFF = { facil: 'só sucessos', medio: 'misturado', dificil: 'nível cinéfilo' };
  function render(prev) {
    const ph = S.phase;
    $('#t-lobby').hidden = ph !== 'lobby';
    $('#t-game').hidden = ph === 'lobby' || ph === 'end';
    $('#t-end').hidden = ph !== 'end';
    $('#t-reel').hidden = !['picking', 'guessing', 'reveal'].includes(ph);
    if (ph === 'lobby') return renderLobby();
    if (ph === 'end') return renderEnd();
    renderGame(prev);
  }

  function renderLobby() {
    $('#t-ask').textContent = 'Entrem na sala!';
    $('#t-round').textContent = '';
    const humans = S.players.filter((p) => !p.isBot);
    $('#t-lobby-players').innerHTML = S.players.length
      ? S.players.map((p, i) => `<li class="${p.isBot ? 'bot' : ''}" style="--r:${rot(i)}">${esc(p.name)}${p.id === S.hostId ? '<small>anfitrião</small>' : ''}${p.isBot ? '<small>bot</small>' : ''}</li>`).join('')
      : '';
    $('#t-lobby-hint').textContent = !humans.length
      ? 'Ninguém ainda. Quem entrar primeiro vira o anfitrião e escolhe o modo pelo celular.'
      : `${nameOf(S.hostId)} escolhe o modo e roda o filme pelo celular.`;
    const st = S.settings;
    $('#t-setup').textContent = humans.length ? `${st.cats.map((c) => MODE[c] || c).join(', ')}. ${st.rounds} rodadas de ${st.time} s${DIFF[st.diff] ? ', ' + DIFF[st.diff] : ''}${st.arcade ? '. Modo arcade' : ''}.` : '';
  }

  function renderEnd() {
    $('#t-ask').textContent = 'Os créditos';
    $('#t-round').textContent = '';
    const ranked = [...S.players].sort((a, b) => b.score - a.score);
    const k = ranked.map((p) => p.id + p.score).join();
    if ($('#t-credits').dataset.k !== k) {
      $('#t-credits').dataset.k = k;
      $('#t-credits').innerHTML = ranked.slice(0, 8).map((p, i) => `<li style="--i:${ranked.length - i};--r:${rot(i)}"><span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('');
    }
    $('#t-end-hint').textContent = `${nameOf(S.hostId)} pode jogar de novo pelo celular.`;
  }

  const CLUE = { film: 'o frame', game: 'a captura', char: 'a foto', music: 'o trecho' };
  const ASK = { film: 'Que obra é essa?', game: 'Que jogo é esse?', char: 'Quem é esse personagem?', music: 'Que música é essa?', vf: 'Verdadeiro ou falso?' };
  const PREP = { filme: 'do filme', 'série': 'da série', anime: 'do anime', 'mangá': 'do mangá', desenho: 'do desenho' };
  function renderGame(prev) {
    const ph = S.phase, mode = S.mode || 'film', music = mode === 'music', isVF = mode === 'vf';
    $('#t-round').textContent = `Rodada ${S.round} de ${S.rounds}`;
    $('#t-edge').textContent = `FG 400 ▸ ROLO ${S.round}`;
    $('#t-ask').textContent = ph === 'loading' ? 'Trocando o rolo…' : ph === 'picking' ? `${nameOf(S.pickerId)} escolhe ${CLUE[mode] || 'o frame'}` : ph === 'reveal' ? 'Revelado!' : ASK[mode] || ASK.film;

    const scr = $('#t-screen'), img = $('#t-frame'), bg = $('#t-bg');
    const latest = S.revealed[S.revealed.length - 1];
    const live = ph === 'guessing' || ph === 'reveal';
    // personagem: de onde ele é
    $('#t-work').hidden = !(S.charWork && live);
    if (S.charWork) $('#t-work').innerHTML = `Personagem ${PREP[S.charWork.kind] || 'de'} <b>${esc(S.charWork.name)}</b>`;
    // vinil
    $('#t-vinyl').hidden = !(music && live);
    // V ou F
    const showVF = isVF && !!S.vf;
    $('#t-vf').hidden = !showVF;
    if (showVF) {
      $('#t-vf-text').textContent = S.vf.text;
      $('#t-vf').style.backgroundImage = S.vf.image ? `url("${S.vf.image}")` : '';
      $('#t-vf').classList.toggle('img', !!S.vf.image);
      const humans = S.players.filter((p) => p.connected);
      const votes = S.vf.votes;
      $('#t-vf-count').textContent = votes ? `${votes.filter((x) => x.v).length} disseram verdadeiro, ${votes.filter((x) => !x.v).length} falso`
        : `${humans.filter((p) => p.guessed).length} de ${humans.length} responderam`;
    }
    const stamp = $('#t-stamp');
    if (isVF && ph === 'reveal' && S.answer) {
      const v = S.answer.truth;
      if (stamp.hidden) { stamp.hidden = false; stamp.className = 'stamp ' + (v ? 'v' : 'f'); stamp.textContent = v ? 'VERDADEIRO' : 'FALSO'; }
    } else stamp.hidden = true;
    // frame
    const showImg = !music && !isVF && latest && live;
    img.hidden = bg.hidden = !showImg;
    $('#t-face').hidden = !(showImg && S.face && latest.scene);
    if (S.face && $('#t-face-img').dataset.src !== S.face) { $('#t-face-img').dataset.src = S.face; $('#t-face-img').src = S.face; }
    if (showImg && img.dataset.src !== latest.full) {
      img.dataset.src = latest.full; img.src = latest.full; bg.src = latest.thumb || latest.full;
      scr.classList.remove('flick'); void scr.offsetWidth; scr.classList.add('flick');
    }
    if (!showImg) img.dataset.src = '';
    const empty = !showImg && !(music && live) && !showVF;
    $('#t-empty').hidden = !empty;
    if (empty) $('#t-empty-msg').textContent = ph === 'loading' ? 'Trocando o rolo…'
      : ph === 'picking' ? `${nameOf(S.pickerId)} está escolhendo ${CLUE[mode] || 'o frame'} no celular…` : 'Preparando a próxima…';
    // resposta
    const ans = $('#t-answer');
    const showAns = !!S.answer && ph === 'reveal' && !isVF;
    ans.hidden = !showAns;
    if (showAns) {
      $('#t-ans-kind').textContent = [S.answer.kind, S.answer.year].filter(Boolean).join(', ');
      $('#t-ans-title').textContent = S.answer.title;
      $('#t-ans-orig').textContent = S.answer.artist || (S.answer.original && S.answer.original !== S.answer.title ? S.answer.original : '');
      ans.classList.toggle('sq', music); ans.classList.toggle('gm', mode === 'game');
      const p = $('#t-poster'); if (S.answer.poster) { if (p.src !== S.answer.poster) p.src = S.answer.poster; p.hidden = false; } else p.hidden = true;
    }
    $('#t-vf').classList.toggle('done', isVF && ph === 'reveal' && !!S.answer);
    if (isVF && ph === 'reveal' && S.answer) { $('#t-vf-text').textContent = S.answer.original || S.vf?.text || ''; }

    // máscara e película
    $('#t-mask').textContent = isVF ? '' : ph === 'reveal' ? '' : S.mask || '';
    const n = S.frameCount || 0;
    const on = new Set(S.revealed.map((r) => r.i));
    const fresh = new Set(prev && prev.round === S.round ? S.revealed.filter((r) => !prev.revealed.some((q) => q.i === r.i)).map((r) => r.i) : []);
    $('#t-cells').innerHTML = isVF ? '' : Array.from({ length: n }, (_, i) => `<li class="${on.has(i) ? 'on' : ''}${fresh.has(i) ? ' fresh' : ''}">${i + 1}${'ABCDEFGH'[i] || ''}</li>`).join('');

    // placar
    const ranked = [...S.players].sort((a, b) => b.score - a.score);
    const board = $('#t-score');
    board.classList.toggle('many', ranked.length > 8);
    board.innerHTML = ranked.map((p, i) => {
      const vfWait = isVF && ph === 'guessing';
      const cls = [!vfWait && p.guessed ? 'done' : '', p.skipped ? 'skip' : '', p.connected ? '' : 'off', p.isBot ? 'bot' : ''].join(' ');
      const note = p.id === S.pickerId && !isVF ? 'projecionista' : vfWait && p.guessed ? 'respondeu' : p.skipped ? 'não sabe' : !p.connected ? 'sem conexão' : '';
      return `<li class="${cls}" style="--r:${rot(i)}"><span>${esc(p.name)}</span><b>${p.score}</b>${note ? `<em>${note}</em>` : ''}${ph === 'reveal' && p.roundPts ? `<i class="pts">+${p.roundPts}</i>` : ''}</li>`;
    }).join('');

    // últimos acontecimentos
    // só o que aconteceu nesta rodada (a resposta revelada fecha cada rodada no feed)
    const cuts = S.feed.map((f, i) => (f.t === 'answer' || f.text === 'Partida começou' ? i : -1)).filter((i) => i >= 0);
    const from = ph === 'reveal' ? (cuts.length > 1 ? cuts[cuts.length - 2] : -1) : (cuts.length ? cuts[cuts.length - 1] : -1);
    const items = S.feed.slice(from + 1).filter((f) => ['ok', 'close', 'power', 'skip', 'guess'].includes(f.t)).slice(-2);
    $('#t-feed').innerHTML = items.map((f) => f.t === 'guess' ? `<li><b>${esc(f.who)}:</b> ${esc(f.text)}</li>` : `<li class="${f.t}">${esc(f.text)}</li>`).join('');
  }

  // ---------- sons ----------
  function sounds(prev, st) {
    if (!prev) return;
    const ph = st.phase, pph = prev.phase;
    if (ph !== pph) {
      if (ph === 'picking') SFX.play('reel');
      if (ph === 'reveal') SFX.play('reveal');
      if (ph === 'end') SFX.play('finale');
      if (ph === 'reveal' && st.mode === 'music') setTimeout(() => { if (S && S.phase === 'reveal') playSeg(0, 30); }, 1100);
      if (ph !== 'guessing' && ph !== 'reveal') stopAudio();
    }
    if (st.mode === 'music' && ph === 'picking' && st.audio) loadAudio(st.audio);
    const nPrev = pph === 'lobby' || prev.round !== st.round ? 0 : (prev.revealed || []).length;
    if (ph === 'guessing' && st.revealed.length > nPrev) {
      SFX.play('pencil');
      if (st.mode === 'music') { const r = st.revealed[st.revealed.length - 1]; setTimeout(() => playSeg(r.start, r.len), 350); }
      else setTimeout(() => SFX.play('projector'), 260);
    }
    if (ph === 'guessing' && st.mask && st.mask !== prev.mask) SFX.play('hint');
    if (ph === 'lobby' && st.players.length > prev.players.length) SFX.play('join');
    const lastAt = prev.feed.length ? prev.feed[prev.feed.length - 1].at : 0;
    if (st.feed.some((f) => f.at > lastAt && f.t === 'ok')) SFX.play('ding');
  }

  // ---------- relógio ----------
  let lastSec = -1;
  (function tick() {
    if (S && ['picking', 'guessing', 'reveal'].includes(S.phase)) {
      const left = Math.max(0, S.endsIn - (performance.now() - stateAt));
      const sec = Math.ceil(left / 1000);
      $('#t-timer').textContent = sec;
      $('#t-sweep').style.strokeDasharray = `${((S.totalMs ? left / S.totalMs : 0) * 100).toFixed(2)} 100`;
      const hurry = S.phase === 'guessing' && sec <= 10;
      $('#t-reel').classList.toggle('hurry', hurry);
      if (hurry && sec > 0 && sec !== lastSec) SFX.play('tick', sec <= 3);
      lastSec = sec;
    }
    requestAnimationFrame(tick);
  })();

  // ---------- reações e poderes ----------
  socket.on('react', (r) => {
    const layer = $('#t-reacts');
    if (layer.childElementCount > 30) layer.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'react-pop';
    el.style.left = (4 + Math.random() * 86) + '%';
    el.style.setProperty('--rot', (Math.random() * 30 - 15) + 'deg');
    el.innerHTML = `<b>${esc(r.e)}</b><span>${esc(r.name)}</span>`;
    layer.appendChild(el);
    el.addEventListener('animationend', (ev) => { if (ev.target === el) el.remove(); });
  });
  const POW = { borrao: 'Borrão', virada: 'Tela virada', tinta: 'Tinta na lente', apagao: 'Apagão', mudo: 'Fone mudo', acelera: 'Esquilo', congela: 'Congelar', teclado: 'Teclado doido', pedagio: 'Pedágio', espiar: 'Espiada', dica: 'Lupa', escudo: 'Espelho', dobro: 'Dobro', radar: 'Radar' };
  const ATK = new Set(['borrao', 'virada', 'tinta', 'apagao', 'mudo', 'acelera', 'congela', 'teclado', 'pedagio']);
  let toastT = null;
  socket.on('power', (ev) => {
    if (!S) return;
    const name = POW[ev.card] || 'poder';
    const txt = ev.blocked ? `Espelho contra espelho: ${name} anulado`
      : ev.bounced ? `${name} de ${nameOf(ev.from)} bateu no espelho de ${nameOf(ev.via)}!`
      : ATK.has(ev.card) ? `${nameOf(ev.from)} jogou ${name} em ${nameOf(ev.to)}` : `${nameOf(ev.from)} usou ${name}`;
    const el = $('#t-toast'); el.textContent = txt; el.hidden = false;
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 3200);
    SFX.play(ev.bounced || ev.blocked ? 'mirror' : ev.card === 'congela' ? 'freeze' : ATK.has(ev.card) ? 'zap' : 'power');
  });

  // tela da TV não deve apagar
  if (navigator.wakeLock) {
    const lock = () => navigator.wakeLock.request('screen').catch(() => {});
    addEventListener('pointerdown', lock, { once: true });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') lock(); });
  }
})();
