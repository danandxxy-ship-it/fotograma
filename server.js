const path = require('path');
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');
const { TMDB, Demo, demoSvg } = require('./catalog');
const { getRoom, createRoom, setGlobalCatalog, setGlobalMusic, setGlobalExtras, stats } = require('./game');
const { DemoMusic, demoWavPath } = require('./music');

const PORT = process.env.PORT || 3000;
const KEY = process.env.TMDB_TOKEN || process.env.TMDB_API_KEY || '';
const MOCK = process.env.MOCK === '1';

if (MOCK) {
  setGlobalCatalog(new Demo()); setGlobalMusic(new DemoMusic());
  const { DemoGames, DemoChars, DemoTF } = require('./extras');
  setGlobalExtras({ games: new DemoGames(), chars: new DemoChars(), tf: new DemoTF() });
}
else if (KEY) setGlobalCatalog(new TMDB(KEY));

const app = express();
const PUBLIC = new Set(['index.html', 'style.css', 'app.js', 'sfx.js', 'anybody.woff2', 'permanent-marker.woff2']);
app.get('/', (_q, r) => { r.set('Cache-Control', 'no-cache'); r.sendFile(path.join(__dirname, 'index.html')); });
app.get('/:file', (req, res, next) => PUBLIC.has(req.params.file) ? res.sendFile(path.join(__dirname, req.params.file), { maxAge: '1h' }) : next());
if (MOCK) {
  app.get('/demo/frame/:i/:n.svg', (req, res) => res.type('svg').send(demoSvg(+req.params.i, +req.params.n)));
  app.get('/demo/audio/:i.wav', (req, res) => res.sendFile(demoWavPath(+req.params.i || 0)));
  app.get('/demo/poster/:i.svg', (req, res) => res.type('svg').send(demoSvg(+req.params.i, 99, 342, 513)));
}
app.get('/health', (_q, r) => r.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const cleanName = (n) => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Anônimo';
const cleanId = (t) => (/^[a-zA-Z0-9-]{8,64}$/.test(t || '') ? t : crypto.randomUUID());

io.on('connection', (socket) => {
  let room = null, pid = null;
  const fail = (msg) => socket.emit('fail', msg);

  socket.on('create', ({ name, token } = {}) => {
    pid = cleanId(token); room = createRoom(io);
    socket.emit('joined', { code: room.code, token: pid });
    room.addPlayer(pid, cleanName(name), socket);
  });
  socket.on('join', ({ name, code, token } = {}) => {
    const r = getRoom(code);
    if (!r) return fail('Sala não encontrada. Confira o código.');
    if (r.players.size >= 16 && !r.players.has(token)) return fail('Sala cheia (16 jogadores).');
    pid = cleanId(token); room = r;
    socket.emit('joined', { code: room.code, token: pid });
    room.addPlayer(pid, cleanName(name), socket);
  });

  const host = (fn) => (...a) => { if (room && room.hostId === pid) fn(...a); };
  socket.on('settings', host((s) => room.updateSettings(s || {})));
  socket.on('key', host(async (k) => {
    try { await room.setKey(k); socket.emit('keyOk'); } catch (e) { fail(e.message.includes('inválida') ? e.message : 'Não consegui falar com o TMDB: ' + e.message); }
  }));
  socket.on('start', host(() => { if (room.phase === 'lobby' || room.phase === 'end') room.start(); }));
  socket.on('lobby', host(() => room.backToLobby()));
  socket.on('pick', (i) => room && room.pick(pid, i));
  socket.on('guess', (msg) => {
    if (!room) return;
    const r = typeof msg === 'object' && msg ? room.guess(pid, msg.text, msg.alts) : room.guess(pid, msg);
    if (r) socket.emit('verdict', { result: r.result, exact: !!r.exact, pts: r.pts || 0, artistOnly: !!r.artistOnly, place: r.place || 0, placeBonus: r.placeBonus || 0, exactBonus: r.exactBonus || 0, left: r.left || 0, heat: r.heat || null, double: !!r.double, toll: r.toll || 0, card: !!r.card });
  });
  socket.on('skip', () => room && room.skip(pid));
  socket.on('vf', (v) => { if (!room) return; const r = room.answerVF(pid, v === true); if (r) socket.emit('verdict', { result: r.result, left: r.left || 0 }); });
  // reações: emojis subindo na tela de todo mundo
  const REACT = ['😂', '🔥', '😱', '👏', '🤯', '💀', '😡', '❤️'];
  let lastReact = 0;
  socket.on('react', (e) => {
    if (!room || !REACT.includes(e) || Date.now() - lastReact < 450) return;
    lastReact = Date.now();
    room.react(pid, e);
  });
  socket.on('power', (m = {}) => { if (room) { const res = room.usePower(pid, m.card, m.target); if (res !== 'ok') socket.emit('powerfail', res); } });
  socket.on('addbot', host(() => { if (room.phase === 'lobby' || room.phase === 'end') room.bots.add(); }));
  socket.on('kickbot', host((id) => room.bots.remove(id)));
  socket.emit('stats', stats());
  socket.on('leave', () => { if (room) room.removePlayer(pid, socket.id); room = null; });
  socket.on('disconnect', () => room && room.dropSocket(pid, socket.id));
});

let lastStats = '';
setInterval(() => {
  const st = stats(); const k = JSON.stringify(st);
  if (k !== lastStats) { lastStats = k; io.emit('stats', st); }
}, 3000).unref();
app.get('/stats', (_q, r) => r.json(stats()));

server.listen(PORT, '0.0.0.0', () => {
  const ips = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\nFotograma rodando${MOCK ? ' (modo demo)' : ''}`);
  console.log(`  Neste aparelho:  http://localhost:${PORT}`);
  ips.forEach((ip) => console.log(`  Na mesma Wi-Fi:  http://${ip}:${PORT}`));
  if (!MOCK && !KEY) console.log('  Sem TMDB_TOKEN: o anfitrião vai colar a chave do TMDB no lobby.');
});
