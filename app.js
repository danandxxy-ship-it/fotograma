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

  // ---------- entrada ----------
  const params = new URLSearchParams(location.search);
  $('#in-name').value = store.get('name') || '';
  if (params.get('sala')) $('#in-code').value = params.get('sala').toUpperCase().slice(0, 4);
  const nameOk = () => {
    const n = $('#in-name').value.trim();
    if (!n) { $('#home-msg').textContent = 'Escreva seu nome primeiro.'; $('#in-name').focus(); return null; }
    store.set('name', n); return n;
  };
  $('#b-create').onclick = () => { const n = nameOk(); if (n) socket.emit('create', { name: n, token }); };
  $('#f-home').onsubmit = (e) => {
    e.preventDefault();
    const n = nameOk(); if (!n) return;
    const code = $('#in-code').value.trim().toUpperCase();
    if (code.length !== 4) { $('#home-msg').textContent = 'O código da sala tem 4 letras.'; $('#in-code').focus(); return; }
    socket.emit('join', { name: n, code, token });
  };
  socket.on('joined', ({ code, token: t }) => {
    token = t; myCode = code; store.set('token', t); store.set('room', code);
    history.replaceState(null, '', '?sala=' + code);
  });
  socket.on('fail', (m) => { ($('#v-home').hidden ? $('#lobby-msg') : $('#home-msg')).textContent = m; });
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
    const set = new Set(S.settings.cats);
    set.has(b.dataset.v) ? set.delete(b.dataset.v) : set.add(b.dataset.v);
    if (set.size) sendSettings({ cats: [...set] });
  };
  for (const [id, key] of [['#opt-rounds', 'rounds'], ['#opt-time', 'time'], ['#opt-diff', 'diff']]) {
    $(id).onclick = (e) => { const b = e.target.closest('button'); if (b && isHost()) sendSettings({ [key]: b.dataset.v }); };
  }
  $('#b-key').onclick = () => { const k = $('#in-key').value.trim(); if (k) { $('#lobby-msg').textContent = 'Testando a chave…'; socket.emit('key', k); } };
  $('#b-start').onclick = () => socket.emit('start');
  $('#b-again').onclick = () => socket.emit('start');
  $('#b-tolobby').onclick = () => socket.emit('lobby');

  // ---------- jogo ----------
  $('#cells').onclick = (e) => {
    const b = e.target.closest('.cell'); if (!b || b.disabled) return;
    socket.emit('pick', +b.dataset.i);
  };
  $('#f-guess').onsubmit = (e) => {
    e.preventDefault();
    const v = $('#in-guess').value.trim(); if (!v) return;
    socket.emit('guess', v); $('#in-guess').value = '';
  };
  let vTimer;
  socket.on('verdict', (r) => {
    const el = $('#verdict');
    el.textContent = r === 'correct' ? 'Acertou!' : r === 'close' ? 'Quase!' : 'Não é…';
    el.className = 'verdict show ' + r;
    clearTimeout(vTimer); vTimer = setTimeout(() => (el.className = 'verdict'), 1300);
    if (navigator.vibrate) navigator.vibrate(r === 'correct' ? [30, 40, 60] : r === 'close' ? 25 : 10);
  });

  const isHost = () => S && S.hostId === S.me;
  const me = () => S.players.find((p) => p.id === S.me) || { score: 0 };
  const nameOf = (id) => (S.players.find((p) => p.id === id) || {}).name || '—';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function show(view) { for (const v of ['home', 'lobby', 'game', 'end']) $('#v-' + v).hidden = v !== view; }

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
    const prev = S; S = st; stateAt = performance.now();
    if (!myCode) myCode = st.code;
    render(prev);
  });

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
    $('#lobby-players').innerHTML = S.players.map((p) =>
      `<li class="${p.connected ? '' : 'off'}">${esc(p.name)}${p.id === S.hostId ? '<span class="host">anfitrião</span>' : ''}</li>`).join('');
    const host = isHost();
    $('#host-box').hidden = !host;
    $('#guest-wait').hidden = host;
    $('#key-box').hidden = !S.needKey;
    for (const b of $('#opt-cats').children) b.setAttribute('aria-pressed', S.settings.cats.includes(b.dataset.v));
    for (const [id, key] of [['#opt-rounds', 'rounds'], ['#opt-time', 'time'], ['#opt-diff', 'diff']]) {
      for (const b of $(id).children) b.setAttribute('aria-pressed', String(S.settings[key]) === b.dataset.v);
    }
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

    const labels = {
      loading: 'Trocando o rolo…',
      picking: amPicker ? 'Escolha um frame' : `${nameOf(S.pickerId)} escolhe o frame`,
      guessing: mine.guessed ? 'Você acertou! Aguarde' : 'Que obra é essa?',
      reveal: 'Revelado',
    };
    $('#phase-label').textContent = labels[ph] || '';

    // tela do projetor
    const screen = $('#screen'), img = $('#frame-main');
    const latest = S.revealed[S.revealed.length - 1];
    const revealKey = S.round + ':' + S.revealed.map((r) => r.i).join(',');
    if (latest && (ph === 'guessing' || ph === 'reveal')) {
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
      $('#answer-orig').textContent = S.answer.original && S.answer.original !== S.answer.title ? S.answer.original : '';
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
        const dis = !canPick || on;
        return `<button class="cell${on && freshSet.has(i) ? ' fresh' : ''}" data-i="${i}" ${dis ? 'disabled' : ''} aria-label="Frame ${i + 1}${on ? ', projetado' : ''}">` +
          (t ? `<img src="${esc(t)}" alt="" loading="lazy">` : '') + `<span class="n">${i + 1}${'ABCDEFGH'[i]}</span>` + (on ? circleSvg(i + S.round * 8) : '') + '</button>';
      }).join('');
      lastRevealKey = revealKey;
      if (canPick && ph === 'picking' && !matchMedia('(pointer:coarse)').matches) $('#cells .cell:not(:disabled)')?.focus();
    }
    $('.sheet-strip .edge-b').textContent = ph === 'guessing' && amPicker && S.revealed.length < 3 ? '◂ toque para dar mais uma pista' : ph === 'picking' && amPicker ? '◂ escolha um frame' : '◂ ◂ ◂';

    // conversa
    const feed = $('#feed');
    feed.innerHTML = S.feed.map((f) => {
      if (f.t === 'guess') return `<li><b>${esc(f.who)}:</b> ${esc(f.text)}</li>`;
      const cls = { ok: 'ok', close: 'close', answer: 'answer-line' }[f.t] || 'sys';
      return `<li class="${cls}">${esc(f.text)}</li>`;
    }).join('');
    feed.scrollTop = feed.scrollHeight;

    // placar
    const ranked = [...S.players].sort((a, b) => b.score - a.score);
    $('#scoreline').innerHTML = ranked.map((p) =>
      `<li class="${p.guessed ? 'done' : ''} ${p.id === S.pickerId ? 'pick' : ''}" style="${p.connected ? '' : 'opacity:.45'}">${esc(p.name)} <b>${p.score}</b></li>`).join('');

    // campo de palpite
    const inp = $('#in-guess');
    const canGuess = ph === 'guessing' && !mine.guessed;
    inp.disabled = !canGuess; $('#b-guess').disabled = !canGuess;
    inp.placeholder = ph === 'guessing' ? (mine.guessed ? 'Você já acertou este' : 'Que filme é esse?') : ph === 'picking' ? 'Esperando o frame…' : 'Próximo rolo já vem';
    if (canGuess && (lastPhase !== 'guessing') && !matchMedia('(pointer:coarse)').matches) inp.focus();
    lastPhase = ph;
  }

  // já passou 75% do tempo: pistas automáticas acabaram
  const lateTimer = () => false;

  // ---------- relógio (bobina) ----------
  function tick() {
    if (S && (S.phase === 'picking' || S.phase === 'guessing' || S.phase === 'reveal')) {
      const left = Math.max(0, S.endsIn - (performance.now() - stateAt));
      const sec = Math.ceil(left / 1000);
      $('#timer').textContent = sec;
      const frac = S.totalMs ? left / S.totalMs : 0;
      $('#reel-sweep').style.strokeDasharray = `${(frac * 100).toFixed(2)} 100`;
      $('#reel').classList.toggle('hurry', S.phase === 'guessing' && sec <= 10);
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
  const focusables = () => [...document.querySelectorAll('button:not(:disabled), input:not(:disabled)')].filter((el) => el.offsetParent && !el.closest('[hidden]'));
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
        a: gp.buttons[0]?.pressed, b: gp.buttons[1]?.pressed, start: gp.buttons[9]?.pressed,
        up: gp.buttons[12]?.pressed || gp.axes[1] < -0.6, down: gp.buttons[13]?.pressed || gp.axes[1] > 0.6,
        left: gp.buttons[14]?.pressed || gp.axes[0] < -0.6, right: gp.buttons[15]?.pressed || gp.axes[0] > 0.6,
      };
      const hit = (k) => now[k] && !prev[k];
      if (hit('up')) move(0, -1); if (hit('down')) move(0, 1);
      if (hit('left')) move(-1, 0); if (hit('right')) move(1, 0);
      if (hit('a')) { const el = document.activeElement; if (el && el.tagName === 'BUTTON') el.click(); else if (el && el.tagName === 'INPUT') el.form?.requestSubmit(); }
      if (hit('b')) { const g = $('#in-guess'); if (!g.disabled && !$('#v-game').hidden) g.focus(); }
      if (hit('start')) { if (!$('#v-lobby').hidden) $('#b-start').click(); else if (!$('#v-end').hidden) $('#b-again').click(); }
      pads[gp.index] = now;
    }
    requestAnimationFrame(pollPads);
  }
  let polling = false;
  window.addEventListener('gamepadconnected', () => { if (!polling) { polling = true; requestAnimationFrame(pollPads); } });
})();
