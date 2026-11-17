import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const FILE = path.join(dir, 'data.json');

// Struktur tim: 1 ketua, 2 asisten ketua, 3 anggota
const USERS = [
  { id: 'u1', name: 'Budi Santoso', role: 'ketua' },
  { id: 'u2', name: 'Sari Wulandari', role: 'asisten' },
  { id: 'u3', name: 'Dedi Pratama', role: 'asisten' },
  { id: 'u4', name: 'Rina Maharani', role: 'anggota' },
  { id: 'u5', name: 'Andi Kurniawan', role: 'anggota' },
  { id: 'u6', name: 'Tono Hidayat', role: 'anggota' },
];
const COLS = [
  { id: 'todo', title: 'Antrian' },
  { id: 'doing', title: 'Dikerjakan' },
  { id: 'review', title: 'Review' },
  { id: 'done', title: 'Selesai' },
];

const ymd = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const T = (id, title, type, date, time, dur, assignee, status) =>
  ({ id, title, desc: '', type, date, time, dur, assignee, status, priority: 'sedang' });
let cards = fs.existsSync(FILE)
  ? JSON.parse(fs.readFileSync(FILE, 'utf8'))
  : [
      T('c1', 'Rapat mingguan tim', 'rapat', ymd(0), '09:00', 60, 'u1', 'doing'),
      T('c2', 'Susun laporan mingguan', 'laporan', ymd(1), '10:00', 120, 'u4', 'todo'),
      T('c3', 'Rapikan arsip dokumen', 'admin', ymd(2), '13:00', 90, 'u5', 'doing'),
      T('c4', 'Update data inventaris', 'admin', ymd(3), '10:00', 60, 'u6', 'done'),
      T('c5', 'Review laporan', 'laporan', ymd(4), '14:00', 60, 'u2', 'todo'),
      T('c6', 'Siapkan bahan presentasi', 'rapat', null, '09:00', 60, 'u3', 'todo'),
    ];
// migrasi data lama (kolom kanban -> status)
const toStatus = { todo: 'todo', doing: 'doing', review: 'doing', done: 'done' };
cards = cards.map((c) => ({ type: 'lain', date: null, time: '09:00', dur: 60, status: toStatus[c.col] || 'todo', ...c }));
const save = () => fs.writeFileSync(FILE, JSON.stringify(cards, null, 2));

// ---- Profil (nama + foto / ikon hewan) ----
const ANIMALS = ['🦁', '🦊', '🐼', '🐰', '🐯', '🐨', '🐶', '🐱', '🐵', '🐸', '🐧', '🦉'];
const PROF_FILE = path.join(dir, 'profiles.json');
const profiles = fs.existsSync(PROF_FILE) ? JSON.parse(fs.readFileSync(PROF_FILE, 'utf8')) : {};
USERS.forEach((u, i) => Object.assign(u, { avatar: { type: 'animal', value: ANIMALS[i] } }, profiles[u.id]));
const saveProf = () => fs.writeFileSync(PROF_FILE, JSON.stringify(profiles));

// ---- Password & sesi ----
const DEFAULT_PASSWORD = 'kantor123';
const PASS_FILE = path.join(dir, 'passwords.json');
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) =>
  `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
const checkPw = (pw, stored) => {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex');
  const b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const passwords = fs.existsSync(PASS_FILE) ? JSON.parse(fs.readFileSync(PASS_FILE, 'utf8')) : {};
USERS.forEach((u) => { passwords[u.id] ||= hashPw(DEFAULT_PASSWORD); });
const savePw = () => fs.writeFileSync(PASS_FILE, JSON.stringify(passwords, null, 2));
savePw();
const sessions = new Map(); // token -> userId
const fails = new Map(); // userId -> { n, until }
const tokenOf = (req) => (req.headers.authorization || '').replace('Bearer ', '');

const app = express();
app.use(express.json({ limit: '300kb' }));
app.get('/api/users', (_, res) => res.json(USERS));
app.post('/api/login', (req, res) => {
  const { userId, password } = req.body || {};
  const user = USERS.find((u) => u.id === userId);
  if (!user || typeof password !== 'string') return res.status(400).json({ error: 'Data tidak valid' });
  const f = fails.get(userId) || { n: 0, until: 0 };
  if (f.until > Date.now()) return res.status(429).json({ error: 'Terlalu banyak percobaan. Coba lagi 1 menit lagi.' });
  if (!checkPw(password, passwords[userId])) {
    f.n++;
    if (f.n >= 5) { f.n = 0; f.until = Date.now() + 60000; }
    fails.set(userId, f);
    return res.status(401).json({ error: 'Password salah' });
  }
  fails.delete(userId);
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, userId);
  res.json({ token, user });
});
app.post('/api/profile', (req, res) => {
  const user = USERS.find((u) => u.id === sessions.get(tokenOf(req)));
  if (!user) return res.status(401).json({ error: 'Belum login' });
  const { name, avatar } = req.body || {};
  const n = String(name || '').trim();
  if (n.length < 2 || n.length > 40) return res.status(400).json({ error: 'Nama harus 2–40 karakter' });
  const ok = avatar && (
    (avatar.type === 'animal' && ANIMALS.includes(avatar.value)) ||
    (avatar.type === 'photo' && typeof avatar.value === 'string' && avatar.value.length < 150000 &&
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(avatar.value)));
  if (!ok) return res.status(400).json({ error: 'Foto atau ikon tidak valid' });
  const a = { type: avatar.type, value: avatar.value };
  Object.assign(user, { name: n, avatar: a });
  profiles[user.id] = { name: n, avatar: a };
  saveProf();
  io.emit('users', USERS);
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { sessions.delete(tokenOf(req)); res.end(); });
app.post('/api/password', (req, res) => {
  const user = USERS.find((u) => u.id === sessions.get(tokenOf(req)));
  if (!user) return res.status(401).json({ error: 'Belum login' });
  const { oldPassword, newPassword } = req.body || {};
  if (typeof newPassword !== 'string' || newPassword.length < 6) return res.status(400).json({ error: 'Password baru minimal 6 karakter' });
  if (!checkPw(String(oldPassword || ''), passwords[user.id])) return res.status(401).json({ error: 'Password lama salah' });
  passwords[user.id] = hashPw(newPassword);
  savePw();
  res.json({ ok: true });
});
app.use(express.static(path.join(dir, '..', 'dist')));
const http = createServer(app);
const io = new Server(http);
const online = new Map();
const presence = () => [...new Set(online.values())];
const isLead = (u) => u.role !== 'anggota';

io.use((socket, next) => {
  const user = USERS.find((u) => u.id === sessions.get(socket.handshake.auth?.token));
  if (!user) return next(new Error('unauthorized'));
  socket.data.user = user;
  next();
});

io.on('connection', (socket) => {
  const user = socket.data.user;
  online.set(socket.id, user.id);
  socket.emit('init', { cards });
  socket.emit('users', USERS);
  io.emit('presence', presence());

  const find = (id) => cards.find((c) => c.id === id);
  const sync = (text) => {
    save();
    io.emit('cards', cards);
    io.emit('activity', { text: `${user.name} ${text}`, at: Date.now() });
  };
  const clean = (d) => ({
    title: String(d.title || '').trim().slice(0, 120),
    desc: String(d.desc || '').slice(0, 500),
    assignee: USERS.some((u) => u.id === d.assignee) ? d.assignee : null,
    priority: ['rendah', 'sedang', 'tinggi'].includes(d.priority) ? d.priority : 'sedang',
    type: ['rapat', 'laporan', 'admin', 'lain'].includes(d.type) ? d.type : 'lain',
    status: ['todo', 'doing', 'done'].includes(d.status) ? d.status : 'todo',
    date: /^\d{4}-\d{2}-\d{2}$/.test(d.date) ? d.date : null,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(d.time) ? d.time : '09:00',
    dur: Math.min(480, Math.max(30, Number(d.dur) || 60)),
  });

  socket.on('card:add', (d) => {
    if (!isLead(user) || !String(d.title || '').trim()) return;
    const c = { id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), ...clean(d) };
    cards.push(c);
    sync(`menambah tugas "${c.title}"`);
  });
  socket.on('card:update', (d) => {
    const c = find(d.id);
    if (!c || !isLead(user) || !String(d.title || '').trim()) return;
    Object.assign(c, clean(d));
    sync(`mengubah tugas "${c.title}"`);
  });
  socket.on('card:delete', (id) => {
    const c = find(id);
    if (!c || user.role !== 'ketua') return;
    cards = cards.filter((x) => x !== c);
    sync(`menghapus tugas "${c.title}"`);
  });
  socket.on('card:patch', ({ id, patch = {} }) => {
    const c = find(id);
    if (!c || !(isLead(user) || c.assignee === user.id)) return;
    const n = clean({ ...c, ...patch });
    Object.assign(c, { status: n.status, date: n.date, time: n.time });
    sync(patch.status ? `mengubah status "${c.title}"` : `menjadwalkan "${c.title}"`);
  });
  socket.on('disconnect', () => {
    online.delete(socket.id);
    io.emit('presence', presence());
  });
});

http.listen(process.env.PORT || 3001, '0.0.0.0', () => console.log('Server jalan di port', process.env.PORT || 3001));
