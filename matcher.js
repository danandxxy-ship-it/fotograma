// Correção inteligente: aceita erros de digitação, falta de acento, artigos,
// subtítulos, números romanos e títulos em outras línguas.

const ROMAN = { ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9', x: '10', xi: '11', xii: '12' };
const NUMWORDS = {
  um: '1', uma: '1', one: '1', dois: '2', duas: '2', two: '2', tres: '3', three: '3', quatro: '4', four: '4',
  cinco: '5', five: '5', seis: '6', six: '6', sete: '7', seven: '7', oito: '8', eight: '8', nove: '9', nine: '9', dez: '10', ten: '10'
};
const ARTICLES = new Set(['o', 'a', 'os', 'as', 'the', 'um', 'uma', 'el', 'la', 'los', 'las', 'le', 'les', 'l', 'an']);
const FILLER = new Set(['filme', 'serie', 'anime', 'desenho', 'movie', 'the', 'o', 'a', 'de', 'do', 'da', 'dos', 'das', 'e', 'and', 'of', 'no', 'na', 'em']);

function baseNorm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' e ')
    .replace(/['’`´]/g, '')
    .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokens(s, { keepNumberWords = false } = {}) {
  let t = baseNorm(s).split(' ').filter(Boolean);
  t = t.map((w, i) => {
    if (ROMAN[w] && (i > 0 || t.length === 1)) return ROMAN[w];
    if (!keepNumberWords && NUMWORDS[w] && i > 0) return NUMWORDS[w];
    return w;
  });
  while (t.length > 1 && ARTICLES.has(t[0])) t.shift();
  return t;
}

const norm = (s) => tokens(s).join(' ');

function damerau(a, b) {
  const al = a.length, bl = b.length;
  if (!al) return bl; if (!bl) return al;
  const d = Array.from({ length: al + 1 }, (_, i) => { const r = new Array(bl + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= bl; j++) d[0][j] = j;
  for (let i = 1; i <= al; i++) {
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[al][bl];
}

const ratio = (a, b) => (!a && !b) ? 1 : 1 - damerau(a, b) / Math.max(a.length, b.length);

// Semelhança palavra por palavra (ordem trocada, palavras com erro)
function tokenScore(gt, ct) {
  const g = gt.filter((w) => !FILLER.has(w)), c = ct.filter((w) => !FILLER.has(w));
  if (!g.length || !c.length) return 0;
  let hit = 0;
  for (const w of c) {
    let best = 0;
    for (const v of g) best = Math.max(best, w.length <= 3 ? (w === v ? 1 : 0) : ratio(w, v));
    if (best >= 0.8) hit += best;
  }
  const extra = Math.max(0, g.length - c.length) * 0.15;
  return Math.max(0, hit / c.length - extra);
}

// O palpite é um trecho do título ("bob esponja", "aranhaverso", "blade runner")
function spanScore(gt, ct) {
  const gs = gt.join(''), total = ct.join('').length;
  if (gs.length < 5 || !total) return 0;
  for (let i = 0; i < ct.length; i++) {
    let acc = '';
    for (let j = i; j < ct.length; j++) {
      acc += ct[j];
      if (acc.length > gs.length + 1) break;
      const fuzzy = acc.length >= 8 ? damerau(acc, gs) <= 1 : acc === gs;
      if (!fuzzy) continue;
      const span = ct.slice(i, j + 1).filter((w) => !FILLER.has(w));
      const cover = acc.length / total;
      if (cover >= 0.35 && (span.length >= 2 || acc.length >= 9)) return 0.88;
      if (cover >= 0.35) return 0.7;
    }
  }
  return 0;
}

const nums = (t) => t.filter((w) => /^\d+$/.test(w) && w.length < 4); // ignora anos (2049 etc. continuam no texto)

function variants(title) {
  const out = new Set();
  const raw = String(title || '');
  if (!raw.trim()) return out;
  const add = (x) => { const n = norm(x); if (n) out.add(n); };
  add(raw);
  add(raw.replace(/\(.*?\)/g, ''));
  const sub = raw.split(/\s*[:–—]\s*|\s+-\s+/);
  if (sub.length > 1) { add(sub[0]); add(sub.slice(1).join(' ')); }
  return out;
}

// "Exato" = o título completo (em português ou o original), ignorando só maiúsculas, acentos e pontuação
const exactForm = (s) => norm(s).replace(/ /g, '');

function buildAnswerKey(titles) {
  const all = new Set();
  titles.forEach((t) => variants(t).forEach((v) => all.add(v)));
  const key = [...all].map((v) => ({ text: v, toks: v.split(' '), squash: v.replace(/ /g, '') }));
  key.exact = new Set(titles.slice(0, 2).filter(Boolean).map(exactForm));
  return key;
}

/**
 * @returns {{result:'correct'|'close'|'wrong', score:number}}
 */
function check(guess, key) {
  const gt = tokens(guess);
  const g = gt.join(' ');
  const gs = g.replace(/ /g, '');
  if (gs.length < 2) return { result: 'wrong', score: 0 };
  const gn = nums(gt);
  let best = 0;
  for (const c of key) {
    const cn = nums(c.toks);
    // "Toy Story 2" nunca vale para "Toy Story 3"
    if (gn.length && cn.length && gn.join() !== cn.join()) continue;
    if (gn.length && !cn.length) continue;
    const len = c.squash.length;
    let s = Math.max(ratio(g, c.text), ratio(gs, c.squash), tokenScore(gt, c.toks));
    if (len >= 5 && (` ${g} `).includes(` ${c.text} `)) s = Math.max(s, 0.95);
    s = Math.max(s, spanScore(gt, c.toks));
    // títulos curtos exigem quase exatidão
    if (len <= 3) s = gs === c.squash ? 1 : Math.min(s, 0.6);
    else if (len <= 6) { const d = damerau(gs, c.squash); s = d === 0 ? 1 : d === 1 ? 0.86 : Math.min(s, 0.7); }
    if (s > best) best = s;
  }
  if (best >= 0.8) return { result: 'correct', score: best, exact: !!key.exact && key.exact.has(exactForm(guess)) };
  if (best >= 0.66) return { result: 'close', score: best };
  return { result: 'wrong', score: best };
}

module.exports = { buildAnswerKey, check, norm };
