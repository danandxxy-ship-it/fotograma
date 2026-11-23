/* Fotograma — modos extras: Games (Steam), Personagens (TMDB + Jikan/MyAnimeList) e Verdadeiro ou Falso. */

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const IMG = 'https://image.tmdb.org/t/p/';

// fila simples: respeita o limite de cada API
function queue(gap) {
  let last = 0, chain = Promise.resolve();
  return (url) => (chain = chain.then(async () => {
    const wait = last + gap - Date.now(); if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    return fetchJson(url);
  }));
}

// busca JSON com tempo limite e 2 tentativas; erro com o nome do serviço
async function fetchJson(url, opts = {}) {
  const host = new URL(url).hostname;
  let last;
  for (let t = 0; t < 2; t++) {
    const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal, headers: { accept: 'application/json', ...(opts.headers || {}) } });
      if (r.status === 429 || r.status >= 500) throw new Error(`${host} respondeu ${r.status}`);
      if (!r.ok) { const e = new Error(`${host} respondeu ${r.status}`); e.fatal = true; throw e; }
      return await r.json();
    } catch (e) {
      last = e.fatal ? e : new Error(`sem conexão com ${host}${e.cause && e.cause.code ? ' (' + e.cause.code + ')' : e.name === 'AbortError' ? ' (demorou demais)' : ''}`);
      if (e.fatal) break;
      await new Promise((r) => setTimeout(r, 1200));
    } finally { clearTimeout(to); }
  }
  throw last;
}

// =============== GAMES (Steam Store, sem chave) ===============
// [appid, dificuldade 1-3, apelidos aceitos]
const GAMES = [
  [730, 1, ['cs2', 'counter strike', 'cs go', 'csgo', 'cs']], [570, 1, ['dota']], [271590, 1, ['gta 5', 'gta v', 'gta', 'grand theft auto 5']],
  [1174180, 1, ['red dead 2', 'rdr2', 'red dead']], [292030, 1, ['witcher 3', 'the witcher', 'witcher']], [1091500, 1, ['cyberpunk']],
  [1245620, 1, []], [413150, 1, ['stardew']], [105600, 1, []], [945360, 1, []], [1097150, 1, []], [578080, 1, ['pubg', 'battlegrounds']],
  [1172470, 1, ['apex']], [359550, 1, ['r6', 'rainbow six', 'siege']], [1086940, 1, ['bg3', 'baldurs gate']], [1593500, 1, ['god of war']],
  [1817070, 1, ['spider man', 'homem aranha', 'spiderman']], [1888930, 1, ['the last of us', 'tlou']], [2050650, 1, ['re4', 'resident evil 4', 'resident evil']],
  [489830, 1, ['skyrim']], [377160, 1, []], [620, 1, ['portal']], [220, 1, ['half life 2', 'hl2', 'half life']], [4000, 1, ['gmod']],
  [1623730, 1, []], [553850, 1, ['helldivers']], [1966720, 1, []], [739630, 1, []], [381210, 1, ['dbd']], [367520, 1, []], [1145360, 1, []],
  [1551360, 1, ['forza 5', 'forza horizon', 'forza']], [1222670, 1, ['sims 4', 'the sims', 'sims']], [2357570, 1, ['overwatch']],
  [1971870, 1, ['mk1', 'mortal kombat']], [1364780, 1, ['sf6', 'street fighter']], [1778820, 1, ['tekken']],
  [252490, 2, []], [892970, 2, []], [1172620, 2, []], [264710, 2, []], [275850, 2, []], [814380, 2, []], [374320, 2, ['dark souls 3', 'dark souls']],
  [582010, 2, ['mh world', 'monster hunter']], [230410, 2, []], [238960, 2, ['poe']], [550, 2, ['left 4 dead 2', 'l4d2', 'left 4 dead']],
  [440, 2, ['tf2', 'team fortress']], [322330, 2, ['dont starve']], [504230, 2, []], [588650, 2, []], [250900, 2, ['isaac', 'binding of isaac']],
  [646570, 2, []], [255710, 2, ['cities skylines']], [289070, 2, ['civilization 6', 'civ 6', 'civilization']], [883710, 2, ['re2', 'resident evil 2']],
  [601150, 2, ['devil may cry 5', 'dmc5', 'devil may cry']], [22380, 2, ['new vegas']], [1240440, 2, ['halo']], [1293830, 2, ['forza 4']],
  [1716740, 2, []], [1517290, 2, ['battlefield']], [976730, 2, ['halo mcc']], [1938090, 2, ['cod', 'call of duty']], [1172380, 2, ['star wars jedi', 'jedi fallen order']],
  [1687950, 2, ['persona 5']], [2215430, 2, ['ghost of tsushima']], [1151640, 2, ['horizon zero dawn', 'horizon']], [1659420, 2, ['uncharted']],
  [1462040, 2, ['ff7', 'final fantasy 7', 'final fantasy vii']], [1426210, 2, []], [1222140, 2, ['detroit']], [524220, 2, ['nier', 'nier automata']],
  [2379780, 2, []], [1145350, 2, ['hades 2']], [1903340, 2, ['expedition 33', 'clair obscur']], [2246340, 2, ['monster hunter wilds']],
  [1868140, 3, []], [268500, 3, ['xcom']], [1158310, 3, ['ck3', 'crusader kings']], [394360, 3, ['hoi4', 'hearts of iron']], [1446780, 3, ['mh rise']],
  [8930, 3, ['civ 5', 'civilization 5']], [1599340, 3, []], [1144200, 3, []], [1203220, 3, ['naraka']], [261550, 3, ['bannerlord', 'mount and blade']],
  [1449850, 3, ['yugioh', 'master duel']], [1774580, 3, ['jedi survivor']], [1238810, 3, ['battlefield 5', 'battlefield v']], [1113000, 3, ['persona 4']],
  [1290000, 3, ['powerwash']], [427520, 3, []], [294100, 3, []], [1794680, 3, []], [632360, 3, ['risk of rain']], [2420110, 3, ['horizon forbidden west']],
];
const cleanGame = (n) => String(n).replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim();
function gameVariants(name) {
  const v = [name];
  const base = name.replace(/\s*[-–:]\s*(Game of the Year|GOTY|Definitive|Enhanced|Complete|Remastered|Legacy|Deluxe|Anniversary|Royal)\b.*$/i, '').replace(/\s+(Legacy|Enhanced|Remastered)$/i, '').trim();
  if (base && base !== name) v.push(base);
  const noSub = name.split(/\s*:\s*/)[0];
  if (noSub.length >= 4 && noSub !== name) v.push(noSub);
  return v;
}

class Games {
  constructor() { this.get = queue(350); this.cache = new Map(); this.bad = new Set(); }
  async pick(diff, used) {
    const tiers = diff === 'facil' ? [1] : diff === 'dificil' ? [2, 3] : [1, 2];
    const list = shuffle(GAMES.filter((g) => tiers.includes(g[1]) && !used.has('g' + g[0]) && !this.bad.has(g[0])));
    for (const [id, , alias] of list.slice(0, 6)) {
      try {
        const t = await this.load(id, alias);
        if (t) return t;
      } catch { /* tenta o próximo */ }
    }
    throw new Error('Não consegui buscar games na Steam agora. Tente de novo em instantes.');
  }
  async load(id, alias) {
    if (this.cache.has(id)) return this.cache.get(id);
    const j = await this.get(`https://store.steampowered.com/api/appdetails?appids=${id}&l=brazilian&cc=br`);
    const d = j && j[id] && j[id].success && j[id].data;
    const adult = d && (d.content_descriptors?.ids || []).some((x) => x === 3 || x === 4);
    if (!d || d.type !== 'game' || adult || !(d.screenshots || []).length) { this.bad.add(id); return null; }
    const name = cleanGame(d.name);
    // a 1ª captura costuma ser arte com o logo: vai pro fim da fila
    const shots = d.screenshots.slice(1).concat(d.screenshots.slice(0, 1));
    const frames = shuffle(shots.slice(0, -1)).slice(0, 7).concat(shots.length > 1 ? [] : shots).slice(0, 8)
      .map((s) => ({ full: s.path_full, thumb: s.path_thumbnail }));
    const t = {
      id: 'g' + id, isGame: true, title: name, original: d.developers ? d.developers.join(', ') : '', year: ((d.release_date?.date || '').match(/\d{4}/) || [''])[0],
      kind: 'Game', poster: d.header_image, titles: [...new Set([...gameVariants(name), ...alias])], frames,
    };
    this.cache.set(id, t);
    return t;
  }
}

// =============== PERSONAGENS ===============
const NOT_CHAR = /^(self|himself|herself|themselves|narrator|narrador|host|apresentador|voice|various|guest|cameo)\b/i;
function charNames(raw) {
  const parts = String(raw).replace(/\(.*?\)/g, '').split(/\s*\/\s*|\s*;\s*/).map((s) => s.replace(/["“”]/g, '').trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    out.push(p);
    const words = p.split(/\s+/).filter((w) => !/^(dr|mr|mrs|ms|sr|sra|dra|sir|lady|lord|capitão|captain|agent|agente)\.?$/i.test(w));
    if (words.length >= 2) {
      if (words[0].length >= 3) out.push(words[0]);
      const last = words[words.length - 1]; if (last.length >= 4) out.push(last);
    }
  }
  return [...new Set(out)];
}

class Characters {
  constructor() { this.jikan = queue(450); this.people = new Map(); this.top = new Map(); }

  async pick(catalog, src, diff, used) {
    const canLive = !!catalog && typeof catalog.get === 'function';
    const wantLive = src === 'live' || (src !== 'anime' && canLive && Math.random() < 0.5);
    if (src === 'live' && !canLive) throw new Error('Personagens de filmes e séries precisam do token do TMDB.');
    const order = src === 'live' ? ['live'] : src === 'anime' ? ['jikan', 'anilist'] : wantLive ? ['live', 'jikan', 'anilist'] : ['jikan', 'anilist', ...(canLive ? ['live'] : [])];
    const errs = [];
    for (const k of order) {
      try {
        if (k === 'live') return await this.live(catalog, diff, used);
        if (k === 'jikan') return await this.anime(diff, used);
        return await this.anilist(diff, used);
      } catch (e) { errs.push(e.message); }
    }
    throw new Error(errs[errs.length - 1] || 'Não consegui buscar personagens agora.');
  }

  // filmes e séries: fotos do ator, mas vale o nome do personagem
  async live(catalog, diff, used) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const cat = Math.random() < 0.55 ? 'filmes' : 'series';
      const list = shuffle([...(await catalog.discover(cat, diff))]).slice(0, 3);
      for (const c of list) {
        const type = c.type;
        const j = await catalog.get(`/${type}/${c.id}`, { language: 'pt-BR', append_to_response: type === 'tv' ? 'aggregate_credits' : 'credits' });
        const cast = type === 'tv'
          ? (j.aggregate_credits?.cast || []).map((x) => ({ ...x, character: (x.roles || [])[0]?.character }))
          : (j.credits?.cast || []);
        const maxIdx = diff === 'facil' ? 1 : diff === 'dificil' ? 5 : 3;
        const ok = cast.slice(0, maxIdx).filter((x) => x.profile_path && x.character && !NOT_CHAR.test(x.character) && !/\(voice\)|\(voz\)/i.test(x.character));
        const ch = ok.find((x) => !used.has('c' + type + c.id + ':' + x.id)) || null;
        if (!ch) continue;
        const names = charNames(ch.character);
        if (!names.length) continue;
        let profiles = [];
        try { const im = await catalog.get(`/person/${ch.id}/images`); profiles = (im.profiles || []).map((p) => p.file_path); } catch {}
        if (!profiles.includes(ch.profile_path)) profiles.unshift(ch.profile_path);
        profiles = [ch.profile_path, ...shuffle(profiles.filter((p) => p !== ch.profile_path))].slice(0, 3);
        let backs = [];
        try { const d = await catalog.details(type, c.id); backs = d.frames.slice(0, 8 - profiles.length).map((f) => ({ ...f, scene: true })); } catch {}
        const work = j.title || j.name;
        return {
          id: 'c' + type + c.id + ':' + ch.id, isChar: true, title: names[0], original: `${ch.name} em ${work}`,
          year: (j.release_date || j.first_air_date || '').slice(0, 4), kind: 'Personagem', poster: IMG + 'w342' + ch.profile_path,
          titles: names, actorTitles: [ch.name], work, workKind: type === 'movie' ? 'filme' : 'série', face: IMG + 'w185' + ch.profile_path,
          frames: profiles.map((p) => ({ full: IMG + 'h632' + p, thumb: IMG + 'w185' + p, portrait: true })).concat(backs),
        };
      }
    }
    throw new Error('Não achei personagens agora. Tente de novo.');
  }

  // animes: a imagem é o próprio personagem (MyAnimeList, via Jikan)
  async anime(diff, used) {
    const pages = diff === 'facil' ? [1, 2] : diff === 'dificil' ? [4, 14] : [1, 6];
    for (let attempt = 0; attempt < 4; attempt++) {
      const page = rnd(pages[0], pages[1]);
      let list = this.top.get(page);
      if (!list) { list = (await this.jikan(`https://api.jikan.moe/v4/top/characters?page=${page}`)).data || []; this.top.set(page, list); }
      const c = shuffle(list.filter((x) => !used.has('ca' + x.mal_id) && x.images?.jpg?.image_url))[0];
      if (!c) continue;
      let full = {}, pics = [];
      try { full = (await this.jikan(`https://api.jikan.moe/v4/characters/${c.mal_id}/full`)).data || {}; } catch {}
      try { pics = ((await this.jikan(`https://api.jikan.moe/v4/characters/${c.mal_id}/pictures`)).data || []).map((p) => p.jpg?.image_url).filter(Boolean); } catch {}
      let name = String(c.name || '');
      if (name.includes(', ')) name = name.split(', ').reverse().join(' ');
      const names = [...new Set([name, ...charNames(name).slice(1), ...(c.nicknames || []).filter((n) => n.length >= 3)])];
      const main = c.images.jpg.image_url;
      const imgs = [main, ...shuffle(pics.filter((p) => p !== main))].slice(0, 6);
      const animes = (full.anime || []).sort((a, b) => (a.role === 'Main' ? -1 : 0) - (b.role === 'Main' ? -1 : 0));
      const work = animes[0]?.anime?.title || '';
      const workImgs = animes.slice(0, 2).map((a) => a.anime?.images?.jpg?.large_image_url || a.anime?.images?.jpg?.image_url).filter(Boolean);
      return {
        id: 'ca' + c.mal_id, isChar: true, title: name, original: work ? `de ${work}` : '', year: '', kind: 'Personagem de anime',
        poster: main, titles: names, actorTitles: null, work, workKind: 'anime', face: main,
        frames: imgs.map((u) => ({ full: u, thumb: u, portrait: true })).concat(workImgs.map((u) => ({ full: u, thumb: u, portrait: true, scene: true }))).slice(0, 8),
      };
    }
    throw new Error('Não consegui buscar personagens de anime agora. Tente de novo.');
  }
}

// reserva dos animes: AniList (GraphQL, sem chave)
Characters.prototype.anilist = async function (diff, used) {
  const page = diff === 'facil' ? rnd(1, 2) : diff === 'dificil' ? rnd(4, 12) : rnd(1, 5);
  const query = `query($p:Int){Page(page:$p,perPage:50){characters(sort:FAVOURITES_DESC){id name{full alternative} image{large}
    media(perPage:3,sort:POPULARITY_DESC){nodes{type title{romaji english} coverImage{large}}}}}}`;
  const j = await fetchJson('https://graphql.anilist.co', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query, variables: { p: page } }) });
  const list = shuffle((j.data?.Page?.characters || []).filter((c) => c.image?.large && !used.has('cl' + c.id) && !/default/.test(c.image.large)));
  const c = list[0];
  if (!c) throw new Error('AniList não devolveu personagens.');
  const name = c.name.full;
  const media = (c.media?.nodes || []).filter((m) => m.type === 'ANIME').concat((c.media?.nodes || []).filter((m) => m.type !== 'ANIME'));
  const work = media[0] ? (media[0].title.english || media[0].title.romaji) : '';
  return {
    id: 'cl' + c.id, isChar: true, title: name, original: work ? `de ${work}` : '', year: '', kind: 'Personagem de anime',
    poster: c.image.large, titles: [...new Set([name, ...charNames(name).slice(1), ...(c.name.alternative || []).filter((n) => n && n.length >= 3)])],
    actorTitles: null, work, workKind: media[0] && media[0].type !== 'ANIME' ? 'mangá' : 'anime', face: c.image.large,
    frames: [{ full: c.image.large, thumb: c.image.large, portrait: true }].concat(media.slice(0, 2).map((m) => ({ full: m.coverImage.large, thumb: m.coverImage.large, portrait: true, scene: true }))),
  };
};

// =============== VERDADEIRO OU FALSO ===============
// [afirmação, verdadeira?, explicação]
const VF = [
  ['Titanic (1997) ganhou 11 Oscars.', true, 'Empatou com Ben-Hur e O Retorno do Rei como recordista.'],
  ['O Rei Leão foi o primeiro longa de animação da Disney.', false, 'O primeiro foi Branca de Neve e os Sete Anões, de 1937.'],
  ['Toy Story foi o primeiro longa feito todo em computação gráfica.', true, 'Lançado pela Pixar em 1995.'],
  ['Em Breaking Bad, Walter White era professor de química.', true, 'Ele dava aula numa escola de ensino médio em Albuquerque.'],
  ['Friends teve 12 temporadas.', false, 'Foram 10 temporadas, de 1994 a 2004.'],
  ['Em O Império Contra-Ataca, Darth Vader diz "Luke, eu sou seu pai".', false, 'A fala é "Não, eu sou seu pai". O "Luke" nunca é dito.'],
  ['Pikachu é um Pokémon do tipo elétrico.', true, 'É o mascote elétrico da franquia.'],
  ['Naruto Uzumaki é do clã Uchiha.', false, 'Uchiha é o clã do Sasuke. Naruto é do clã Uzumaki.'],
  ['Em Dragon Ball, Goku é um saiyajin.', true, 'Ele nasceu no planeta Vegeta com o nome Kakarotto.'],
  ['Bob Esponja mora num abacaxi no fundo do mar.', true, 'Fica na Fenda do Biquíni.'],
  ['O Coringa do filme de 2019 foi interpretado por Heath Ledger.', false, 'Foi Joaquin Phoenix. Heath Ledger foi o Coringa de O Cavaleiro das Trevas (2008).'],
  ['Heath Ledger ganhou um Oscar póstumo pelo Coringa de O Cavaleiro das Trevas.', true, 'Melhor ator coadjuvante, em 2009.'],
  ['Leonardo DiCaprio ganhou o Oscar por Titanic.', false, 'Ele só ganhou em 2016, por O Regresso.'],
  ['Stranger Things se passa na cidade de Springfield.', false, 'A cidade é Hawkins, em Indiana. Springfield é dos Simpsons.'],
  ['Minecraft é o jogo mais vendido de todos os tempos.', true, 'Passou de 300 milhões de cópias.'],
  ['Mario foi criado pela Sega.', false, 'Mario é da Nintendo, criado por Shigeru Miyamoto. O mascote da Sega é o Sonic.'],
  ['Em The Legend of Zelda, Zelda é o nome do herói de roupa verde.', false, 'O herói é Link. Zelda é a princesa.'],
  ['GTA V se passa em Vice City.', false, 'Se passa em Los Santos, inspirada em Los Angeles.'],
  ['Kratos é o protagonista de God of War.', true, 'O espartano é o personagem principal da série.'],
  ['Interestelar foi dirigido por Steven Spielberg.', false, 'O diretor é Christopher Nolan.'],
  ['A Origem (Inception) foi dirigido por Christopher Nolan.', true, 'Lançado em 2010.'],
  ['Shrek é um filme da Pixar.', false, 'Shrek é da DreamWorks.'],
  ['Up: Altas Aventuras é da Pixar.', true, 'Lançado em 2009, ganhou o Oscar de animação.'],
  ['Hermione Granger é da Sonserina.', false, 'Hermione é da Grifinória, como Harry e Rony.'],
  ['Em O Senhor dos Anéis, Gandalf volta depois de cair com o Balrog.', true, 'Ele volta como Gandalf, o Branco.'],
  ['Ash Ketchum é da Cidade de Pallet.', true, 'É a cidade natal dele em Kanto.'],
  ['Thriller, de Michael Jackson, foi lançado em 1992.', false, 'Foi lançado em 1982.'],
  ['Os Beatles eram de Liverpool.', true, 'A banda se formou em Liverpool, na Inglaterra.'],
  ['Bohemian Rhapsody é uma música do Led Zeppelin.', false, 'É do Queen, composta por Freddie Mercury.'],
  ['Garota de Ipanema é de Tom Jobim e Vinicius de Moraes.', true, 'Composta em 1962.'],
  ['Anitta nasceu em São Paulo.', false, 'Ela nasceu no Rio de Janeiro.'],
  ['Cidade de Deus foi indicado a 4 Oscars.', true, 'Direção, roteiro adaptado, fotografia e montagem.'],
  ['Central do Brasil ganhou o Oscar de filme estrangeiro.', false, 'Foi indicado, mas perdeu para A Vida é Bela.'],
  ['Ainda Estou Aqui ganhou o Oscar de Melhor Filme Internacional.', true, 'Foi o primeiro Oscar do Brasil nessa categoria, em 2025.'],
  ['Chaves é uma série mexicana.', true, 'Criada por Roberto Gómez Bolaños, o Chespirito.'],
  ['Em Chaves, Seu Madruga é o pai do Chaves.', false, 'Seu Madruga é pai da Chiquinha.'],
  ['La Casa de Papel é uma série mexicana.', false, 'É espanhola.'],
  ['Wandinha faz parte da Família Addams.', true, 'É a filha de Mortícia e Gomez.'],
  ['Em Rick and Morty, Rick é avô do Morty.', true, 'Rick é pai da Beth, mãe do Morty.'],
  ['Homer Simpson trabalha numa fábrica de chocolate.', false, 'Ele trabalha na usina nuclear de Springfield.'],
  ['No universo Marvel dos filmes, Loki é filho adotivo de Odin.', true, 'Ele é filho biológico de Laufey, rei dos gigantes de gelo.'],
  ['A primeira aparição do Batman foi em 1939.', true, 'Em Detective Comics nº 27.'],
  ['Avatar (2009) foi dirigido por George Lucas.', false, 'O diretor é James Cameron.'],
  ['Avatar (2009) é a maior bilheteria da história do cinema.', true, 'Cerca de 2,9 bilhões de dólares.'],
  ['Jurassic Park foi dirigido por Steven Spielberg.', true, 'Lançado em 1993.'],
  ['E.T. – O Extraterrestre foi lançado em 1992.', false, 'Foi lançado em 1982.'],
  ['Em One Piece, Luffy quer ser o Rei dos Piratas.', true, 'É o sonho dele desde o primeiro episódio.'],
  ['Em Death Note, o caderno pertencia originalmente ao L.', false, 'O caderno era do shinigami Ryuk.'],
  ['Goku é filho de Vegeta.', false, 'O pai de Goku é Bardock.'],
  ['Pac-Man foi lançado em 1980.', true, 'Pela Namco, no Japão.'],
  ['Tetris foi criado no Japão.', false, 'Foi criado na União Soviética por Alexey Pajitnov, em 1984.'],
  ['Fortnite é da Epic Games.', true, 'Lançado em 2017.'],
  ['Among Us foi feito pela Riot Games.', false, 'Among Us é do estúdio Innersloth.'],
  ['League of Legends é da Riot Games.', true, 'Lançado em 2009.'],
  ['Free Fire é de uma empresa brasileira.', false, 'É da Garena, de Singapura.'],
  ['The Witcher 3 foi feito por um estúdio polonês.', true, 'A CD Projekt Red, da Polônia.'],
  ['Em Minecraft, os Creepers explodem.', true, 'Chegam quietinhos e explodem.'],
  ['Sonic é um ouriço.', true, 'Sonic the Hedgehog: hedgehog é ouriço.'],
  ['O Homem de Ferro se chama Bruce Wayne.', false, 'O Homem de Ferro é Tony Stark. Bruce Wayne é o Batman.'],
  ['Procurando Nemo é da Pixar.', true, 'Lançado em 2003.'],
  ['Em Toy Story, o dono dos brinquedos se chama Andy.', true, 'Andy Davis.'],
  ['Frozen foi lançado em 2010.', false, 'Frozen é de 2013.'],
  ['Em Os Incríveis, a Mulher-Elástica se chama Helena.', true, 'Helena Pêra, no Brasil.'],
  ['Pokémon Red e Blue foram lançados primeiro para Game Boy.', true, 'Em 1996, no Japão (como Red e Green).'],
  ['Game of Thrones é baseada em livros de J. R. R. Tolkien.', false, 'É baseada em As Crônicas de Gelo e Fogo, de George R. R. Martin.'],
  ['O Poderoso Chefão foi dirigido por Francis Ford Coppola.', true, 'Lançado em 1972.'],
  ['Matrix foi lançado em 1999.', true, 'Dirigido pelas irmãs Wachowski.'],
  ['Pelé atuou no filme Fuga para a Vitória.', true, 'Ao lado de Sylvester Stallone, em 1981.'],
  ['A série Round 6 é japonesa.', false, 'Round 6 é sul-coreana.'],
  ['Hogwarts fica na Escócia, segundo os filmes.', true, 'Muitas cenas foram gravadas nas Terras Altas escocesas.'],
];

class TrueFalse {
  async pick(catalog, diff, used) {
    // com token do TMDB, metade das afirmações é gerada de dados reais
    if (catalog && typeof catalog.get === 'function' && Math.random() < 0.5) {
      try { const t = await this.fromTmdb(catalog, diff, used); if (t) return t; } catch {}
    }
    const pool = VF.map((v, i) => ({ v, i })).filter(({ i }) => !used.has('vf' + i));
    const { v, i } = pool.length ? pick(pool) : { v: pick(VF), i: -1 };
    return mk('vf' + i, v[0], v[1], v[2], null);
  }
  async fromTmdb(catalog, diff, used) {
    const cat = pick(['filmes', 'series', 'filmes']);
    const c = pick(await catalog.discover(cat, diff));
    if (!c || used.has('vft' + c.type + c.id)) return null;
    const j = await catalog.get(`/${c.type}/${c.id}`, { language: 'pt-BR', append_to_response: 'credits' });
    const name = j.title || j.name, year = +(j.release_date || j.first_air_date || '').slice(0, 4);
    const img = j.backdrop_path ? IMG + 'w780' + j.backdrop_path : null;
    const truth = Math.random() < 0.5;
    const kinds = ['ano'];
    if (c.type === 'movie' && j.runtime) kinds.push('duracao');
    if (c.type === 'tv' && j.number_of_seasons) kinds.push('temporadas');
    const dir = (j.credits?.crew || []).find((x) => x.job === 'Director');
    if (c.type === 'movie' && dir) kinds.push('diretor');
    const k = pick(kinds);
    let text, exp;
    if (k === 'ano' && year) {
      const y = truth ? year : year + pick([-4, -3, -2, 2, 3, 5]);
      text = `${name} ${c.type === 'movie' ? 'foi lançado' : 'estreou'} em ${y}.`; exp = `${c.type === 'movie' ? 'Lançado' : 'Estreou'} em ${year}.`;
    } else if (k === 'duracao') {
      const over = j.runtime > 120;
      text = `${name} tem mais de 2 horas de duração.`; exp = `Dura ${Math.floor(j.runtime / 60)}h${String(j.runtime % 60).padStart(2, '0')}.`;
      return mk('vft' + c.type + c.id, text, over, exp, img);
    } else if (k === 'temporadas') {
      const n = j.number_of_seasons, s = truth ? n : Math.max(1, n + pick([-2, -1, 1, 2, 3]));
      if (s === n && !truth) return null;
      text = `${name} tem ${s} temporada${s > 1 ? 's' : ''}.`; exp = `Tem ${n} temporada${n > 1 ? 's' : ''} até agora.`;
    } else if (k === 'diretor') {
      if (truth) { text = `${name} foi dirigido por ${dir.name}.`; exp = `Direção de ${dir.name}.`; }
      else {
        const other = pick(['Steven Spielberg', 'Christopher Nolan', 'James Cameron', 'Quentin Tarantino', 'Martin Scorsese', 'Ridley Scott', 'Peter Jackson', 'Tim Burton'].filter((n) => n !== dir.name));
        text = `${name} foi dirigido por ${other}.`; exp = `Na verdade, a direção é de ${dir.name}.`;
      }
    } else return null;
    return mk('vft' + c.type + c.id, text, truth, exp, img);
  }
}
function mk(id, text, truth, exp, img) {
  return { id, isVF: true, title: truth ? 'Verdadeiro' : 'Falso', original: exp, year: '', kind: 'Verdadeiro ou falso', poster: null, titles: [truth ? 'verdadeiro' : 'falso'], statement: text, truth, image: img, frames: [] };
}

// =============== versões demo (testes sem internet) ===============
const DEMO_GAMES = [['Stardew Valley', 2016], ['Hollow Knight', 2017], ['Terraria', 2011], ['Celeste', 2018], ['Hades', 2020], ['Portal 2', 2011]];
const DEMO_CHARS = [['Tony Stark', 'Robert Downey Jr.', 'Homem de Ferro'], ['Walter White', 'Bryan Cranston', 'Breaking Bad'], ['Hermione Granger', 'Emma Watson', 'Harry Potter'],
  ['Eleven', 'Millie Bobby Brown', 'Stranger Things'], ['Jack Sparrow', 'Johnny Depp', 'Piratas do Caribe']];
class DemoGames {
  async pick(_d, used) {
    const pool = DEMO_GAMES.map((g, i) => ({ g, i })).filter(({ i }) => !used.has('gd' + i));
    const { g, i } = pick(pool.length ? pool : DEMO_GAMES.map((g2, i2) => ({ g: g2, i: i2 })));
    return { id: 'gd' + i, isGame: true, title: g[0], original: 'Estúdio Demo', year: String(g[1]), kind: 'Game', poster: `/demo/poster/${i}.svg`, titles: gameVariants(g[0]),
      frames: Array.from({ length: 8 }, (_, n) => ({ full: `/demo/frame/${20 + i}/${n}.svg`, thumb: `/demo/frame/${20 + i}/${n}.svg` })) };
  }
}
class DemoChars {
  async pick(_c, _s, _d, used) {
    const pool = DEMO_CHARS.map((c, i) => ({ c, i })).filter(({ i }) => !used.has('cd' + i));
    const { c, i } = pick(pool.length ? pool : DEMO_CHARS.map((c2, i2) => ({ c: c2, i: i2 })));
    return { id: 'cd' + i, isChar: true, title: c[0], original: `${c[1]} em ${c[2]}`, year: '', kind: 'Personagem', poster: `/demo/poster/${i}.svg`, titles: charNames(c[0]), actorTitles: [c[1]], work: c[2], workKind: i === 1 || i === 3 ? 'série' : 'filme', face: `/demo/frame/${30 + i}/0.svg`,
      frames: Array.from({ length: 6 }, (_, n) => ({ full: `/demo/frame/${30 + i}/${n}.svg`, thumb: `/demo/frame/${30 + i}/${n}.svg`, portrait: n < 3, scene: n >= 3 })) };
  }
}
class DemoTF extends TrueFalse { async pick(_c, d, used) { return super.pick(null, d, used); } }

module.exports = { fetchJson, Games, Characters, TrueFalse, DemoGames, DemoChars, DemoTF, charNames, gameVariants, VF, GAMES };
