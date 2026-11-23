// Modo música: prévias de 30 s da API pública do iTunes (Apple), sem chave.
// Cada rodada toca trechos de 4 s da prévia. O jogador chuta a música, a banda ou o cantor.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { norm } = require('./matcher');

// Mais famosos primeiro: "Só sucesso" usa o começo de cada lista, "Cinéfilo" (difícil) usa tudo.
const ARTISTS = {
  br: [
    'Anitta', 'Marília Mendonça', 'Gusttavo Lima', 'Jorge & Mateus', 'Henrique & Juliano', 'Luan Santana', 'Zé Neto & Cristiano',
    'Maiara & Maraisa', 'Ana Castela', 'Wesley Safadão', 'Ivete Sangalo', 'Legião Urbana', 'Charlie Brown Jr.', 'Roberto Carlos',
    'Caetano Veloso', 'Tim Maia', 'Skank', 'Titãs', 'Capital Inicial', 'Pitty', 'Ludmilla', 'Pabllo Vittar', 'Alok', 'Matuê',
    'Emicida', 'Racionais MC\'s', 'Seu Jorge', 'Jorge Ben Jor', 'Gilberto Gil', 'Djavan', 'Cazuza', 'Raul Seixas', 'Rita Lee',
    'Os Paralamas do Sucesso', 'Barão Vermelho', 'Engenheiros do Hawaii', 'Jota Quest', 'O Rappa', 'Los Hermanos', 'Lulu Santos',
    'Marisa Monte', 'Tribalistas', 'Vanessa da Mata', 'Zeca Pagodinho', 'Exaltasamba', 'Raça Negra', 'Péricles', 'Thiaguinho',
    'Leandro & Leonardo', 'Zezé Di Camargo & Luciano', 'Bruno & Marrone', 'Chitãozinho & Xororó', 'Michel Teló', 'Simone Mendes',
    'Matheus & Kauan', 'Israel & Rodolffo', 'Lauana Prado', 'Natiruts', 'Cidade Negra', 'Gabriel o Pensador', 'Projota', 'Djonga',
    'Criolo', 'MC Hariel', 'MC Livinho', 'Mamonas Assassinas', 'NX Zero', 'Detonautas', 'Nando Reis', 'Marcelo D2',
  ],
  rock: [
    'Queen', 'The Beatles', 'Nirvana', 'Guns N\' Roses', 'AC/DC', 'Led Zeppelin', 'Pink Floyd', 'Red Hot Chili Peppers', 'Foo Fighters',
    'Linkin Park', 'Green Day', 'Coldplay', 'Oasis', 'U2', 'Bon Jovi', 'Metallica', 'The Rolling Stones', 'Aerosmith', 'Imagine Dragons',
    'Arctic Monkeys', 'Paramore', 'Blink-182', 'My Chemical Romance', 'Fall Out Boy', 'System of a Down', 'Iron Maiden', 'Scorpions',
    'The Killers', 'Twenty One Pilots', 'Muse', 'Radiohead', 'The Strokes', 'Kiss', 'Black Sabbath', 'Deep Purple', 'Pearl Jam',
    'Evanescence', 'Slipknot', 'Rammstein', 'Panic! At The Disco', 'The Police', 'Dire Straits', 'Eagles', 'Fleetwood Mac', 'Journey',
    'Europe', 'Ramones', 'The Doors', 'Creedence Clearwater Revival', 'Survivor', 'Toto', 'Lynyrd Skynyrd', 'Kings of Leon', 'Maroon 5',
  ],
  pop: [
    'Michael Jackson', 'Taylor Swift', 'Beyoncé', 'Rihanna', 'Lady Gaga', 'Ed Sheeran', 'Bruno Mars', 'Adele', 'Justin Bieber',
    'Ariana Grande', 'The Weeknd', 'Dua Lipa', 'Billie Eilish', 'Katy Perry', 'Shakira', 'Britney Spears', 'Harry Styles', 'Olivia Rodrigo',
    'Madonna', 'Sia', 'Shawn Mendes', 'Selena Gomez', 'Miley Cyrus', 'Demi Lovato', 'Camila Cabello', 'Charlie Puth', 'Sabrina Carpenter',
    'Doja Cat', 'Sam Smith', 'Elton John', 'ABBA', 'Bee Gees', 'Whitney Houston', 'Mariah Carey', 'Backstreet Boys', 'NSYNC', 'Spice Girls',
    'Jonas Brothers', 'One Direction', 'BTS', 'BLACKPINK', 'Bad Bunny', 'Luis Fonsi', 'Enrique Iglesias', 'Daddy Yankee', 'J Balvin',
    'Rosalía', 'Maluma', 'Karol G', 'Lana Del Rey', 'Lizzo', 'Pink', 'Christina Aguilera', 'Jennifer Lopez', 'Justin Timberlake',
  ],
  rap: [
    'Eminem', 'Drake', 'Kendrick Lamar', 'Jay-Z', 'Kanye West', '50 Cent', 'Snoop Dogg', 'Travis Scott', 'Post Malone', 'Cardi B',
    'Nicki Minaj', '2Pac', 'The Notorious B.I.G.', 'Dr. Dre', 'Lil Wayne', 'J. Cole', 'Lil Nas X', 'OutKast', 'Coolio', 'Wiz Khalifa',
    'Flo Rida', 'Pitbull', 'Ice Cube', 'Nelly', 'Ludacris', 'Megan Thee Stallion', 'Future', '21 Savage', 'Tyler, The Creator', 'Run-DMC',
  ],
  eletro: [
    'Calvin Harris', 'David Guetta', 'Avicii', 'Martin Garrix', 'Marshmello', 'The Chainsmokers', 'Skrillex', 'Daft Punk', 'Zedd',
    'Alan Walker', 'Kygo', 'Swedish House Mafia', 'Tiësto', 'Vintage Culture', 'Alok', 'Major Lazer', 'Disclosure', 'Deadmau5',
    'Armin van Buuren', 'Robin Schulz', 'Cascada', 'Eiffel 65', 'Darude', 'Faithless',
  ],
  retro: [
    'A-ha', 'Roxette', 'Duran Duran', 'Depeche Mode', 'Cyndi Lauper', 'Phil Collins', 'Wham!', 'Tina Turner', 'Prince', 'Cher',
    'Dr. Alban', 'Haddaway', 'Aqua', 'Ace of Base', 'Los del Río', 'Lou Bega', 'Vengaboys', 'Bon Jovi', 'Spice Girls', 'Backstreet Boys',
    'Culture Club', 'Bee Gees', 'Earth, Wind & Fire', 'Donna Summer', 'Kool & The Gang', 'Gloria Gaynor', 'Rick Astley', 'Bonnie Tyler',
    'Whitney Houston', 'Mariah Carey', 'Mamonas Assassinas', 'Rouge', 'Sandy & Junior', 'É o Tchan!', 'Banda Calypso', 'Terra Samba',
  ],
};
const STYLES = Object.keys(ARTISTS).concat('mix');

const SEGMENTS = 8, SEG_LEN = 4, SEG_STEP = 3.5; // 0, 3.5, ... 24.5 (+4 s) dentro dos 30 s da prévia

const BAD = /karaoke|tribute|instrumental|playback|originally performed|made famous|cover|8-?bit|lullaby|piano version|nightcore|sped up|slowed|reverb/i;
const VERSION = 'remaster|version|vers[aã]o|edit\\b|mix\\b|live|ao vivo|mono\\b|stereo|deluxe|bonus|acoustic|ac[uú]stic|from |single|radio|feat|ft\\.';

function cleanTitle(name) {
  let t = String(name || '');
  t = t.replace(/\s*[\(\[]\s*(feat\.?|ft\.?|with|part\.?|participa[cç][aã]o)\b[^\)\]]*[\)\]]/gi, '');
  t = t.replace(new RegExp('\\s*[\\(\\[][^\\)\\]]*(' + VERSION + ')[^\\)\\]]*[\\)\\]]', 'gi'), '');
  t = t.replace(new RegExp('\\s+-\\s+(?=[^-]*(' + VERSION + '))[^-]*$', 'i'), '');
  return t.replace(/\s{2,}/g, ' ').trim();
}

// "Anitta, Cardi B" / "Artista feat. Outro" / "A & B": cada parte também vale como resposta
function artistParts(name) {
  return String(name || '').split(/\s*(?:,|\bfeat\.?\b|\bft\.?\b|\bcom\b|\bx\b)\s*/i).map((s) => s.trim()).filter((s) => s.length > 1);
}

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];

function frames() {
  return Array.from({ length: SEGMENTS }, (_, i) => ({ full: null, thumb: null, start: +(i * SEG_STEP).toFixed(2), len: SEG_LEN }));
}

class Music {
  constructor() { this.cache = new Map(); this.queue = Promise.resolve(); this.lastCall = 0; }

  // a API do iTunes aceita cerca de 20 chamadas por minuto por IP: fila + espaço entre chamadas
  fetchJson(url) {
    const run = async () => {
      const wait = Math.max(0, this.lastCall + 900 - Date.now());
      if (wait) await new Promise((r) => setTimeout(r, wait));
      this.lastCall = Date.now();
      const r = await fetch(url, { signal: AbortSignal.timeout(9000), headers: { accept: 'application/json' } });
      if (r.status === 403 || r.status === 429) throw new Error('A API de músicas pediu uma pausa. Tente de novo em instantes.');
      if (!r.ok) throw new Error('API de músicas respondeu ' + r.status);
      return r.json();
    };
    const p = this.queue.then(run, run);
    this.queue = p.catch(() => {});
    return p;
  }

  async tracksOf(artist) {
    const key = norm(artist);
    if (this.cache.has(key)) return this.cache.get(key);
    let raw;
    try {
      const j = await this.fetchJson('https://itunes.apple.com/search?media=music&entity=song&country=BR&limit=40&term=' + encodeURIComponent(artist));
      raw = j.results || [];
      if (!raw.length) throw new Error('vazio');
    } catch (e) { // reserva: Deezer (também tem prévia de 30 s, sem chave)
      const j = await this.fetchJson('https://api.deezer.com/search?limit=40&q=' + encodeURIComponent(`artist:"${artist}"`));
      if (j.error) throw new Error('API de músicas indisponível agora. Tente de novo em instantes.');
      raw = (j.data || []).map((d) => ({
        trackId: 'dz' + d.id, trackName: d.title, artistName: d.artist && d.artist.name, collectionName: d.album && d.album.title,
        previewUrl: d.preview, artworkUrl100: d.album && (d.album.cover_xl || d.album.cover_big), releaseDate: null,
      }));
    }
    const seen = new Set();
    const list = raw.filter((x) => {
      if (!x.previewUrl || !x.trackName || !x.artistName) return false;
      const a = norm(x.artistName);
      if (!(a === key || a.includes(key) || key.includes(a))) return false;
      if (BAD.test(x.trackName) || BAD.test(x.collectionName || '')) return false;
      const tk = norm(cleanTitle(x.trackName));
      if (!tk || seen.has(tk)) return false;
      seen.add(tk);
      return true;
    });
    this.cache.set(key, list);
    return list;
  }

  async pick(style, diff, used) {
    const lists = style && style !== 'mix' && ARTISTS[style] ? [ARTISTS[style]] : Object.values(ARTISTS);
    let lastErr = null;
    for (let attempt = 0; attempt < 8; attempt++) {
      const list = pickOne(lists);
      const cut = diff === 'facil' ? 0.45 : diff === 'medio' ? 0.8 : 1;
      const artist = pickOne(list.slice(0, Math.max(6, Math.ceil(list.length * cut))));
      if (used.has('a:' + norm(artist))) continue;
      let tracks;
      try { tracks = await this.tracksOf(artist); } catch (e) { lastErr = e; continue; }
      if (!tracks.length) continue;
      const range = diff === 'facil' ? [0, 3] : diff === 'medio' ? [0, 11] : [Math.min(5, tracks.length - 1), tracks.length - 1];
      const slice = tracks.slice(range[0], range[1] + 1).filter((t) => !used.has('m' + t.trackId));
      if (!slice.length) continue;
      return this.build(pickOne(slice), artist);
    }
    throw lastErr || new Error('Não achei músicas agora. Tente de novo.');
  }

  build(t, curated) {
    const title = cleanTitle(t.trackName);
    return {
      id: 'm' + t.trackId,
      isMusic: true,
      title,
      original: title,
      artist: t.artistName,
      year: (t.releaseDate || '').slice(0, 4),
      kind: 'Música',
      poster: (t.artworkUrl100 || '').replace('100x100bb', '600x600bb') || null,
      titles: [title],
      artistTitles: [t.artistName, curated, ...artistParts(t.artistName)],
      artistKey: 'a:' + norm(curated),
      audio: String(t.previewUrl).replace(/^http:/, 'https:'),
      frames: frames(),
    };
  }
}

// ---------- Modo demonstração (sem internet): melodias geradas na hora ----------
const DEMO = [
  ['Bohemian Rhapsody', 'Queen'], ['Billie Jean', 'Michael Jackson'], ['Evidências', 'Chitãozinho & Xororó'], ['Smells Like Teen Spirit', 'Nirvana'],
  ['Shape of You', 'Ed Sheeran'], ['Pais e Filhos', 'Legião Urbana'], ['Blinding Lights', 'The Weeknd'], ['Garota de Ipanema', 'Tom Jobim'],
  ['Lose Yourself', 'Eminem'], ['Poker Face', 'Lady Gaga'],
];
class DemoMusic {
  async pick(_style, _diff, used) {
    const free = DEMO.map((d, i) => ({ d, i })).filter(({ i }) => !used.has('mdemo' + i));
    const { d, i } = pickOne(free.length ? free : DEMO.map((x, k) => ({ d: x, i: k })));
    return {
      id: 'mdemo' + i, isMusic: true, title: d[0], original: d[0], artist: d[1], year: String(1980 + i * 4), kind: 'Música',
      poster: `/demo/poster/${i}.svg`, titles: [d[0]], artistTitles: [d[1]], artistKey: 'a:' + norm(d[1]),
      audio: `/demo/audio/${i}.wav`, frames: frames(),
    };
  }
}
function demoWavPath(seed) {
  const file = path.join(os.tmpdir(), `fg-demo-${seed}.wav`);
  if (fs.existsSync(file)) return file;
  const rate = 8000, secs = 30, n = rate * secs, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  const scale = [0, 2, 4, 7, 9, 12, 9, 7, 4, 2];
  for (let i = 0; i < n; i++) {
    const t = i / rate, step = Math.floor(t / 0.25), within = (t % 0.25) / 0.25;
    const f = 220 * Math.pow(2, (scale[(step + seed) % scale.length] + (seed % 5)) / 12);
    const v = Math.sin(2 * Math.PI * f * t) * Math.min(1, within * 12) * (1 - within * 0.6) * 0.5;
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return file;
}

module.exports = { Music, DemoMusic, demoWavPath, cleanTitle, artistParts, STYLES, ARTISTS };
