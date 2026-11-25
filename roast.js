// Fotograma — créditos finais com comentários: exalta quem ganhou, zoa quem ficou por último
// e distribui prêmios engraçados a partir do que cada um fez na partida.
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const s = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

const blank = () => ({ hits: 0, firsts: 0, exacts: 0, wrong: 0, close: 0, skips: 0, fastest: 0, actor: 0, atkSent: 0, atkTaken: 0, blank: 0 });

function roast(players, rounds) {
  const ranked = [...players].sort((a, b) => b.score - a.score);
  if (!ranked.length) return null;
  const st = (p) => p.st || blank();
  const first = ranked[0], second = ranked[1], last = ranked[ranked.length - 1];
  const out = { winner: null, loser: null, awards: [] };

  // ---------- vencedor ----------
  const tied = ranked.filter((p) => p.score === first.score && p !== first);
  const w = st(first), gap = second ? first.score - second.score : 0;
  let praise;
  if (first.score === 0) praise = pick([
    'Ninguém fez ponto. Foi a sessão mais silenciosa da história do cinema.',
    'Zero a zero. O projecionista ficou com vergonha alheia.',
  ]);
  else if (tied.length) praise = `Empate no topo com ${tied.map((p) => p.name).join(' e ')}. Vão ter que decidir no par ou ímpar.`;
  else if (!second) praise = pick([`Jogou sozinho e ganhou. Ninguém pode dizer que foi sorte… nem que foi difícil.`, `Campeão absoluto de uma sala de uma pessoa só. Ainda conta.`]);
  else if (gap >= first.score * 0.45) praise = pick([
    `Ganhou com ${gap} pontos de vantagem. Não foi partida, foi atropelamento.`,
    `${gap} pontos na frente do segundo. Já pode cobrar ingresso pra ver jogar.`,
    `Deu aula. O resto da sala só assistiu os créditos.`,
  ]);
  else if (gap <= 60) praise = pick([
    `Ganhou por só ${gap} pontos. Foi no detalhe, que nem final de novela.`,
    `Vitória por ${gap} pontos. ${second.name} vai sonhar com essa partida hoje.`,
  ]);
  else if (w.firsts >= 3) praise = `Foi o primeiro a acertar ${w.firsts} vezes. Quando os outros iam digitar, já tinha acabado.`;
  else if (w.exacts >= 3) praise = `Acertou o título exato ${w.exacts} vezes. Decorou o catálogo inteiro, só pode.`;
  else if (w.hits >= Math.max(3, rounds - 1)) praise = `Acertou ${w.hits} de ${rounds}. Já pode trocar o sofá pela cadeira de crítico.`;
  else praise = pick([
    'Merece a estatueta e o discurso de agradecimento chorando.',
    'Assiste filme até nos créditos, dá pra ver.',
    'Esse aí não pisca nem no trailer.',
  ]);
  out.winner = { id: first.id, name: first.name, score: first.score, text: praise };

  // ---------- último lugar ----------
  if (ranked.length >= 2 && last !== first && last.score < first.score) {
    const l = st(last);
    const humanLast = !last.isBot;
    const botAbove = humanLast && ranked.find((p) => p.isBot && p.score > last.score);
    const opts = [];
    if (last.isBot) opts.push(`É um bot e mesmo assim ficou em último. Vai ser desligado da tomada.`, `Até a inteligência artificial passou vergonha hoje.`);
    if (botAbove) opts.push(`Perdeu para o ${botAbove.name}. Para um BOT. Pensa nisso antes de dormir.`);
    if (last.score === 0) opts.push(`Terminou com zero pontos. Nem o pipoqueiro errou tanto.`, `Zero pontos. Tava assistindo outro filme, só pode.`, `Zero. Nem por acidente acertou um.`);
    if (l.skips >= 3) opts.push(`Disse "não sei" ${l.skips} vezes. Honestidade a gente respeita, ponto a gente não dá.`);
    if (l.wrong >= 6) opts.push(`Chutou ${l.wrong} vezes e errou. Chuta igual zagueiro em final de campeonato.`);
    if (l.close >= 2) opts.push(`Chegou perto ${l.close} vezes e não fechou nenhuma. Especialista em quase.`);
    if (l.actor >= 1) opts.push(`Chutou o nome do ator. A pergunta era o personagem, campeão.`);
    if (l.atkTaken >= 3) opts.push(`Levou ${l.atkTaken} poderes na cara. A sala inteira tinha um alvo, e era você.`);
    if (l.blank >= rounds && rounds > 1) opts.push(`Passou ${rounds} rodadas sem pontuar. Veio só pela pipoca.`);
    if (!opts.length || Math.random() < 0.35) opts.push(
      'Ficou em último. A próxima sessão é por conta dele: pipoca pra todo mundo.',
      'Deve achar que Titanic é filme de terror.',
      'A TV tá de frente pra você, tá? Só pra confirmar.',
      'Vê filme no celular com o brilho no mínimo, certeza.',
      'Dorme nos primeiros 10 minutos de qualquer filme.',
      'Seu histórico de streaming é só "continuar assistindo" do mesmo episódio.',
    );
    out.loser = { id: last.id, name: last.name, score: last.score, text: pick(opts) };
  }

  // ---------- prêmios ----------
  const used = new Set();
  const award = (key, min, icon, title, txt, low = false) => {
    let best = null;
    for (const p of ranked) {
      const v = st(p)[key]; if (!v || v < min) continue;
      if (!best || (low ? v < st(best)[key] : v > st(best)[key])) best = p;
    }
    if (!best) return;
    // evita dar tudo para a mesma pessoa quando dá pra variar
    if (used.has(best.id) && ranked.length > 2) {
      const alt = ranked.find((p) => p !== best && !used.has(p.id) && st(p)[key] >= min && st(p)[key] === st(best)[key]);
      if (alt) best = alt;
    }
    const count = [...out.awards].filter((a) => a.id === best.id).length;
    if (count >= 2) return; // no máximo dois prêmios por pessoa
    used.add(best.id);
    out.awards.push({ id: best.id, name: best.name, icon, title, text: txt(st(best)[key]) });
  };
  award('fastest', 1, '⚡', 'Dedo mais rápido', (v) => `Acertou em ${(v / 1000).toFixed(1).replace('.', ',')} s. Nem leu a pergunta.`, true);
  award('exacts', 2, '🎯', 'Mira de sniper', (v) => `Cravou o título exato ${s(v, 'vez', 'vezes')}.`);
  award('wrong', 5, '🎲', 'Chutador profissional', (v) => `Errou ${s(v, 'chute', 'chutes')}. Na quantidade alguma hora vai.`);
  award('close', 2, '😬', 'Rei do quase', (v) => `Chegou perto ${s(v, 'vez', 'vezes')} e morreu na praia.`);
  award('skips', 2, '🤷', 'Não sei, não vi', (v) => `Apertou "não sei" ${s(v, 'vez', 'vezes')}. Sincero até demais.`);
  award('actor', 1, '🎭', 'Fã do elenco', (v) => `Chutou o ator no lugar do personagem ${s(v, 'vez', 'vezes')}.`);
  award('atkSent', 2, '💣', 'Encrenqueiro', (v) => `Jogou ${s(v, 'poder', 'poderes')} nos amigos. Não tem amigos agora.`);
  award('atkTaken', 2, '🥊', 'Saco de pancada', (v) => `Levou ${s(v, 'ataque', 'ataques')}. Alguém aqui não gosta de você.`);
  out.awards = out.awards.slice(0, 4);
  return out;
}

module.exports = { roast, blank };
