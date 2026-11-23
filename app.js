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
  const SPECIAL = ['musicas', 'games', 'personagens', 'vf'];
  const pickCat = (e) => {
    const b = e.target.closest('button'); if (!b || !isHost()) return;
    const v = b.dataset.v; let set = new Set(S.settings.cats);
    if (SPECIAL.includes(v)) set = new Set(set.has(v) ? ['filmes', 'series', 'animes', 'desenhos'] : [v]); // modo especial: sozinho
    else { SPECIAL.forEach((x) => set.delete(x)); set.has(v) ? set.delete(v) : set.add(v); }
    if (set.size) sendSettings({ cats: [...set] });
  };
  $('#opt-cats').onclick = pickCat; $('#opt-special').onclick = pickCat;
  $('#opt-char').onclick = (e) => { const b = e.target.closest('button'); if (b && isHost()) sendSettings({ charSrc: b.dataset.v }); };
  $('#opt-arcade').onclick = (e) => { const b = e.target.closest('button'); if (b && isHost()) sendSettings({ arcade: b.dataset.v === '1' }); };
  $('#b-addbot').onclick = () => { if (isHost()) socket.emit('addbot'); };
  $('#lobby-players').onclick = (e) => { const b = e.target.closest('[data-kick]'); if (b && isHost()) socket.emit('kickbot', b.dataset.kick); };
  for (const [id, key] of [['#opt-rounds', 'rounds'], ['#opt-time', 'time'], ['#opt-diff', 'diff'], ['#opt-music', 'musicStyle'], ['#opt-bot', 'botLevel']]) {
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
      const r = S.revealed.concat(S.arcade ? S.arcade.peek : []).find((x) => x.i === +b.dataset.i); if (r) playSeg(r.start, r.len); return;
    }
    if (S && b.classList.contains('seen')) { viewIdx = +b.dataset.i; renderGame(S); return; } // projeta este frame na sua tela
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
    if (hasFx('teclado')) { micInfo('Teclado doido: o microfone está desligado.'); return; }
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
    if (r === 'actor') {
      el.textContent = 'Esse é o ator!'; el.className = 'verdict show close';
      $('#bonus').textContent = 'Aqui vale o nome do personagem'; $('#bonus').hidden = false;
      clearTimeout(vTimer); vTimer = setTimeout(() => { el.className = 'verdict'; $('#bonus').hidden = true; }, 2000);
      SFX.play('close'); buzz(25); return;
    }
    if (r === 'answered') { SFX.play('pencil'); buzz(15); return; }
    if (r === 'frozen') {
      el.textContent = 'Congelado!'; el.className = 'verdict show close';
      $('#bonus').textContent = `Dá pra chutar em ${Math.ceil(v.left / 1000)} s`; $('#bonus').hidden = false;
      clearTimeout(vTimer); vTimer = setTimeout(() => { el.className = 'verdict'; $('#bonus').hidden = true; }, 1600);
      SFX.play('freeze'); return;
    }
    el.textContent = r === 'correct' ? (v.artistOnly ? 'Artista certo!' : v.exact ? 'Título exato!' : v.place === 1 ? 'Primeiro!' : 'Acertou!') : r === 'close' ? 'Quase!' : 'Não é…';
    el.className = 'verdict show ' + r;
    if (r === 'correct') {
      const parts = [];
      if (v.placeBonus) parts.push(`${v.place}º lugar +${v.placeBonus}`);
      if (v.exactBonus) parts.push(`título exato +${v.exactBonus}`);
      if (v.artistOnly) parts.push('só o artista, vale 60%');
      if (v.double) parts.push('dobro');
      if (v.toll) parts.push(`pedágio levou ${v.toll}`);
      if (v.card) parts.push('ganhou uma lâmina');
      $('#bonus').textContent = `+${v.pts} pontos` + (parts.length ? ` (${parts.join(', ')})` : '');
      $('#bonus').hidden = false;
    } else if (v.heat) {
      $('#bonus').textContent = `Radar: ${v.heat}`; $('#bonus').hidden = false;
      setTimeout(() => ($('#bonus').hidden = true), 2200);
    }
    clearTimeout(vTimer); vTimer = setTimeout(() => (el.className = 'verdict'), 1600);
    SFX.play(r === 'correct' ? (v.exact ? 'exact' : 'correct') : r === 'close' ? 'close' : 'wrong');
    buzz(r === 'correct' ? [30, 40, 60] : r === 'close' ? 25 : 10);
  });

  // ---------- modo Arcade: lâminas de poder ----------
  const ICON = {
    borrao: '<path d="M4 8c3-2 5 2 8 0s5-2 8 0M4 12c3-2 5 2 8 0s5-2 8 0M4 16c3-2 5 2 8 0s5-2 8 0"/>',
    virada: '<path d="M5 9a7 7 0 0 1 13-2M19 15a7 7 0 0 1-13 2"/><path d="M18 3v4h-4M6 21v-4h4"/>',
    tinta: '<path d="M8 5c3-2 6 1 5 3 3 0 4 4 1 5 2 3-2 6-5 4-2 3-7 1-6-2-3-1-3-6 1-6-1-3 2-5 4-4z"/>',
    apagao: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10z"/><path d="M4 4l16 16"/>',
    mudo: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
    acelera: '<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/>',
    congela: '<path d="M12 2v20M3.3 7l17.4 10M20.7 7L3.3 17"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2"/>',
    teclado: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h1M10 10h1M14 10h1M18 10h0M7 14h10"/>',
    pedagio: '<path d="M3 20V8M3 9h18v4H3"/><path d="M8 9l3 4M14 9l3 4"/>',
    espiar: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    dica: '<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6M8 10h4"/>',
    escudo: '<rect x="6" y="3" width="12" height="18" rx="1"/><path d="M9 8l4-3M9 13l7-5"/>',
    dobro: '<path d="M4 7l6 10M10 7l-6 10M14 9a3 3 0 1 1 5 2l-5 6h6"/>',
    radar: '<path d="M12 12l6-6"/><path d="M5 19a10 10 0 1 1 14 0M8 16a6 6 0 1 1 8 0"/><circle cx="12" cy="12" r="1.5"/>',
  };
  const POW = {
    borrao: ['atk', 'Borrão', 'Embaça a tela da pessoa por 12 s'],
    virada: ['atk', 'Tela virada', 'A imagem dela fica de ponta-cabeça e espelhada por 12 s'],
    tinta: ['atk', 'Tinta na lente', 'Mancha de tinta cobrindo a tela dela por 12 s'],
    apagao: ['atk', 'Apagão', 'Ela só vê o que a lanterna ilumina por 10 s'],
    mudo: ['atk', 'Fone mudo', 'Corta o som dela por 10 s'],
    acelera: ['atk', 'Esquilo', 'A música dela toca acelerada por 12 s'],
    congela: ['atk', 'Congelar', 'Ela não consegue chutar por 7 s'],
    teclado: ['atk', 'Teclado doido', 'Troca as letras que ela digita e desliga o microfone por 12 s'],
    pedagio: ['atk', 'Pedágio', 'Se ela acertar nesta rodada, 30% dos pontos vão pra você'],
    espiar: ['buf', 'Espiada', 'Você vê um frame a mais que ninguém viu'],
    dica: ['buf', 'Lupa', 'Mostra as iniciais do título e o ano só pra você'],
    escudo: ['buf', 'Espelho', 'O próximo ataque contra você volta pra quem jogou'],
    dobro: ['buf', 'Dobro', 'Seu próximo acerto nesta rodada vale o dobro'],
    radar: ['buf', 'Radar', 'Cada chute errado diz se está quente, morno ou frio'],
  };
  const FXNAME = { borrao: 'borrado', virada: 'de ponta-cabeça', tinta: 'manchado', apagao: 'no escuro', congela: 'congelado', teclado: 'teclado doido', mudo: 'mudo', acelera: 'esquilo' };
  let viewIdx = null, lastHand = '', pendingCard = null;
  const fxLeft = (k) => (S && S.arcade && S.arcade.fx[k] ? S.arcade.fx[k] - (performance.now() - stateAt) : 0);
  const hasFx = (k) => fxLeft(k) > 0;
  const targets = () => S.players.filter((p) => p.id !== S.me && p.connected && !p.guessed);
  function cardUsable(k) {
    const A = S.arcade, t = POW[k][0], ph = S.phase;
    if (!A || A.cd - (performance.now() - stateAt) > 0) return false;
    if (t === 'atk') return ph === 'guessing' && targets().length > 0;
    if (!['picking', 'guessing'].includes(ph)) return false;
    return k === 'escudo' ? !A.shield : !me().guessed;
  }
  function renderHand() {
    const A = S && S.arcade, show = !!A && ['picking', 'guessing', 'reveal'].includes(S.phase);
    $('#hand').hidden = !show; if (!show) return;
    const key = A.hand.join(',');
    const grew = A.hand.length > (lastHand ? lastHand.split(',').length : 0) && key !== lastHand;
    $('#hand-cards').innerHTML = A.hand.length ? A.hand.map((k, i) => {
      const [t, name] = POW[k];
      return `<button type="button" class="pcard ${t}${grew && i === A.hand.length - 1 ? ' new' : ''}" data-card="${k}" ${cardUsable(k) ? '' : 'disabled'} aria-label="${name}: ${POW[k][2]}"><span class="win"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg></span><b>${name}</b></button>`;
    }).join('') : '<span class="hand-empty">Sem lâminas. Chega uma nova a cada rodada.</span>';
    lastHand = key;
    const st = [];
    if (A.toll) st.push('Pedágio em você');
    if (A.shield) st.push('Espelho ativo');
    if (A.double) st.push('Dobro no próximo acerto');
    if (A.radar) st.push('Radar ligado');
    if (A.cd - (performance.now() - stateAt) > 0) st.push('recarregando…');
    $('#hand-state').textContent = st.join(' · ');
  }
  $('#hand-cards').onclick = (e) => {
    const b = e.target.closest('.pcard'); if (!b || b.disabled) return;
    const k = b.dataset.card, [t, name, desc] = POW[k];
    if (t === 'buf') { socket.emit('power', { card: k }); return; }
    pendingCard = k;
    $('#target-t').textContent = `${name} em quem?`; $('#target-desc').textContent = desc;
    $('#target-list').innerHTML = targets().sort((a, b2) => b2.score - a.score).map((p) =>
      `<button type="button" class="menu-item" data-to="${esc(p.id)}"><b>${esc(p.name)}</b><small>${p.score} pontos${p.isBot ? ' · bot' : ''}${p.skipped ? ' · passou a vez' : ''}</small></button>`).join('');
    $('#target').hidden = false; SFX.play('click');
    $('#target-list button')?.focus();
  };
  $('#target-list').onclick = (e) => {
    const b = e.target.closest('[data-to]'); if (!b || !pendingCard) return;
    socket.emit('power', { card: pendingCard, target: b.dataset.to });
    pendingCard = null; $('#target').hidden = true;
  };
  $('#target-cancel').onclick = () => { pendingCard = null; $('#target').hidden = true; };
  socket.on('powerfail', (why) => { const m = { alvo: 'Essa pessoa já acertou ou saiu.', fase: 'Agora não dá pra usar essa lâmina.', espera: 'Espere a lâmina recarregar.' }[why]; if (m) micInfo(m); });

  let toastT;
  function toast(text, hit) {
    const el = $('#ptoast'); el.textContent = text; el.className = 'ptoast' + (hit ? ' hit' : ''); el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => (el.hidden = true), 2600);
  }
  socket.on('power', (ev) => {
    if (!S) return;
    const [t, name] = POW[ev.card] || ['buf', '?'];
    const fromN = nameOf(ev.from), toN = nameOf(ev.to);
    if (ev.blocked) { toast(`Espelho contra espelho: ${name} anulado`); SFX.play('mirror'); return; }
    if (ev.bounced) {
      if (ev.via === S.me) { toast(`Seu espelho devolveu o ${name} pra ${fromN}!`); SFX.play('mirror'); }
      else if (ev.from === S.me) { toast(`${nameOf(ev.via)} tinha espelho! Seu ${name} voltou pra você`, true); SFX.play('mirror'); setTimeout(() => SFX.play(ev.card === 'congela' ? 'freeze' : 'zap'), 250); buzz([40, 30, 80]); }
      else toast(`${name} de ${fromN} bateu no espelho de ${nameOf(ev.via)}`);
      return;
    }
    if (t === 'atk' && ev.to === S.me) { toast(`${fromN} jogou ${name} em você!`, true); SFX.play(ev.card === 'congela' ? 'freeze' : 'zap'); buzz([60, 40, 60]); }
    else if (ev.from === S.me) { toast(t === 'atk' ? `Você jogou ${name} em ${toN}` : `Você usou ${name}`); SFX.play('power'); }
    else if (t === 'atk') toast(`${fromN} jogou ${name} em ${toN}`);
  });

  // efeitos na sua tela (rodam sozinhos e somem no tempo certo)
  function applyFx() {
    if (!S) return;
    const scr = $('#screen');
    scr.classList.toggle('fx-borrao', hasFx('borrao'));
    scr.classList.toggle('fx-virada', hasFx('virada'));
    $('#fx-ink').hidden = !hasFx('tinta');
    $('#fx-dark').hidden = !hasFx('apagao');
    const frozen = hasFx('congela');
    $('#f-guess').classList.toggle('frozen', frozen);
    if (frozen) $('#in-guess').placeholder = `Congelado… ${Math.ceil(fxLeft('congela') / 1000)} s`;
    aud.muted = hasFx('mudo');
    const fast = hasFx('acelera');
    if ((aud.playbackRate > 1) !== fast) { aud.preservesPitch = !fast; aud.mozPreservesPitch = !fast; aud.playbackRate = fast ? 1.6 : 1; }
    if (hasFx('teclado') && listening) stopMic();
    if (!$('#v-game').hidden) renderHand();
  }
  setInterval(applyFx, 250);
  // Teclado doido: troca letras enquanto a pessoa digita
  $('#in-guess').addEventListener('input', (e) => {
    if (!hasFx('teclado') || e.inputType !== 'insertText') return;
    const el = e.target, v = el.value;
    if (v.length > 1 && Math.random() < 0.4) el.value = v.slice(0, -2) + v.slice(-1) + v.slice(-2, -1);
    else if (Math.random() < 0.25) el.value = v.slice(0, -1) + 'aeiouxkzq'[Math.floor(Math.random() * 9)];
  });

  // ---------- Verdadeiro ou Falso ----------
  const answerVF = (v) => { if (S && S.vf && S.phase === 'guessing' && S.vf.mine === null && !hasFx('congela')) socket.emit('vf', v); else if (hasFx('congela')) SFX.play('freeze'); };
  $('#b-true').onclick = () => answerVF(true);
  $('#b-false').onclick = () => answerVF(false);
  window.addEventListener('keydown', (e) => {
    if (!S || !S.vf || $('#v-game').hidden || e.target.matches('input')) return;
    if (e.key === 'v' || e.key === 'V') answerVF(true);
    if (e.key === 'f' || e.key === 'F') answerVF(false);
  });

  // ---------- reações: emojis subindo na tela de todo mundo ----------
  let lastReact = 0;
  $('#reacts').onclick = (e) => {
    const b = e.target.closest('[data-e]'); if (!b || Date.now() - lastReact < 450) return;
    lastReact = Date.now(); socket.emit('react', b.dataset.e); buzz(8);
  };
  socket.on('react', (r) => {
    if ($('#v-game').hidden) return;
    const layer = $('#react-layer');
    if (layer.childElementCount > 24) layer.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = 'react-pop';
    el.style.left = (8 + Math.random() * 78) + '%';
    el.style.animationDuration = (2.4 + Math.random() * 0.8) + 's';
    el.innerHTML = `<b>${esc(r.e)}</b><span>${r.from === S?.me ? 'você' : esc(r.name)}</span>`;
    layer.appendChild(el);
    el.addEventListener('animationend', (ev) => { if (ev.target === el) el.remove(); });
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
      if (ph === 'reveal' && st.mode === 'vf' && st.vf && st.vf.mine !== null && st.answer) setTimeout(() => SFX.play(st.vf.mine === st.answer.truth ? 'correct' : 'wrong'), 250);
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
  ['#opt-cats', '#opt-special', '#opt-char', '#opt-rounds', '#opt-time', '#opt-diff', '#opt-arcade', '#opt-bot', '#b-addbot'].forEach((id) => $(id).addEventListener('click', () => SFX.play('click')));

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
    const hostNow = isHost();
    $('#lobby-players').innerHTML = S.players.map((p) =>
      `<li class="${p.connected ? '' : 'off'}${p.isBot ? ' bot' : ''}">${esc(p.name)}${p.isBot ? `<span class="bottag">bot</span>${hostNow ? `<button type="button" class="kick" data-kick="${esc(p.id)}" aria-label="Tirar ${esc(p.name)}">tirar</button>` : ''}` : ''}${p.id === S.me ? '<span class="me">você</span>' : ''}${p.id === S.hostId ? '<span class="host">anfitrião</span>' : ''}${p.connected ? '' : '<span class="st">sem conexão</span>'}</li>`).join('');
    if (!$('#people').hidden) renderPeople();
    const host = isHost();
    $('#host-box').hidden = !host;
    $('#guest-wait').hidden = host;
    $('#key-box').hidden = !S.needKey;
    for (const b of [...$('#opt-cats').children, ...$('#opt-special').children]) b.setAttribute('aria-pressed', S.settings.cats.includes(b.dataset.v));
    $('#opt-char-box').hidden = !S.settings.cats.includes('personagens');
    for (const b of $('#opt-char').children) b.setAttribute('aria-pressed', S.settings.charSrc === b.dataset.v);
    for (const [id, key] of [['#opt-rounds', 'rounds'], ['#opt-time', 'time'], ['#opt-diff', 'diff']]) {
      for (const b of $(id).children) b.setAttribute('aria-pressed', String(S.settings[key]) === b.dataset.v);
    }
    $('#opt-music-box').hidden = !S.settings.cats.includes('musicas');
    for (const b of $('#opt-arcade').children) b.setAttribute('aria-pressed', String(S.settings.arcade ? 1 : 0) === b.dataset.v);
    $('#arcade-note').hidden = !S.settings.arcade;
    for (const b of $('#opt-bot').children) b.setAttribute('aria-pressed', S.settings.botLevel === b.dataset.v);
    $('#b-addbot').disabled = S.players.filter((p) => p.isBot).length >= 7 || S.players.length >= 16;
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

    const music = S.mode === 'music', isVF = S.mode === 'vf';
    const CLUE = { film: ['um', 'frame'], game: ['uma', 'captura'], char: ['uma', 'foto'], music: ['um', 'trecho'] }[S.mode] || ['um', 'frame'];
    const ASK = { film: 'Que obra é essa?', game: 'Que jogo é esse?', char: 'Quem é esse personagem?', music: 'Que música é essa?', vf: 'Verdadeiro ou falso?' }[S.mode] || 'Que obra é essa?';
    $('#v-game').classList.toggle('vf', isVF); $('#f-guess').classList.toggle('vf', isVF); $('#vf-btns').hidden = !isVF;
    const PREP2 = { filme: 'do filme', 'série': 'da série', anime: 'do anime', 'mangá': 'do mangá', desenho: 'do desenho' };
    const labels = {
      loading: 'Trocando o rolo…',
      picking: amPicker ? `Escolha ${CLUE[0]} ${CLUE[1]}` : `${nameOf(S.pickerId)} escolhe ${CLUE[0] === 'um' ? 'o' : 'a'} ${CLUE[1]}`,
      guessing: isVF ? (S.vf && S.vf.mine !== null ? 'Respondido! Aguarde' : ASK) : mine.guessed ? 'Você acertou! Aguarde' : ASK,
      reveal: 'Revelado',
    };
    $('#phase-label').textContent = labels[ph] || '';

    // tela do projetor
    const screen = $('#screen'), img = $('#frame-main');
    const latest = S.revealed[S.revealed.length - 1];
    const revealKey = S.round + ':' + S.revealed.map((r) => r.i).join(',') + '|' + (S.arcade ? S.arcade.peek.map((r) => r.i).join(',') : '');
    if (prev && (prev.round !== S.round || prev.revealed.length !== S.revealed.length)) viewIdx = null; // frame novo: volta pro último
    screen.classList.toggle('portrait', !!S.portrait);
    screen.classList.toggle('vf', isVF);
    const showVF = isVF && !!S.vf;
    $('#vf-card').hidden = !showVF;
    if (showVF) {
      $('#vf-text').textContent = S.vf.text;
      $('#vf-card').style.backgroundImage = S.vf.image ? `url("${S.vf.image}")` : '';
      const votes = S.vf.votes;
      $('#vf-votes').textContent = votes ? `${votes.filter((x) => x.v).length} disseram verdadeiro, ${votes.filter((x) => !x.v).length} falso` : '';
      const mineV = S.vf.mine, truth = S.answer ? S.answer.truth : null;
      for (const [b, v] of [[$('#b-true'), true], [$('#b-false'), false]]) {
        b.disabled = ph !== 'guessing' || mineV !== null;
        b.classList.toggle('chosen', mineV === v);
        b.classList.toggle('right', truth === v);
      }
    }
    if (!S.face || !['guessing', 'reveal'].includes(ph)) $('#face-pin').hidden = true;
    // personagens: a pergunta diz de onde ele é
    const cw = S.charWork, PREP = { filme: 'do filme', 'série': 'da série', anime: 'do anime', 'mangá': 'do mangá', desenho: 'do desenho' };
    $('#work-tag').hidden = !(cw && ph === 'guessing');
    if (cw) $('#work-tag').innerHTML = `Personagem ${PREP[cw.kind] || 'de'} <b>${esc(cw.name)}</b>`;
    const showVinyl = music && (ph === 'guessing' || ph === 'reveal');
    $('#vinyl').hidden = !showVinyl;
    $('#mute-note').hidden = !(showVinyl && !(SFX.on && SFX.volume > 0));
    if (isVF) {
      img.hidden = true; img.dataset.src = '';
      $('#screen-empty').hidden = showVF;
      if (!showVF) $('#screen-msg').textContent = 'Preparando a próxima cartela…';
    } else if (music) {
      img.hidden = true; img.dataset.src = '';
      $('#screen-empty').hidden = showVinyl;
      if (!showVinyl) $('#screen-msg').textContent = ph === 'loading' ? 'Trocando a fita…' : amPicker
        ? 'Você é o DJ. Toque num trecho da fita para tocar.'
        : `${nameOf(S.pickerId)} está escolhendo o trecho…`;
    } else if (latest && (ph === 'guessing' || ph === 'reveal')) {
      const pool = S.revealed.concat(S.arcade ? S.arcade.peek : []);
      const chosen = viewIdx !== null && pool.find((f) => f.i === viewIdx);
      const shown = chosen || latest;
      img.classList.toggle('wide', !shown.portrait);
      const pin = !!(S.face && shown.scene); // cena com várias pessoas: mostra quem é o personagem
      if ($('#face-pin').hidden === pin) $('#face-pin').hidden = !pin;
      if (pin && $('#face-img').dataset.src !== S.face) { $('#face-img').dataset.src = S.face; $('#face-img').src = S.face; }
      if (img.dataset.src !== shown.full) {
        img.dataset.src = shown.full; img.src = shown.full; img.hidden = false;
        screen.classList.remove('flick'); void screen.offsetWidth; screen.classList.add('flick');
      }
      $('#screen-empty').hidden = true;
    } else {
      img.hidden = true; img.dataset.src = '';
      $('#screen-empty').hidden = false;
      $('#screen-msg').textContent = ph === 'loading' ? 'Trocando o rolo…' : amPicker
        ? `Você é o projecionista. Toque n${CLUE[0] === 'um' ? 'um' : 'uma'} ${CLUE[1]} da película para projetar.`
        : `${nameOf(S.pickerId)} está escolhendo ${CLUE[0] === 'um' ? 'o' : 'a'} ${CLUE[1]}…`;
    }
    // resposta
    if (S.answer) {
      $('#answer').hidden = false;
      $('#answer-kind').textContent = [S.answer.kind, S.answer.year].filter(Boolean).join(', ');
      $('#answer-title').textContent = S.answer.title;
      $('#answer-orig').textContent = S.answer.artist ? S.answer.artist : (S.answer.original && S.answer.original !== S.answer.title ? S.answer.original : '');
      $('#answer').classList.toggle('sq', music);
      $('#answer').classList.toggle('gm', S.mode === 'game');
      const pImg = $('#answer-poster');
      if (S.answer.poster) { pImg.src = S.answer.poster; pImg.hidden = false; } else pImg.hidden = true;
    } else $('#answer').hidden = true;

    const lupa = S.arcade && S.arcade.hint;
    $('#mask').textContent = lupa ? 'Lupa: ' + lupa : S.mask || '';
    $('#mask').classList.toggle('lupa', !!lupa);

    // película (folha de contato)
    const n = S.frameCount || 8;
    const peeks = S.arcade ? S.arcade.peek : [];
    const peekIdx = new Set(peeks.map((r) => r.i));
    const revealedIdx = new Set(S.revealed.map((r) => r.i).concat([...peekIdx]));
    const thumbs = {}; (S.allFrames || S.revealed).concat(peeks).forEach((f) => (thumbs[f.i] = thumbs[f.i] || f.thumb));
    const sceneIdx = new Set((S.allFrames || S.revealed).concat(peeks).filter((f) => f.scene).map((f) => f.i));
    const canPick = (ph === 'picking' && amPicker) || (ph === 'guessing' && amPicker && S.revealed.length < 3 && S.canExtraIn <= 0 && !lateTimer());
    const freshSet = new Set(prev && prev.round === S.round ? S.revealed.filter((r) => !(prev.revealed || []).some((q) => q.i === r.i)).map((r) => r.i) : S.revealed.map((r) => r.i));
    if (revealKey !== lastRevealKey || ph !== lastPhase || $('#cells').children.length !== n || canPick !== $('#cells').classList.contains('picking')) {
      $('#cells').classList.toggle('picking', canPick);
      $('#cells').innerHTML = Array.from({ length: ph === 'loading' ? 8 : n }, (_, i) => {
        const t = thumbs[i];
        const on = revealedIdx.has(i);
        const dis = on ? false : !canPick;
        return `<button class="cell${music ? ' mus' : ''}${music && on ? ' lit' : ''}${!music && on && ph !== 'picking' ? ' seen' : ''}${peekIdx.has(i) ? ' peek' : ''}${on && freshSet.has(i) ? ' fresh' : ''}" data-i="${i}" ${dis ? 'disabled' : ''} aria-label="${music ? 'Trecho' : 'Frame'} ${i + 1}${on ? (music ? ', toque para ouvir de novo' : ', projetado') : ''}">` +
          (music ? waveSvg(i + 1 + S.round * 5) : t ? `<img src="${esc(t)}" alt="" loading="lazy">` : '') + (peekIdx.has(i) && ph !== 'reveal' ? '<span class="peektag">só você</span>' : '') + (S.portrait && sceneIdx.has(i) ? '<span class="scenetag">cena</span>' : '') + `<span class="n">${i + 1}${'ABCDEFGH'[i]}</span>` + (on ? circleSvg(i + S.round * 8) : '') + '</button>';
      }).join('');
      lastRevealKey = revealKey;
      if (canPick && ph === 'picking' && !matchMedia('(pointer:coarse)').matches) $('#cells .cell:not(:disabled)')?.focus();
    }
    $('.sheet-strip .edge-b').textContent = ph === 'guessing' && amPicker && S.revealed.length < 3 ? (music ? '◂ toque para soltar mais um trecho' : '◂ toque para dar mais uma pista')
      : ph === 'picking' && amPicker ? (music ? '◂ escolha um trecho' : '◂ escolha um frame')
      : music && ph === 'guessing' ? '◂ toque num trecho para ouvir de novo' : '◂ ◂ ◂';
    if (ph === 'guessing' && amPicker && S.revealed.length < 3 && !music) $('.sheet-strip .edge-b').textContent = `◂ toque para dar mais uma pista`;

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
      `<li class="${p.guessed ? 'done' : p.skipped ? 'skip' : ''} ${p.id === S.pickerId ? 'pick' : ''} ${p.connected ? '' : 'off'}${p.isBot ? ' bot' : ''}">${esc(p.name)} <b>${p.score}</b>` +
      (p.fx || []).map((k) => `<i class="fxb">${FXNAME[k] || ''}</i>`).join('') + (p.id === S.me && p.shield ? '<i class="fxb sh">espelho</i>' : '') + (p.toll ? '<i class="fxb">pedágio</i>' : '') + '</li>').join('');
    renderHand(); applyFx();
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
    if (!listening) inp.placeholder = ph === 'guessing' ? (mine.guessed ? 'Você já acertou' : mine.skipped ? 'Ainda dá pra chutar' : music ? 'Música ou artista' : S.mode === 'char' ? 'Quem é?' : S.mode === 'game' ? 'Jogo' : 'Seu palpite') : ph === 'picking' ? `Esperando ${CLUE[0] === 'um' ? 'o' : 'a'} ${CLUE[1]}…` : 'Próximo rolo já vem';
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
        a: gp.buttons[0]?.pressed, b: gp.buttons[1]?.pressed, x: gp.buttons[2]?.pressed, y: gp.buttons[3]?.pressed, start: gp.buttons[9]?.pressed, mic: gp.buttons[4]?.pressed || gp.buttons[5]?.pressed, rt: gp.buttons[7]?.pressed, lb: gp.buttons[4]?.pressed, rb: gp.buttons[5]?.pressed,
        up: gp.buttons[12]?.pressed || gp.axes[1] < -0.6, down: gp.buttons[13]?.pressed || gp.axes[1] > 0.6,
        left: gp.buttons[14]?.pressed || gp.axes[0] < -0.6, right: gp.buttons[15]?.pressed || gp.axes[0] > 0.6,
      };
      const hit = (k) => now[k] && !prev[k];
      if (hit('up')) move(0, -1); if (hit('down')) move(0, 1);
      if (hit('left')) move(-1, 0); if (hit('right')) move(1, 0);
      if (hit('a')) { const el = document.activeElement; if (el && el.tagName === 'BUTTON') el.click(); else if (el && el.tagName === 'INPUT') el.form?.requestSubmit(); }
      if (S && S.mode === 'vf' && !$('#v-game').hidden) { if (hit('lb')) answerVF(true); if (hit('rb')) answerVF(false); }
      else if (hit('mic') && !$('#v-game').hidden && !micBtn.hidden) micBtn.click();
      if (hit('x') && !$('#v-game').hidden && !$('#b-skip').disabled) $('#b-skip').click();
      if (hit('y') && (!$('#v-game').hidden || !$('#v-lobby').hidden)) people($('#people').hidden);
      if (hit('rt') && !$('#hand').hidden) $('#hand-cards .pcard:not(:disabled)')?.focus();
      if (hit('b') && !$('#target').hidden) { $('#target-cancel').click(); pads[gp.index] = now; continue; }
      if (hit('b')) { if (!$('#people').hidden) people(false); else if (!$('#pause').hidden) pause(false); else if (localView) closeLocal(); else { const g = $('#in-guess'); if (!g.disabled && !$('#v-game').hidden) g.focus(); } }
      if (hit('start')) { if (!$('#v-lobby').hidden) $('#b-start').click(); else if (!$('#v-end').hidden) $('#b-again').click(); else if (!$('#v-game').hidden) pause($('#pause').hidden); }
      pads[gp.index] = now;
    }
    requestAnimationFrame(pollPads);
  }
  let polling = false;
  window.addEventListener('gamepadconnected', () => { if (!polling) { polling = true; requestAnimationFrame(pollPads); } });
})();
