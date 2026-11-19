// Catálogo de títulos e frames reais via TMDB (themoviedb.org).
// Os frames são "backdrops" sem texto: cenas reais tiradas das obras.

const IMG = 'https://image.tmdb.org/t/p/';
const CATS = {
  filmes: { label: 'Filmes' },
  series: { label: 'Séries' },
  animes: { label: 'Animes' },
  desenhos: { label: 'Desenhos' },
};
const DIFF = {
  facil: { pages: [1, 6], votes: { movie: 3000, tv: 1200, anime: 500 } },
  medio: { pages: [1, 14], votes: { movie: 1000, tv: 400, anime: 150 } },
  dificil: { pages: [4, 30], votes: { movie: 250, tv: 120, anime: 40 } },
};

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

class TMDB {
  constructor(credential) {
    this.cred = String(credential || '').trim();
    this.bearer = this.cred.length > 60; // token v4 (JWT) ou chave v3
    this.detailCache = new Map();
    this.discoverCache = new Map();
  }
  async get(path, params = {}) {
    const u = new URL('https://api.themoviedb.org/3' + path);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const headers = { accept: 'application/json' };
    if (this.bearer) headers.authorization = 'Bearer ' + this.cred; else u.searchParams.set('api_key', this.cred);
    const r = await fetch(u, { headers });
    if (r.status === 401) throw new Error('Chave do TMDB inválida.');
    if (!r.ok) throw new Error('TMDB respondeu ' + r.status);
    return r.json();
  }
  async validate() { await this.get('/configuration'); return true; }

  // Busca uma página de títulos de uma categoria
  async discover(cat, diffKey) {
    const d = DIFF[diffKey] || DIFF.medio;
    const page = rnd(d.pages[0], d.pages[1]);
    const jobs = [];
    const base = { language: 'pt-BR', sort_by: 'popularity.desc', include_adult: 'false', page };
    if (cat === 'filmes') jobs.push(['movie', { ...base, without_genres: '16,99,10770', 'vote_count.gte': d.votes.movie }]);
    if (cat === 'series') jobs.push(['tv', { ...base, without_genres: '16,10767,10763,10764,99', 'vote_count.gte': d.votes.tv }]);
    if (cat === 'animes') {
      jobs.push(['tv', { ...base, with_genres: '16', with_original_language: 'ja', 'vote_count.gte': d.votes.anime }]);
      jobs.push(['movie', { ...base, page: rnd(1, Math.max(2, Math.ceil(d.pages[1] / 3))), with_genres: '16', with_original_language: 'ja', 'vote_count.gte': d.votes.anime }]);
    }
    if (cat === 'desenhos') {
      jobs.push(['tv', { ...base, with_genres: '16', 'vote_count.gte': d.votes.anime }]);
      jobs.push(['movie', { ...base, with_genres: '16', 'vote_count.gte': d.votes.movie / 2 }]);
    }
    const key = JSON.stringify(jobs);
    if (this.discoverCache.has(key)) return this.discoverCache.get(key);
    const res = await Promise.all(jobs.map(async ([type, p]) => {
      const j = await this.get('/discover/' + type, p);
      return (j.results || [])
        .filter((x) => x.backdrop_path)
        .filter((x) => cat !== 'desenhos' || x.original_language !== 'ja')
        .map((x) => ({ type, id: x.id, cat }));
    }));
    const list = res.flat();
    this.discoverCache.set(key, list);
    return list;
  }

  async details(type, id) {
    const k = type + id;
    if (this.detailCache.has(k)) return this.detailCache.get(k);
    const j = await this.get(`/${type}/${id}`, {
      language: 'pt-BR',
      append_to_response: 'images,alternative_titles,translations',
      include_image_language: 'null,xx',
    });
    const title = j.title || j.name;
    const original = j.original_title || j.original_name;
    const titles = [title, original];
    for (const t of j.translations?.translations || []) {
      if (['pt', 'en', 'es'].includes(t.iso_639_1)) titles.push(t.data?.title || t.data?.name);
    }
    for (const a of j.alternative_titles?.titles || j.alternative_titles?.results || []) {
      if (['BR', 'PT', 'US', 'GB', 'JP', 'ES', 'MX'].includes(a.iso_3166_1)) titles.push(a.title);
    }
    let backs = (j.images?.backdrops || []).filter((b) => (!b.iso_639_1 || b.iso_639_1 === 'xx') && b.aspect_ratio > 1.5);
    backs = shuffle(backs).slice(0, 8);
    const out = {
      id: k,
      title,
      original,
      year: (j.release_date || j.first_air_date || '').slice(0, 4),
      kind: type === 'movie' ? 'Filme' : 'Série',
      poster: j.poster_path ? IMG + 'w342' + j.poster_path : null,
      titles: [...new Set(titles.filter(Boolean))],
      frames: backs.map((b) => ({ full: IMG + 'w1280' + b.file_path, thumb: IMG + 'w300' + b.file_path })),
    };
    this.detailCache.set(k, out);
    return out;
  }

  async pick(cats, diff, used) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const cat = cats[rnd(0, cats.length - 1)];
      const list = shuffle([...(await this.discover(cat, diff))]).filter((x) => !used.has(x.type + x.id));
      for (const c of list.slice(0, 4)) {
        const d = await this.details(c.type, c.id);
        if (d.frames.length >= 4) {
          if (cat === 'animes') d.kind = 'Anime'; else if (cat === 'desenhos') d.kind = 'Desenho';
          return d;
        }
      }
    }
    throw new Error('Não achei títulos com frames suficientes. Tente outra categoria.');
  }
}

// ---------- Modo demonstração (sem internet / testes) ----------
const DEMO = [
  ['Toy Story 3', 'Toy Story 3', 'desenhos', 2010], ['Breaking Bad: A Química do Mal', 'Breaking Bad', 'series', 2008],
  ['Ataque dos Titãs', 'Shingeki no Kyojin', 'animes', 2013], ['O Senhor dos Anéis: A Sociedade do Anel', 'The Lord of the Rings: The Fellowship of the Ring', 'filmes', 2001],
  ['Os Simpsons', 'The Simpsons', 'desenhos', 1989], ['Duna: Parte Dois', 'Dune: Part Two', 'filmes', 2024],
  ['Stranger Things', 'Stranger Things', 'series', 2016], ['Naruto', 'Naruto', 'animes', 2002],
  ['Interestelar', 'Interstellar', 'filmes', 2014], ['Bob Esponja Calça Quadrada', 'SpongeBob SquarePants', 'desenhos', 1999],
];
class Demo {
  async validate() { return true; }
  async pick(cats, _d, used) {
    const pool = DEMO.map((d, i) => ({ d, i })).filter(({ d, i }) => cats.includes(d[2]) && !used.has('demo' + i));
    const src = pool.length ? pool : DEMO.map((d, i) => ({ d, i }));
    const { d, i } = src[rnd(0, src.length - 1)];
    return {
      id: 'demo' + i, title: d[0], original: d[1], year: String(d[3]),
      kind: CATS[d[2]].label.replace(/s$/, '').replace('Série', 'Série'),
      poster: `/demo/poster/${i}.svg`, titles: [d[0], d[1]],
      frames: Array.from({ length: 8 }, (_, n) => ({ full: `/demo/frame/${i}/${n}.svg`, thumb: `/demo/frame/${i}/${n}.svg` })),
    };
  }
}
function demoSvg(seed, n, w = 1280, h = 720) {
  let s = seed * 97 + n * 13 + 7; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const hue = Math.floor(r() * 360);
  let shapes = '';
  for (let k = 0; k < 7; k++) {
    shapes += `<circle cx="${r() * w}" cy="${r() * h}" r="${60 + r() * 260}" fill="hsl(${(hue + k * 40) % 360} ${40 + r() * 40}% ${25 + r() * 45}%)" opacity=".75"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${hue} 30% 14%)"/>${shapes}<text x="40" y="${h - 40}" font-family="sans-serif" font-size="42" fill="#fff" opacity=".6">DEMO ${seed}-${n}</text></svg>`;
}

module.exports = { TMDB, Demo, demoSvg, CATS, DIFF };
