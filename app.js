/* Fotograma — cliente */
(() => {
  const $ = (s) => document.querySelector(s);
  const store = {
    get(k) { try { return localStorage.getItem('fg_' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('fg_' + k, v); } catch {} },
  };
  const socket = io({ transports: ['websocket', 'polling'] });
  let S = null; // último estado
  let stateAt = 0;
  let lastRevealKey = '';
  let lastPhase = '';
  let token = store.get('token') || '';
  let myCode = null;
  let inRoom = false;

  // ---------- letreiro: letras de painel com leve inclinação ----------
  (() => {
    const b = $('#title-board'); const txt = b.textContent.trim();
    b.innerHTML = [...txt].map((c, i) => `<span class="lt" aria-hidden="true" style="--i:${i};--r:${((i * 37) % 7 - 3) * 0.8}deg">${c.toUpperCase()}</span>`).join('');
  })();

  // ---------- entrada ----------
  const params = new URLSearchParams(location.search);
  $('#in-name').value = store.get('name') || '';
  if (params.get('sala')) $('#in-code').value = params.get('sala').toUpperCase().slice(0, 4);
  const nameOk = () => {
    const n = $('#in-name').value.trim();
    if (!n) { $('#home-msg').textContent = 'Escreva seu nome primeiro.'; $('#in-name').focus(); return null; }
    store.set('name', n); return n;
  };
  $('#m-create').onclick = () => { const n = nameOk(); if (n) { SFX.play('reel'); socket.emit('create', { name: n, token }); } };
  document.querySelectorAll('.ticket, .tile').forEach((b) => b.addEventListener('focus', () => SFX.play('click')));
  $('#m-join').onclick = () => {
    const open = $('#f-join').hidden;
    $('#f-join').hidden = !open; $('#m-join').setAttribute('aria-expanded', open);
    if (open) { $('#in-code').focus(); SFX.play('pencil'); }
  };
  if (params.get('sala')) { $('#f-join').hidden = false; $('#m-join').setAttribute('aria-expanded', 'true'); }
  $('#f-join').onsubmit = (e) => {
    e.preventDefault();
    const n = nameOk(); if (!n) return;
    const code = $('#in-code').value.trim().toUpperCase();
    if (code.length !== 4) { $('#home-msg').textContent = 'O código da sala tem 4 letras.'; $('#in-code').focus(); return; }
    socket.emit('join', { name: n, code, token });
  };
  socket.on('joined', ({ code, token: t }) => {
    inRoom = true; token = t; myCode = code; store.set('token', t); store.set('room', code);
    history.replaceState(null, '', '?sala=' + code);
  });
  socket.on('fail', (m) => { ($('#v-home').hidden ? $('#lobby-msg') : $('#home-msg')).textContent = m; });
  socket.on('stats', (st) => {
    $('#live-count').textContent = st.players
      ? `${st.players} ${st.players === 1 ? 'pessoa jogando' : 'pessoas jogando'} agora em ${st.rooms} ${st.rooms === 1 ? 'sala' : 'salas'}` + (st.playing ? `, ${st.playing} no meio de uma partida` : '')
      : 'Nenhuma sala aberta agora. Abra a primeira!';
  });
  socket.on('keyOk', () => { $('#lobby-msg').textContent = ''; });
  // reconexão automática (celular bloqueou a tela, Wi-Fi caiu…)
  socket.on('connect', () => {
    const code = myCode || params.get('sala');
    const name = store.get('name');
    if (code && name && token && (myCode || store.get('room') === code)) socket.emit('join', { name, code, token });
  });

  // ---------- lobby ----------
  $('#b-share').onclick = async () => {
    const url = location.origin + '/?sala=' + S.code;
    try {
      if (navigator.share) await navigator.share({ title: 'Fotograma', text: `Bora adivinhar filmes pelo frame! Sala ${S.code}`, url });
      else { await navigator.clipboard.writeText(url); $('#b-share').textContent = 'Link copiado'; setTimeout(() => ($('#b-share').textContent = 'Chamar amigos'), 1800); }
    } catch {}
  };
  const sendSettings = (patch) => socket.emit('settings', { ...S.settings, ...patch });
  $('#opt-cats').onclick = (e) => {
    const b = e.target.closest('button'); if (!b || !isHost()) return;
    let set = new Set(S.settings.cats);
    if (b.dataset.v === 'musicas') set = new Set(set.has('musicas') ? ['filmes', 'series', 'animes', 'desenhos'] : ['musicas']);
    else { set.delete('musicas'); set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v); }
    if (set.size) sendSettings({ cats: [...set] });
  };
  for (const [id, key] of [['#opt-rounds', 'rounds'], ['#opt-time', 'time'], ['#opt-diff', 'diff'], ['#opt-music', 'musicStyle']]) {
    $(id).onclick = (e) => { const b = e.target.closest('button'); if (b && isHost()) sendSettings({ [key]: b.dataset.v }); };
  }
  $('#b-key').onclick = () => { const k = $('#in-key').value.trim(); if (k) { $('#lobby-msg').textContent = 'Testando a chave…'; socket.emit('key', k); } };
  $('#b-start').onclick = () => socket.emit('start');
  $('#b-again').onclick = () => socket.emit('start');
  $('#b-tolobby').onclick = () => socket.emit('lobby');

  // ---------- jogo ----------
  $('#cells').onclick = (e) => {
    const b = e.target.closest('.cell'); if (!b) return;
    if (S && S.mode === 'music' && b.classList.contains('lit')) { // trecho já tocado: ouvir de novo
      const r = S.revealed.find((x) => x.i === +b.dataset.i); if (r) playSeg(r.start, r.len); return;
    }
    if (b.disabled) return;
    socket.emit('pick', +b.dataset.i);
  };
  $('#f-guess').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#in-guess').value.trim(); if (!v) return;
    socket.emit('guess', v); $('#in-guess').value = '';
  };
  // ---------- palpite por voz (Web Speech API, Chrome do Android) ----------
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false;
  const micBtn = $('#b-mic');
  function micState(on) {
    listening = on; micBtn.setAttribute('aria-pressed', String(on));
    micBtn.setAttribute('aria-label', on ? 'Parar de ouvir' : 'Falar o palpite');
    $('#in-guess').classList.toggle('listening', on);
    if (on) $('#in-guess').placeholder = 'Ouvindo… fale o nome';
  }
  function micInfo(t) { const el = $('#skipinfo'); el.textContent = t; clearTimeout(micInfo.t); micInfo.t = setTimeout(() => { if (el.textContent === t) el.textContent = ''; }, 3500); }
  function stopMic() { if (rec && listening) { try { rec.stop(); } catch {} } }
  function startMic() {
    if (!Rec || listening || micBtn.disabled) return;
    stopAudio(); // não deixa o microfone ouvir a música do jogo
    rec = new Rec();
    rec.lang = 'pt-BR'; rec.interimResults = true; rec.maxAlternatives = 5; rec.continuous = false;
    let sent = false, last = [], quiet = null;
    const send = () => {
      clearTimeout(quiet);
      if (sent || !last.length) return;
      sent = true;
      socket.emit('guess', { text: last[0], alts: last.slice(1) });
      $('#in-guess').value = ''; SFX.play('click');
    };
    rec.onresult = (e) => {
      const res = e.results[e.results.length - 1];
      last = Array.from(res).map((a) => a.transcript.trim()).filter(Boolean);
      $('#in-guess').value = last[0] || '';
      if (res.isFinal) { send(); try { rec.stop(); } catch {} return; }
      // Android às vezes não marca como final: 1,2 s sem mudar o texto já conta como palpite
      clearTimeout(quiet); quiet = setTimeout(() => { send(); try { rec.stop(); } catch {} }, 1200);
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') micInfo('Libere o microfone para este site nas permissões do navegador.');
      else if (e.error === 'no-speech') micInfo('Não ouvi nada. Toque no microfone e fale de novo.');
      else if (e.error === 'network') micInfo('O reconhecimento de voz precisa de internet.');
    };
    rec.onend = () => { send(); micState(false); if (S) render(); }; // fechou o microfone: o que ouviu vira palpite
    try { rec.start(); micState(true); SFX.play('click'); buzz(15); } catch { micState(false); }
  }
  if (Rec) micBtn.hidden = false;
  micBtn.onclick = () => (listening ? stopMic() : startMic());

  let vTimer;
  socket.on('verdict', (v) => {
    const r = v.result;
    const el = $('#verdict');
    el.textContent = r === 'correct' ? (v.artistOnly ? 'Artista certo!' : v.exact ? 'Título exato!' : v.place === 1 ? 'Primeiro!' : 'Acertou!') : r === 'close' ? 'Quase!' : 'Não é…';
    el.className = 'verdict show ' + r;
    if (r === 'correct') {
      const parts = [];
      if (v.placeBonus) parts.push(`${v.place}º lugar +${v.placeBonus}`);
      if (v.exactBonus) parts.push(`título exato +${v.exactBonus}`);
      if (v.artistOnly) parts.push('só o artista, vale 60%');
      $('#bonus').textContent = `+${v.pts} pontos` + (parts.length ? ` (${parts.join(', ')})` : '');
      $('#bonus').hidden = false;
    }
    clearTimeout(vTimer); vTimer = setTimeout(() => (el.className = 'verdict'), 1600);
    SFX.play(r === 'correct' ? (v.exact ? 'exact' : 'correct') : r === 'close' ? 'close' : 'wrong');
    buzz(r === 'correct' ? [30, 40, 60] : r === 'close' ? 25 : 10);
  });

  const isHost = () => S && S.hostId === S.me;
  const me = () => S.players.find((p) => p.id === S.me) || { score: 0 };
  const nameOf = (id) => (S.players.find((p) => p.id === id) || {}).name || '—';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let localView = null; // tela aberta pelo jogador (Como jogar, Ajustes) por cima do estado da sala
  function show(view) {
    const v = localView || view;
    for (const k of ['home', 'lobby', 'game', 'end', 'howto', 'settings']) $('#v-' + k).hidden = k !== v;
  }
  const openLocal = (v) => { localView = v; $('#pause').hidden = true; show(v); window.scrollTo(0, 0); };
  const closeLocal = () => { localView = null; if (S) render(S); else show('home'); };
  document.querySelectorAll('[data-open]').forEach((b) => (b.onclick = () => openLocal(b.dataset.open)));
  document.querySelectorAll('[data-back]').forEach((b) => (b.onclick = closeLocal));

  // não sei / quem está na sala
  $('#b-skip').onclick = () => { socket.emit('skip'); SFX.play('click'); };
  function statusOf(p) {
    if (!p.connected) return ['Sem conexão', ''];
    const ph = S.phase;
    if (ph === 'lobby') return [p.id === S.hostId ? 'Anfitrião, decide quando começa' : 'Esperando começar', ''];
    if (ph === 'loading') return ['Trocando o rolo', ''];
    if (ph === 'picking') return [p.id === S.pickerId ? 'Escolhendo o frame' : 'Esperando o frame', ''];
    if (ph === 'guessing') {
      if (p.guessed) return [`Acertou, +${p.roundPts}`, 'ok'];
      if (p.skipped) return ['Passou a vez', ''];
      return [p.id === S.pickerId ? 'Projecionista, também pode chutar' : 'Pensando…', ''];
    }
    if (ph === 'reveal') return [p.roundPts ? `+${p.roundPts} nesta rodada` : 'Não pontuou nesta rodada', p.roundPts ? 'ok' : ''];
    return [`${p.score} pontos no total`, ''];
  }
  function renderPeople() {
    const ranked = [...S.players].sort((a, b) => b.score - a.score || a.joinedAt - b.joinedAt);
    const online = S.players.filter((p) => p.connected).length;
    const inGame = !['lobby', 'end'].includes(S.phase);
    $('#people-sum').textContent = `${S.players.length} na sala, ${online} conectados` + (inGame ? `. Rodada ${S.round} de ${S.rounds}.` : '.');
    $('#people-list').innerHTML = ranked.map((p) => {
      const [st, cls] = statusOf(p);
      return `<li class="${p.connected ? '' : 'off'}"><span class="dot"></span><span class="nm">${esc(p.name)}${p.id === S.me ? '<span class="me">você</span>' : ''}${p.id === S.hostId ? '<span class="host">anfitrião</span>' : ''}</span><span class="pts">${p.score}</span><span class="st ${cls}">${st}</span></li>`;
    }).join('');
  }
  const people = (open) => { $('#people').hidden = !open; if (open) { renderPeople(); $('#people-close').focus(); } };
  $('#b-people').onclick = () => people(true);
  $('#people-close').onclick = () => people(false);
  $('#people').onclick = (e) => { if (e.target.id === 'people') people(false); };

  // menu dentro da partida
  const pause = (open) => { $('#pause').hidden = !open; if (open) $('#p-resume').focus(); };
  $('#b-gmenu').onclick = () => pause(true);
  $('#p-resume').onclick = () => pause(false);
  $('#pause').onclick = (e) => { if (e.target.id === 'pause') pause(false); };
  $('#p-sound').onclick = () => { SFX.toggle(); paintSound(); };
  $('#p-howto').onclick = () => openLocal('howto');
  function leave() {
    socket.emit('leave');
    stopAudio(); inRoom = false; S = null; myCode = null; localView = null; store.set('room', '');
    history.replaceState(null, '', '/');
    pause(false); $('#f-join').hidden = true; $('#in-code').value = '';
    show('home');
  }
  $('#p-leave').onclick = leave;
  $('#b-lobbyleave').onclick = leave;
  $('#b-endleave').onclick = leave;
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#people').hidden) people(false);
    else if (!$('#pause').hidden) pause(false);
    else if (localView) closeLocal();
    else if (!$('#v-game').hidden) pause(true);
  });

  // ajustes
  let vib = store.get('vib') !== 'off';
  const buzz = (p) => { if (vib && navigator.vibrate) navigator.vibrate(p); };
  const paintVib = () => { $('#b-vib').setAttribute('aria-pressed', vib); $('#b-vib').textContent = vib ? 'Ligada' : 'Desligada'; };
  $('#b-vib').onclick = () => { vib = !vib; store.set('vib', vib ? 'on' : 'off'); paintVib(); buzz(40); };
  paintVib();
  $('#in-vol').value = Math.round(SFX.volume * 100);
  $('#in-vol').oninput = (e) => SFX.setVolume(e.target.value / 100);
  $('#in-vol').onchange = () => SFX.play('ding');
  $('#b-testsnd').onclick = () => { if (!SFX.on) { SFX.toggle(); paintSound(); } SFX.play('exact'); };

  // círculo de lápis feito à mão, diferente para cada quadro
  function circleSvg(seed) {
    let s = seed * 31 + 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5);
    const pts = [];
    for (let k = 0; k <= 14; k++) {
      const a = (k / 13) * Math.PI * 2 - 0.4;
      pts.push([50 + Math.cos(a) * (47 + r() * 4), 35 + Math.sin(a) * (31 + r() * 3)]);
    }
    const d = 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join(' L');
    return `<svg class="circle" viewBox="0 0 100 70" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  }

  socket.on('state', (st) => {
    if (!inRoom) return;
    const prev = S; S = st; stateAt = performance.now();
    if (!myCode) myCode = st.code;
    sounds(prev, st);
    render(prev);
  });

  // ---------- áudio das músicas (prévia de 30 s, trechos de 4 s) ----------
  const aud = new Audio(); aud.preload = 'auto'; aud.setAttribute('playsinline', '');
  let segTimer = null, audUrl = '';
  const SILENT = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAA==';
  aud.addEventListener('play', () => $('#vinyl').classList.add('playing'));
  ['pause', 'ended'].forEach((ev) => aud.addEventListener(ev, () => $('#vinyl').classList.remove('playing')));
  // celular só deixa tocar áudio depois de um toque: libera no primeiro
  const unlockAudio = () => {
    aud.muted = true; aud.src = SILENT; audUrl = '';
    aud.play().then(() => { aud.pause(); aud.muted = false; }).catch(() => { aud.muted = false; });
  };
  window.addEventListener('pointerdown', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  function stopAudio() { clearTimeout(segTimer); try { aud.pause(); } catch {} }
  function loadAudio(url) { if (url && audUrl !== url) { audUrl = url; aud.src = url; aud.load(); } }
  function playSeg(start, len) {
    if (!S || !S.audio) return;
    stopAudio();
    if (!SFX.on || SFX.volume <= 0) return;
    loadAudio(S.audio);
    aud.volume = Math.max(0.2, SFX.volume);
    const go = () => {
      try { aud.currentTime = start; } catch {}
      aud.play().catch(() => {});
      clearTimeout(segTimer); segTimer = setTimeout(() => aud.pause(), len * 1000);
    };
    if (aud.readyState >= 1) go(); else aud.addEventListener('loadedmetadata', go, { once: true });
  }
  $('#b-replay').onclick = () => { const r = S && S.revealed[S.revealed.length - 1]; if (r) playSeg(r.start, r.len); };

  function waveSvg(seed) {
    let x = seed * 17 + 3; const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    let bars = ''; for (let k = 0; k < 9; k++) { const h = 4 + r() * 20; bars += `<rect x="${3 + k * 7}" y="${14 - h / 2}" width="3.4" height="${h}" rx="1.2"/>`; }
    return `<svg class="wave" viewBox="0 0 66 28" preserveAspectRatio="none" aria-hidden="true">${bars}</svg>`;
  }

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
    if (st.mode === 'music' && ph === 'picking' && st.audio) loadAudio(st.audio); // já baixa enquanto o DJ escolhe
    const nPrev = pph === 'lobby' || prev.round !== st.round ? 0 : (prev.revealed || []).length;
    if ((ph === 'guessing' || ph === 'reveal') && st.revealed.length > nPrev && ph !== 'reveal') {
      SFX.play('pencil');
      if (st.mode === 'music') { const r = st.revealed[st.revealed.length - 1]; setTimeout(() => playSeg(r.start, r.len), 350); }
      else setTimeout(() => SFX.play('projector'), 260);
    }
    if (ph === 'guessing' && st.mask && st.mask !== prev.mask) SFX.play('hint');
    if (ph === 'lobby' && st.players.length > prev.players.length) SFX.play('join');
    const lastAt = prev.feed.length ? prev.feed[prev.feed.length - 1].at : 0;
    const myName = (st.players.find((p) => p.id === st.me) || {}).name;
    if (st.feed.some((f) => f.at > lastAt && f.t === 'ok' && f.who !== myName)) SFX.play('ding');
  }

  // botões de som
  const paintSound = () => document.querySelectorAll('.snd').forEach((b) => {
    b.setAttribute('aria-pressed', SFX.on); b.textContent = SFX.on ? 'Som ligado' : 'Som mudo';
  }) || ($('#p-sound .snd-state').textContent = SFX.on ? 'ligado' : 'mudo');
  document.querySelectorAll('.snd').forEach((b) => (b.onclick = () => { SFX.toggle(); paintSound(); }));
  paintSound();
  ['#opt-cats', '#opt-rounds', '#opt-time', '#opt-diff'].forEach((id) => $(id).addEventListener('click', () => SFX.play('click')));

  function render(prev) {
    const ph = S.phase;
    if (ph === 'lobby') return renderLobby();
    if (ph === 'end') return renderEnd();
    show('game');
    renderGame(prev);
  }

  function renderLobby() {
    show('lobby');
    $('#lobby-code').textContent = S.code;
    const online = S.players.filter((p) => p.connected).length;
    $('#lobby-count').textContent = `(${S.players.length}${online < S.players.length ? `, ${online} conectados` : ''})`;
    $('#lobby-players').innerHTML = S.players.map((p) =>
      `<li class="${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === S.me ? '<span class="me">você</span>' : ''}${p.id === S.hostId ? '<span class="host">anfitrião</span>' : ''}${p.connected ? '' : '<span class="st">sem conexão</span>'}</li>`).join('');
    if (!$('#people').hidden) renderPeople();
    const host = isHost();
    $('#host-box').hidden = !host;
    $('#guest-wait').hidden = host;
    $('#key-box').hidden = !S.needKey;
    for (const b of $('#opt-cats').children) b.setAttribute('aria-pressed', S.settings.cats.includes(b.dataset.v));
    for (const [id, key] of [['#opt-rounds', 'rounds'], ['#opt-time', 'time'], ['#opt-diff', 'diff']]) {
      for (const b of $(id).children) b.setAttribute('aria-pressed', String(S.settings[key]) === b.dataset.v);
    }
    $('#opt-music-box').hidden = !S.settings.cats.includes('musicas');
    for (const b of $('#opt-music').children) b.setAttribute('aria-pressed', S.settings.musicStyle === b.dataset.v);
    $('#b-start').disabled = S.needKey;
    $('#b-start').textContent = S.needKey ? 'Cole a chave para rodar' : 'Rodar o filme';
    if (S.catalogError) $('#lobby-msg').textContent = S.catalogError;
    lastPhase = 'lobby';
  }

  function renderEnd() {
    show('end');
    const ranked = [...S.players].sort((a, b) => b.score - a.score);
    $('#credits').innerHTML = ranked.map((p) => `<li><span>${esc(p.name)}</span><b>${p.score}</b></li>`).join('');
    $('#b-again').hidden = $('#b-tolobby').hidden = !isHost();
    $('#end-wait').hidden = isHost();
    lastPhase = 'end';
  }

  function renderGame(prev) {
    const ph = S.phase;
    const amPicker = S.pickerId === S.me;
    const mine = me();
    $('#round-label').textContent = `Rolo ${S.round} de ${S.rounds}`;
    $('#edge-a').textContent = `FG 400 ▸ ROLO ${S.round}`;
    $('#my-score').textContent = mine.score;

    const music = S.mode === 'music';
    const labels = {
      loading: 'Trocando o rolo…',
      picking: amPicker ? (music ? 'Escolha um trecho' : 'Escolha um frame') : `${nameOf(S.pickerId)} escolhe o ${music ? 'trecho' : 'frame'}`,
      guessing: mine.guessed ? 'Você acertou! Aguarde' : music ? 'Que música é essa?' : 'Que obra é essa?',
      reveal: 'Revelado',
    };
    $('#phase-label').textContent = labels[ph] || '';

    // tela do projetor
    const screen = $('#screen'), img = $('#frame-main');
    const latest = S.revealed[S.revealed.length - 1];
    const revealKey = S.round + ':' + S.revealed.map((r) => r.i).join(',');
    const showVinyl = music && (ph === 'guessing' || ph === 'reveal');
    $('#vinyl').hidden = !showVinyl;
    $('#mute-note').hidden = !(showVinyl && !(SFX.on && SFX.volume > 0));
    if (music) {
      img.hidden = true; img.dataset.src = '';
      $('#screen-empty').hidden = showVinyl;
      if (!showVinyl) $('#screen-msg').textContent = ph === 'loading' ? 'Trocando a fita…' : amPicker
        ? 'Você é o DJ. Toque num trecho da fita para tocar.'
        : `${nameOf(S.pickerId)} está escolhendo o trecho…`;
    } else if (latest && (ph === 'guessing' || ph === 'reveal')) {
      if (img.dataset.src !== latest.full) {
        img.dataset.src = latest.full; img.src = latest.full; img.hidden = false;
        screen.classList.remove('flick'); void screen.offsetWidth; screen.classList.add('flick');
      }
      $('#screen-empty').hidden = true;
    } else {
      img.hidden = true; img.dataset.src = '';
      $('#screen-empty').hidden = false;
      $('#screen-msg').textContent = ph === 'loading' ? 'Trocando o rolo…' : amPicker
        ? 'Você é o projecionista. Toque num frame da película para projetar.'
        : `${nameOf(S.pickerId)} está escolhendo o frame…`;
    }
    // resposta
    if (S.answer) {
      $('#answer').hidden = false;
      $('#answer-kind').textContent = [S.answer.kind, S.answer.year].filter(Boolean).join(', ');
      $('#answer-title').textContent = S.answer.title;
      $('#answer-orig').textContent = S.answer.artist ? S.answer.artist : (S.answer.original && S.answer.original !== S.answer.title ? S.answer.original : '');
      $('#answer').classList.toggle('sq', music);
      const pImg = $('#answer-poster');
      if (S.answer.poster) { pImg.src = S.answer.poster; pImg.hidden = false; } else pImg.hidden = true;
    } else $('#answer').hidden = true;

    $('#mask').textContent = S.mask || '';

    // película (folha de contato)
    const n = S.frameCount || 8;
    const revealedIdx = new Set(S.revealed.map((r) => r.i));
    const thumbs = {}; (S.allFrames || S.revealed).forEach((f) => (thumbs[f.i] = f.thumb));
    const canPick = (ph === 'picking' && amPicker) || (ph === 'guessing' && amPicker && S.revealed.length < 3 && S.canExtraIn <= 0 && !lateTimer());
    const freshSet = new Set(prev && prev.round === S.round ? S.revealed.filter((r) => !(prev.revealed || []).some((q) => q.i === r.i)).map((r) => r.i) : S.revealed.map((r) => r.i));
    if (revealKey !== lastRevealKey || ph !== lastPhase || $('#cells').children.length !== n || canPick !== $('#cells').classList.contains('picking')) {
      $('#cells').classList.toggle('picking', canPick);
      $('#cells').innerHTML = Array.from({ length: ph === 'loading' ? 8 : n }, (_, i) => {
        const t = thumbs[i];
        const on = revealedIdx.has(i);
        const dis = music && on ? false : (!canPick || on);
        return `<button class="cell${music ? ' mus' : ''}${music && on ? ' lit' : ''}${on && freshSet.has(i) ? ' fresh' : ''}" data-i="${i}" ${dis ? 'disabled' : ''} aria-label="${music ? 'Trecho' : 'Frame'} ${i + 1}${on ? (music ? ', toque para ouvir de novo' : ', projetado') : ''}">` +
          (music ? waveSvg(i + 1 + S.round * 5) : t ? `<img src="${esc(t)}" alt="" loading="lazy">` : '') + `<span class="n">${i + 1}${'ABCDEFGH'[i]}</span>` + (on ? circleSvg(i + S.round * 8) : '') + '</button>';
      }).join('');
      lastRevealKey = revealKey;
      if (canPick && ph === 'picking' && !matchMedia('(pointer:coarse)').matches) $('#cells .cell:not(:disabled)')?.focus();
    }
    $('.sheet-strip .edge-b').textContent = ph === 'guessing' && amPicker && S.revealed.length < 3 ? (music ? '◂ toque para soltar mais um trecho' : '◂ toque para dar mais uma pista')
      : ph === 'picking' && amPicker ? (music ? '◂ escolha um trecho' : '◂ escolha um frame')
      : music && ph === 'guessing' ? '◂ toque num trecho para ouvir de novo' : '◂ ◂ ◂';

    // conversa
    const feed = $('#feed');
    feed.innerHTML = S.feed.map((f) => {
      if (f.t === 'guess') return `<li><b>${esc(f.who)}:</b> ${esc(f.text)}</li>`;
      const cls = { ok: 'ok', close: 'close', answer: 'answer-line', skip: 'skip' }[f.t] || 'sys';
      return `<li class="${cls}">${esc(f.text)}</li>`;
    }).join('');
    feed.scrollTop = feed.scrollHeight;

    // placar
    const ranked = [...S.players].sort((a, b) => b.score - a.score);
    $('#scoreline').innerHTML = ranked.map((p) =>
      `<li class="${p.guessed ? 'done' : p.skipped ? 'skip' : ''} ${p.id === S.pickerId ? 'pick' : ''} ${p.connected ? '' : 'off'}">${esc(p.name)} <b>${p.score}</b></li>`).join('');
    const online = S.players.filter((p) => p.connected);
    $('#people-n').textContent = online.length;
    // botão Não sei
    const sk = $('#b-skip');
    sk.disabled = ph !== 'guessing' || mine.guessed;
    sk.setAttribute('aria-pressed', !!mine.skipped);
    sk.textContent = mine.skipped ? 'Passei (desfazer)' : 'Não sei';
    const pending = online.filter((p) => !p.guessed);
    const skippers = pending.filter((p) => p.skipped).length;
    $('#skipinfo').textContent = ph === 'guessing' && skippers
      ? `${skippers} de ${pending.length} ${pending.length === 1 ? 'que falta' : 'que faltam'} passaram a vez. Se todos passarem, a rodada acaba.` : '';
    if (!$('#people').hidden) renderPeople();

    // campo de palpite
    const inp = $('#in-guess');
    const canGuess = ph === 'guessing' && !mine.guessed;
    inp.disabled = !canGuess; $('#b-guess').disabled = !canGuess; micBtn.disabled = !canGuess;
    if (!canGuess && listening) stopMic();
    if (ph !== 'guessing' || !mine.guessed) $('#bonus').hidden = true;
    if (!listening) inp.placeholder = ph === 'guessing' ? (mine.guessed ? 'Você já acertou' : mine.skipped ? 'Ainda dá pra chutar' : music ? 'Música ou artista' : 'Seu palpite') : ph === 'picking' ? (music ? 'Esperando o trecho…' : 'Esperando o frame…') : 'Próximo rolo já vem';
    if (canGuess && (lastPhase !== 'guessing') && !matchMedia('(pointer:coarse)').matches) inp.focus();
    lastPhase = ph;
  }

  // já passou 75% do tempo: pistas automáticas acabaram
  const lateTimer = () => false;

  // ---------- relógio (bobina) ----------
  let lastTickSec = -1;
  function tick() {
    if (S && (S.phase === 'picking' || S.phase === 'guessing' || S.phase === 'reveal')) {
      const left = Math.max(0, S.endsIn - (performance.now() - stateAt));
      const sec = Math.ceil(left / 1000);
      $('#timer').textContent = sec;
      const frac = S.totalMs ? left / S.totalMs : 0;
      $('#reel-sweep').style.strokeDasharray = `${(frac * 100).toFixed(2)} 100`;
      $('#reel').classList.toggle('hurry', S.phase === 'guessing' && sec <= 10);
      if (S.phase === 'guessing' && sec <= 10 && sec > 0 && sec !== lastTickSec && !me().guessed) SFX.play('tick', sec <= 3);
      lastTickSec = sec;
      // libera o botão de pista extra quando der o tempo
      if (S.phase === 'guessing' && S.pickerId === S.me && S.canExtraIn > 0 && performance.now() - stateAt > S.canExtraIn) {
        S.canExtraIn = 0; renderGame(S);
      }
    } else if (S && S.phase === 'loading') { $('#timer').textContent = '…'; $('#reel-sweep').style.strokeDasharray = '0 100'; }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // ---------- controle (gamepad) ----------
  // Direcional/analógico move o foco, A confirma, B vai para o campo de palpite, Start inicia.
  const pads = {};
  const focusables = () => [...(!$('#people').hidden ? $('#people') : !$('#pause').hidden ? $('#pause') : document).querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter((el) => el.offsetParent && !el.closest('[hidden]'));
  function move(dx, dy) {
    const list = focusables(); if (!list.length) return;
    const cur = document.activeElement && list.includes(document.activeElement) ? document.activeElement : null;
    if (!cur) return list[0].focus();
    const a = cur.getBoundingClientRect(); const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = Infinity;
    for (const el of list) {
      if (el === cur) continue;
      const b = el.getBoundingClientRect(); const bx = b.left + b.width / 2, by = b.top + b.height / 2;
      const ddx = bx - ax, ddy = by - ay;
      if (dx && Math.sign(ddx) !== dx) continue; if (dy && Math.sign(ddy) !== dy) continue;
      if (dx && Math.abs(ddx) < 4) continue; if (dy && Math.abs(ddy) < 4) continue;
      const d = dx ? Math.abs(ddx) + Math.abs(ddy) * 2.5 : Math.abs(ddy) + Math.abs(ddx) * 2.5;
      if (d < bd) { bd = d; best = el; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
  }
  function pollPads() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const gp of list) {
      if (!gp) continue;
      const prev = pads[gp.index] || {};
      const now = {
        a: gp.buttons[0]?.pressed, b: gp.buttons[1]?.pressed, x: gp.buttons[2]?.pressed, y: gp.buttons[3]?.pressed, start: gp.buttons[9]?.pressed, mic: gp.buttons[4]?.pressed || gp.buttons[5]?.pressed,
        up: gp.buttons[12]?.pressed || gp.axes[1] < -0.6, down: gp.buttons[13]?.pressed || gp.axes[1] > 0.6,
        left: gp.buttons[14]?.pressed || gp.axes[0] < -0.6, right: gp.buttons[15]?.pressed || gp.axes[0] > 0.6,
      };
      const hit = (k) => now[k] && !prev[k];
      if (hit('up')) move(0, -1); if (hit('down')) move(0, 1);
      if (hit('left')) move(-1, 0); if (hit('right')) move(1, 0);
      if (hit('a')) { const el = document.activeElement; if (el && el.tagName === 'BUTTON') el.click(); else if (el && el.tagName === 'INPUT') el.form?.requestSubmit(); }
      if (hit('mic') && !$('#v-game').hidden && !micBtn.hidden) micBtn.click();
      if (hit('x') && !$('#v-game').hidden && !$('#b-skip').disabled) $('#b-skip').click();
      if (hit('y') && (!$('#v-game').hidden || !$('#v-lobby').hidden)) people($('#people').hidden);
      if (hit('b')) { if (!$('#people').hidden) people(false); else if (!$('#pause').hidden) pause(false); else if (localView) closeLocal(); else { const g = $('#in-guess'); if (!g.disabled && !$('#v-game').hidden) g.focus(); } }
      if (hit('start')) { if (!$('#v-lobby').hidden) $('#b-start').click(); else if (!$('#v-end').hidden) $('#b-again').click(); else if (!$('#v-game').hidden) pause($('#pause').hidden); }
      pads[gp.index] = now;
    }
    requestAnimationFrame(pollPads);
  }
  let polling = false;
  window.addEventListener('gamepadconnected', () => { if (!polling) { polling = true; requestAnimationFrame(pollPads); } });
})();
