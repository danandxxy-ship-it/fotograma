const { buildAnswerKey, check } = require('./matcher');

const cases = [
  [['O Senhor dos Anéis: A Sociedade do Anel', 'The Lord of the Rings: The Fellowship of the Ring'], [
    ['senhor dos aneis', 'correct'], ['senhor dos aneis sociedade do anel', 'correct'], ['lord of the rings', 'correct'],
    ['senhor dos aneis 2', 'wrong'], ['senor dos anes', 'correct'], ['harry potter', 'wrong']]],
  [['Toy Story 3', 'Toy Story 3'], [['toy story 3', 'correct'], ['toy story III', 'correct'], ['toy story tres', 'correct'], ['toy story 2', 'wrong'], ['toy stori 3', 'correct']]],
  [['Homem-Aranha: Através do Aranhaverso', 'Spider-Man: Across the Spider-Verse'], [
    ['homem aranha', 'correct'], ['homem-aranha atraves do aranhaverso', 'correct'], ['spiderman across the spiderverse', 'correct'],
    ['aranhaverso', 'correct'], ['homem formiga', 'wrong']]],
  [['It: A Coisa', 'It'], [['it', 'correct'], ['it a coisa', 'correct'], ['ti', 'wrong'], ['up', 'wrong']]],
  [['Up: Altas Aventuras', 'Up'], [['up', 'correct'], ['altas aventuras', 'correct'], ['it', 'wrong']]],
  [['Ataque dos Titãs', 'Shingeki no Kyojin', 'Attack on Titan'], [
    ['ataque dos titas', 'correct'], ['attack on titan', 'correct'], ['shingeki no kyojin', 'correct'], ['shingeki', 'close'], ['ataq dos tita', 'correct']]],
  [['Breaking Bad: A Química do Mal', 'Breaking Bad'], [['breaking bad', 'correct'], ['braking bad', 'correct'], ['breaking', 'close'], ['bad', 'wrong']]],
  [['Bob Esponja Calça Quadrada', 'SpongeBob SquarePants'], [['bob esponja', 'correct'], ['spongebob', 'correct'], ['sponge bob', 'correct'], ['bob', 'wrong']]],
  [['Blade Runner 2049', 'Blade Runner 2049'], [['blade runner 2049', 'correct'], ['blade runner', 'correct']]],
  [['Os Simpsons', 'The Simpsons'], [['simpsons', 'correct'], ['os simpson', 'correct'], ['simsons', 'correct'], ['the simpsons', 'correct']]],
  [['Duna: Parte Dois', 'Dune: Part Two'], [['duna parte 2', 'correct'], ['duna', 'correct'], ['dune part two', 'correct'], ['duna parte 3', 'wrong']]],
];

let fail = 0, total = 0;
for (const [titles, guesses] of cases) {
  const key = buildAnswerKey(titles);
  for (const [g, exp] of guesses) {
    total++;
    const r = check(g, key);
    const ok = r.result === exp;
    if (!ok) { fail++; console.log(`FALHOU  "${g}" → ${r.result} (${r.score.toFixed(2)}), esperado ${exp}  [${titles[0]}]`); }
  }
}

// ---------- modo música ----------
{
  const { cleanTitle, artistParts } = require('./music');
  const t = (a, b) => { total++; if (a !== b) { fail++; console.log(`FALHOU limpeza: "${a}" esperado "${b}"`); } };
  t(cleanTitle("Don't Stop Me Now - Remastered 2011"), "Don't Stop Me Now");
  t(cleanTitle('Bohemian Rhapsody (Remastered 2011)'), 'Bohemian Rhapsody');
  t(cleanTitle('Dancing Queen'), 'Dancing Queen');
  t(cleanTitle('Envolver (feat. Outro Artista)'), 'Envolver');
  t(cleanTitle('Evidências - Ao Vivo'), 'Evidências');
  t(cleanTitle('(I Can\'t Get No) Satisfaction'), '(I Can\'t Get No) Satisfaction');
  const song = buildAnswerKey([cleanTitle("Don't Stop Me Now - Remastered 2011")]);
  const artist = buildAnswerKey(['Queen', 'Queen']);
  const m = (guess, key, exp) => { total++; const r = check(guess, key).result; if (r !== exp) { fail++; console.log(`FALHOU música "${guess}" → ${r}, esperado ${exp}`); } };
  m('dont stop me now', song, 'correct'); m('don t stop me now', song, 'correct'); m('remastered', song, 'wrong');
  m('queen', artist, 'correct'); m('quenn', artist, 'correct'); m('queens', artist, 'correct'); m('king', artist, 'wrong');
  const dupla = buildAnswerKey(['Jorge & Mateus', 'Jorge & Mateus']);
  m('jorge e mateus', dupla, 'correct'); m('jorge & mateus', dupla, 'correct'); m('mateus', dupla, 'close');
  total++; if (artistParts('Anitta, Cardi B').join('|') !== 'Anitta|Cardi B') { fail++; console.log('FALHOU artistParts'); }
  console.log(`${total - fail}/${total} casos ok (com música)`);
  process.exit(fail ? 1 : 0);
}
