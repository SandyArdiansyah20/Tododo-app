import { useEffect, useRef, useState } from 'react';
import { supabase, ready } from './supabase.js';
import { norm, planMerge } from './conflict.js';

const ROLE = { ketua: 'Ketua Tim', asisten: 'Asisten Ketua Tim', anggota: 'Anggota' };
const PRI = { tinggi: 'Tinggi', sedang: 'Sedang', rendah: 'Rendah' };
const initials = (n) => n.split(' ').map((w) => w[0]).slice(0, 2).join('');
const ANIMALS = ['🦁', '🦊', '🐼', '🐰', '🐯', '🐨', '🐶', '🐱', '🐵', '🐸', '🐧', '🦉'];
const face = (u) => u?.avatar?.type === 'photo' ? <img src={u.avatar.value} alt="" />
  : u?.avatar?.type === 'animal' ? <span className="emo">{u.avatar.value}</span> : initials(u?.name || '-');

const toUser = (p) => ({ id: p.id, email: p.email, name: p.name, role: p.role, avatar: { type: p.avatar_type, value: p.avatar_value } });
const toTask = (r) => ({ id: r.id, title: r.title, desc: r.description, assignee: r.assignee, type: r.type, status: r.status, date: r.date, time: (r.time || '09:00').slice(0, 5), dur: r.dur, version: r.version, updatedBy: r.updated_by });
const LABEL = { title: 'Judul', desc: 'Deskripsi', assignee: 'Ditugaskan ke', type: 'Jenis', status: 'Status', date: 'Tanggal', time: 'Mulai', dur: 'Durasi' };

export default function App() {
  const [users, setUsers] = useState(null);
  const [session, setSession] = useState(undefined);
  const [pick, setPick] = useState(null);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [loadErr, setLoadErr] = useState('');
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme || 'light');
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('theme', theme); }, [theme]);
  const toggle = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  useEffect(() => {
    if (!ready) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    supabase.from('profiles').select('*').order('sort').then(({ data, error }) => {
      if (error) setLoadErr(error.message); else setUsers(data.map(toUser));
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const logout = () => supabase.auth.signOut();
  const login = async (e) => {
    e.preventDefault();
    setErr('');
    const { error } = await supabase.auth.signInWithPassword({ email: pick.email, password: pw });
    if (error) return setErr(error.message === 'Invalid login credentials' ? 'Password salah' : error.message);
    setPw(''); setPick(null);
  };

  const info = (msg, hint) => (
    <main className="login"><h1>Papan Kerja Tim</h1><p className="err">{msg}</p>{hint && <p>{hint}</p>}</main>
  );
  if (!ready) return info('Konfigurasi Supabase belum diisi.', 'Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY (lihat README), lalu jalankan ulang atau deploy ulang.');
  if (loadErr) return info('Tidak bisa terhubung ke database: ' + loadErr, 'Periksa URL dan key Supabase, serta pastikan supabase/schema.sql sudah dijalankan.');
  if (users === null || session === undefined) return <main className="login"><p>Memuat…</p></main>;
  if (users.length === 0) return info('Belum ada pengguna.', 'Jalankan "npm run seed" sekali untuk membuat akun tim (lihat README).');

  if (!session) {
    return (
      <main className="login">
        <button className="ghost themebtn" onClick={toggle}>{theme === 'dark' ? 'Mode terang' : 'Mode gelap'}</button>
        <h1>Todolist</h1>
        {pick ? (
          <form onSubmit={login} className="loginform">
            <p>Masuk sebagai <b>{pick.name}</b></p>
            <label>Password<input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus /></label>
            {err && <p className="err">{err}</p>}
            <div className="actions">
              <button type="button" className="ghost" onClick={() => { setPick(null); setPw(''); setErr(''); }}>Ganti nama</button>
              <div className="grow" />
              <button className="primary">Masuk</button>
            </div>
          </form>
        ) : (
          <>
            <p>Pilih nama kamu untuk masuk.</p>
            {Object.keys(ROLE).map((r) => (
              <section key={r}>
                <h2>{ROLE[r]}</h2>
                <div className="people">
                  {users.filter((u) => u.role === r).map((u) => (
                    <button key={u.id} onClick={() => setPick(u)}>
                      <span className="av">{face(u)}</span>{u.name}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </>
        )}
      </main>
    );
  }
  const me = users.find((u) => u.id === session.user.id);
  if (!me) return <main className="login"><p className="err">Akun ini belum punya profil tim.</p><button className="ghost" onClick={logout}>Keluar</button></main>;
  return <Board me={me} users={users} onUsers={setUsers} theme={theme} onTheme={toggle} onLogout={logout} />;
}

const DEF_START = 7, DEF_END = 19, ROW = 52;   // rentang jam standar; otomatis melebar bila ada tugas di luarnya
const TYPES = { rapat: 'Rapat', laporan: 'Laporan', admin: 'Administrasi', lain: 'Lainnya' };
const Ico = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);

const ICON = {
  rapat: <Ico><circle cx="9" cy="8" r="3.2" /><path d="M3 19c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M16.5 13.7c2.6.2 4.5 2 4.5 4.8" /></Ico>,
  laporan: <Ico><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 17v-4M12 17V8M16 17v-6" /></Ico>,
  admin: <Ico><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></Ico>,
  lain: <Ico><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></Ico>,
};
const STATUS_ICON = {
  todo: <Ico><circle cx="12" cy="12" r="9" strokeDasharray="3 3" /></Ico>,
  doing: <Ico><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></Ico>,
  done: <Ico><circle cx="12" cy="12" r="9" /><path d="M8 12.5l2.7 2.7L16 9.5" /></Ico>,
};
const ORDER = { doing: 0, todo: 1, done: 2 };
const MAX_CARDS = 8;   // jumlah kartu yang tampil sebelum "Lihat semua"
const STATUS = { todo: 'Belum dikerjakan', doing: 'Sedang dikerjakan', done: 'Selesai' };
const DAYS = ['sen', 'sel', 'rab', 'kam', 'jum', 'sab', 'min'];
const BLANK = { title: '', desc: '', assignee: '', type: 'rapat', status: 'todo', date: '', time: '09:00', dur: 60 };
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = (d) => addDays(d, -((d.getDay() + 6) % 7));
const mins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const weekNo = (d) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
};
// Rentang jam kalender: minimal 07.00–19.00, melebar otomatis agar semua tugas berjadwal terlihat
function hourRange(tasks, full) {
  if (full) return { st: 0, en: 24 };     // mode 24 jam penuh
  let st = DEF_START, en = DEF_END;
  for (const t of tasks) {
    if (!t.date) continue;
    const m = mins(t.time);
    st = Math.min(st, Math.floor(m / 60));
    en = Math.max(en, Math.min(24, Math.ceil((m + t.dur) / 60)));
  }
  return { st, en };
}
const slotAt = (e, st, en) => {
  const r = e.currentTarget.getBoundingClientRect();
  const m = Math.round((((e.clientY - r.top) / ROW) * 60) / 30) * 30;
  const t = Math.min(Math.max(st * 60 + m, st * 60), (en - 1) * 60);
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`;
};

function Board({ me, users, onUsers, theme, onTheme, onLogout }) {
  const [tasks, setTasks] = useState([]);
  const [online, setOnline] = useState([]);
  const [log, setLog] = useState([]);
  const [edit, setEdit] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [live, setLive] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [profOpen, setProfOpen] = useState(false);
  const [view, setView] = useState('minggu');
  const [full, setFull] = useState(() => localStorage.getItem('jam24') === '1');
  const calRef = useRef(null);
  const [cur, setCur] = useState(() => new Date());
  const [fUser, setFUser] = useState(null);
  const [fType, setFType] = useState(null);
  const [open, setOpen] = useState({ week: true, month: false, none: true });
  const [copied, setCopied] = useState(false);
  const drag = useRef(null);
  const lead = me.role !== 'anggota';
  const can = (t) => lead || t.assignee === me.id;
  const who = (id) => users.find((u) => u.id === id);
  const loadTasks = async () => {
    const { data } = await supabase.from('tasks').select('*').order('created_at');
    if (data) setTasks(data.map(toTask));
  };
  const loadUsers = async () => {
    const { data } = await supabase.from('profiles').select('*').order('sort');
    if (data) onUsers(data.map(toUser));
  };
  const run = async (p) => {
    const { error } = await p;
    if (error) alert('Gagal menyimpan: ' + error.message);
    loadTasks();
  };
  const rows = (d) => ({ title: d.title.trim(), description: d.desc || '', assignee: d.assignee || null, type: d.type, status: d.status, date: d.date || null, time: d.time, dur: Number(d.dur) });
  const actions = {
    'card:add': (d) => run(supabase.from('tasks').insert({ ...rows(d), created_by: me.id })),
    'card:update': (d) => run(supabase.from('tasks').update(rows(d)).eq('id', d.id)),
    'card:delete': (id) => run(supabase.from('tasks').delete().eq('id', id)),
    'card:patch': ({ id, patch }) => {
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
      run(supabase.from('tasks').update(patch).eq('id', id));
    },
  };
  const emit = (ev, d) => actions[ev](d);

  // ---- Simpan hanya kolom yang diubah + deteksi konflik (versi tugas) ----
  const rowOf = (vals) => Object.fromEntries(Object.entries(vals).map(([k, v]) => [k === 'desc' ? 'description' : k, v]));
  const showVal = (k, v) => (k === 'assignee' ? (who(v)?.name || 'Belum ada') : k === 'status' ? STATUS[v] : k === 'type' ? TYPES[v] : k === 'dur' ? v + ' menit' : (v || '—'));
  const saveEdit = async (f) => {
    const id = edit.id, base = norm(edit), mine = norm(f);
    const { changed } = planMerge(base, mine, base);
    if (!changed.length) { setEdit(null); return; }
    const vals = Object.fromEntries(changed.map((k) => [k, mine[k]]));
    let version = edit.version;
    for (let i = 0; i < 3; i++) {
      let q = supabase.from('tasks').update(rowOf(vals)).eq('id', id);
      if (version != null) q = q.eq('version', version);
      const { data, error } = await q.select('id');
      if (error) { alert('Gagal menyimpan: ' + error.message); return; }
      if (data.length) { setEdit(null); loadTasks(); return; }
      // tidak ada baris berubah: ada yang menyimpan lebih dulu (atau tugas sudah dihapus)
      const { data: row } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle();
      if (!row) { alert('Tugas ini sudah dihapus oleh orang lain.'); setEdit(null); loadTasks(); return; }
      const latest = toTask(row), plan = planMerge(base, mine, norm(latest));
      if (plan.clash.length) { setConflict({ id, vals, latest, clash: plan.clash, mine }); return; }
      version = latest.version;          // bagian kita tidak bentrok: gabungkan di atas versi terbaru
    }
    alert('Tugas ini terus diubah orang lain. Coba simpan lagi.');
    loadTasks();
  };
  const resolveConflict = async (keepMine) => {
    const c = conflict;
    setConflict(null);
    if (keepMine) {
      const { error } = await supabase.from('tasks').update(rowOf(c.vals)).eq('id', c.id);
      if (error) alert('Gagal menyimpan: ' + error.message);
    }
    setEdit(null);
    loadTasks();
  };
  const liveTask = edit?.id ? tasks.find((t) => t.id === edit.id) : null;
  const stale = !!(liveTask && edit.version != null && liveTask.version !== edit.version);
  const gone = !!(edit?.id && tasks.length > 0 && !liveTask);

  useEffect(() => {
    loadTasks();
    supabase.from('activity').select('text').order('id', { ascending: false }).limit(30).then(({ data }) => data && setLog(data));
    const ch = supabase.channel('papan-kerja', { config: { presence: { key: me.id } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, loadTasks)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, loadUsers)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity' }, (p) => setLog((l) => [{ text: p.new.text }, ...l].slice(0, 30)))
      .on('presence', { event: 'sync' }, () => setOnline(Object.keys(ch.presenceState())))
      .subscribe((status) => {
        setLive(status === 'SUBSCRIBED');
        if (status === 'SUBSCRIBED') ch.track({ at: Date.now() });
      });
    return () => { supabase.removeChannel(ch); };
  }, [me.id]);

  const today = iso(new Date());
  const shown = tasks.filter((t) => (!fUser || t.assignee === fUser) && (!fType || t.type === fType));
  const wk = monday(cur);
  const days = view === 'hari' ? [cur]
    : view === 'minggu' ? [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(wk, i))
    : Array.from({ length: 42 }, (_, i) => addDays(monday(new Date(cur.getFullYear(), cur.getMonth(), 1)), i));
  const step = (n) => setCur((c) => view === 'bulan' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : addDays(c, n * (view === 'hari' ? 1 : 7)));
  const inWeek = (t) => t.date && t.date >= iso(wk) && t.date <= iso(addDays(wk, 6));
  const groups = [
    ['week', 'Minggu ini', shown.filter(inWeek)],
    ['month', 'Bulan ini', shown.filter((t) => t.date && t.date.slice(0, 7) === iso(cur).slice(0, 7) && !inWeek(t))],
    ['none', 'Belum dijadwalkan', shown.filter((t) => !t.date)],
  ];
  const dropTo = (date, time) => {
    const id = drag.current;
    drag.current = null;
    if (id) emit('card:patch', { id, patch: time ? { date, time } : { date } });
  };
  const share = () => { navigator.clipboard?.writeText(location.href); setCopied(true); setTimeout(() => setCopied(false), 1500); };

  const { st: hs, en: he } = hourRange(tasks, full);
  useEffect(() => {
    localStorage.setItem('jam24', full ? '1' : '0');
    if (calRef.current && view !== 'bulan') calRef.current.scrollTop = Math.max(0, (7 - hs) * ROW);   // buka di jam 07.00
  }, [full, view]);
  const dayCol = (d) => {
    const key = iso(d);
    const evs = shown.filter((t) => t.date === key).sort((a, b) => mins(a.time) - mins(b.time));
    return (
      <div key={key} className="daycol" style={{ height: (he - hs) * ROW }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => dropTo(key, slotAt(e, hs, he))}
        onClick={(e) => { if (lead && e.target === e.currentTarget) setEdit({ ...BLANK, date: key, time: slotAt(e, hs, he) }); }}>
        {evs.map((t) => {
          const s = mins(t.time), en = s + t.dur;
          const ov = evs.filter((o) => mins(o.time) < en && mins(o.time) + o.dur > s);
          const i = ov.indexOf(t);
          return (
            <div key={t.id} className={'ev ty-' + t.type + (t.status === 'done' ? ' done' : '')}
              draggable={can(t)} onDragStart={() => (drag.current = t.id)}
              onClick={(e) => { e.stopPropagation(); setEdit(t); }}
              style={{ top: ((s - hs * 60) / 60) * ROW, height: Math.min(Math.max(28, (t.dur / 60) * ROW - 2), ((he * 60 - s) / 60) * ROW - 2), left: `${(i / ov.length) * 100}%`, width: `${100 / ov.length}%` }}>
              <b><i className={'si ' + t.status} title={STATUS[t.status]}>{STATUS_ICON[t.status]}</i>{t.title}</b>
              <small>{t.time} · {who(t.assignee)?.name.split(' ')[0] || '-'}</small>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="app">
      <nav className="rail">
        <div className="logo"><i /><i /><i /><i /></div>
        <button className={'sqall' + (!fUser ? ' on' : '')} onClick={() => setFUser(null)} title="Semua anggota">{tasks.length}</button>
        {users.map((u, i) => (
          <button key={u.id} className={'avb c' + i + (fUser === u.id ? ' on' : '')} title={`${u.name} (${ROLE[u.role]})`}
            onClick={() => setFUser(fUser === u.id ? null : u.id)}>
            {face(u)}<i className={online.includes(u.id) ? 'dot on' : 'dot'} />
          </button>
        ))}
        <div className="grow" />
        <button className="mini" onClick={onTheme}>{theme === 'dark' ? 'Terang' : 'Gelap'}</button>
        <button className="mini" onClick={() => setProfOpen(true)}>Profil</button>
        <button className="mini" onClick={() => setPwOpen(true)}>Sandi</button>
        <button className="mini" onClick={onLogout}>Keluar</button>
      </nav>

      <aside className="side">
        <div className="sidehead">
          <div><h1>Jobdesk</h1><small>{me.name} · {ROLE[me.role]}</small></div>
          {lead && <button className="sq" title="Tambah tugas" onClick={() => setEdit({ ...BLANK })}>+</button>}
        </div>
        {groups.map(([k, label, list]) => (
          <section key={k} className="grp">
            <h2 onClick={() => setOpen({ ...open, [k]: !open[k] })}>{label} <em>{list.length}</em><span>{open[k] ? '–' : '+'}</span></h2>
            {open[k] && list.map((t) => (
              <div key={t.id} className="row" draggable={can(t)} onDragStart={() => (drag.current = t.id)}>
                <input type="checkbox" checked={t.status === 'done'} disabled={!can(t)}
                  onChange={() => emit('card:patch', { id: t.id, patch: { status: t.status === 'done' ? 'todo' : 'done' } })} />
                <span className="rt" onClick={() => setEdit(t)}>{t.title}
                  <small>{t.date ? `${t.date.slice(8)}/${t.date.slice(5, 7)} · ${t.time}` : 'Tarik ke kalender'}</small>
                </span>
              </div>
            ))}
          </section>
        ))}
        <div className="feed">
          <h2>Aktivitas langsung</h2>
          {log.length === 0 && <p>Belum ada perubahan.</p>}
          {log.slice(0, 4).map((a, i) => <p key={i}>{a.text}</p>)}
        </div>
      </aside>

      <main className="main">
        <div className="top">
          <h1>{cur.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
            {view !== 'bulan' && <><i className="sl">/</i><span className="wk">W{weekNo(cur)}</span></>}</h1>
          <button className="arr" onClick={() => step(-1)}>←</button>
          <button className="arr" onClick={() => step(1)}>→</button>
          <div className="seg">
            {['hari', 'minggu', 'bulan'].map((v) => <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>)}
          </div>
          <div className="grow" />
          <span className={'live ' + (live ? 'on' : '')}>{live ? 'Langsung' : 'Terputus'}</span>
          <button className={'today' + (full ? ' on' : '')} onClick={() => setFull(!full)} title="Tampilkan 24 jam penuh">24 jam</button>
          <button className="today" onClick={() => setCur(new Date())}>Hari ini</button>
          <button className="share" onClick={share}>{copied ? 'Tersalin' : 'Bagikan'}</button>
        </div>

        <div className="cal" ref={calRef}>
          {view === 'bulan' ? (
            <div className="month">
              {DAYS.map((d) => <i key={d} className="mh">{d}</i>)}
              {days.map((d) => {
                const key = iso(d);
                const ts = shown.filter((t) => t.date === key);
                return (
                  <div key={key} className={'mcell' + (d.getMonth() !== cur.getMonth() ? ' out' : '') + (key === today ? ' now' : '')}
                    onDragOver={(e) => e.preventDefault()} onDrop={() => dropTo(key)}
                    onClick={() => { setCur(d); setView('hari'); }}>
                    <b>{d.getDate()}</b>
                    {ts.slice(0, 3).map((t) => (
                      <span key={t.id} className={'chip ty-' + t.type + (t.status === 'done' ? ' done' : '')}
                        draggable={can(t)} onDragStart={() => (drag.current = t.id)}
                        onClick={(e) => { e.stopPropagation(); setEdit(t); }}>{t.title}</span>
                    ))}
                    {ts.length > 3 && <small>+{ts.length - 3} lagi</small>}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ '--n': days.length }}>
              <div className="calhead">
                <div />
                {days.map((d) => (
                  <button key={iso(d)} className={'dh' + (iso(d) === today ? ' now' : '')} onClick={() => { setCur(d); setView('hari'); }}>
                    <b>{pad(d.getDate())}</b><span>{DAYS[(d.getDay() + 6) % 7]}</span>
                  </button>
                ))}
              </div>
              <div className="grid">
                <div className="hours">
                  {Array.from({ length: he - hs }, (_, i) => <span key={i} style={{ height: ROW }}>{pad(hs + i)}.00</span>)}
                </div>
                {days.map(dayCol)}
              </div>
            </div>
          )}
        </div>

        <div className="bottom">
          <div className="types">
            <h2>Jenis tugas</h2>
            {Object.entries(TYPES).map(([k, v]) => (
              <button key={k} className={'tp' + (fType === k ? ' on' : '')} onClick={() => setFType(fType === k ? null : k)}>
                <i className={'sw ty-' + k}>{ICON[k]}</i>{v}<em>{tasks.filter((t) => t.type === k).length}</em>
              </button>
            ))}
          </div>
          <div className="prog">
            <h2>Tugas berlangsung</h2>
            <div className="cards">
              {[...shown].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((t, i) => (
                <article key={t.id} className={'pc g' + (i % 4)} onClick={() => setEdit(t)}>
                  <div>
                    <h3>{t.title}</h3>
                    <p className={'stat ' + t.status}><i className={'si ' + t.status}>{STATUS_ICON[t.status]}</i>{STATUS[t.status]}</p>
                  </div>
                  <span className="av">{who(t.assignee) ? face(who(t.assignee)) : '-'}</span>
                </article>
              ))}
              {shown.length === 0 && <p>Belum ada tugas.</p>}
            </div>
          </div>
        </div>
      </main>

      {profOpen && <ProfileModal me={me} onClose={() => { setProfOpen(false); loadUsers(); }} />}
      {pwOpen && <PasswordModal me={me} onClose={() => setPwOpen(false)} />}
      {edit && <Modal key={edit.id + ':' + edit.version} card={edit} users={users} lead={lead} canStatus={edit.id ? can(edit) : true}
        canDelete={me.role === 'ketua' && edit.id}
        stale={stale} gone={gone} staleBy={who(liveTask?.updatedBy)?.name || 'orang lain'} onReload={() => liveTask && setEdit(liveTask)}
        onClose={() => setEdit(null)}
        onSave={(f) => {
          if (!lead) { emit('card:patch', { id: edit.id, patch: { status: f.status } }); setEdit(null); }
          else if (edit.id) saveEdit(f);
          else { emit('card:add', { ...f, date: f.date || null }); setEdit(null); }
        }}
        onDelete={() => { emit('card:delete', edit.id); setEdit(null); }} />}
      {conflict && (
        <div className="overlay">
          <div className="modal">
            <h3 style={{ margin: 0 }}>Tugas ini diubah orang lain</h3>
            <p style={{ margin: 0, fontSize: 14 }}>{who(conflict.latest.updatedBy)?.name || 'Seseorang'} mengubah bagian yang sama saat kamu mengedit. Bagian lain yang tidak bentrok sudah aman. Pilih versi untuk bagian di bawah ini:</p>
            <table className="cf">
              <thead><tr><th>Bagian</th><th>Versi mereka</th><th>Versimu</th></tr></thead>
              <tbody>{conflict.clash.map((k) => <tr key={k}><td>{LABEL[k]}</td><td>{showVal(k, norm(conflict.latest)[k])}</td><td>{showVal(k, conflict.mine[k])}</td></tr>)}</tbody>
            </table>
            <div className="actions">
              <button className="ghost" onClick={() => resolveConflict(false)}>Pakai versi mereka</button>
              <div className="grow" />
              <button className="primary" onClick={() => resolveConflict(true)}>Timpa dengan versiku</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Modal({ card, users, lead, canStatus, canDelete, stale, gone, staleBy, onReload, onClose, onSave, onDelete }) {
  const [f, setF] = useState({ ...card, date: card.date || '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        {gone && <div className="warnbar bad">Tugas ini sudah dihapus oleh orang lain.</div>}
        {stale && !gone && <div className="warnbar">Tugas ini baru saja diubah oleh <b>{staleBy}</b>. Perubahanmu akan digabung saat disimpan, atau <button className="link" onClick={onReload}>muat ulang form</button> untuk melihat versi terbaru.</div>}
        <label>Judul<input value={f.title} onChange={set('title')} disabled={!lead} autoFocus /></label>
        <label>Deskripsi<textarea rows="2" value={f.desc} onChange={set('desc')} disabled={!lead} /></label>
        <div className="two">
          <label>Ditugaskan ke
            <select value={f.assignee || ''} onChange={set('assignee')} disabled={!lead}>
              <option value="">Belum ada</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
          <label>Jenis
            <select value={f.type} onChange={set('type')} disabled={!lead}>
              {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label>Tanggal<input type="date" value={f.date} onChange={set('date')} disabled={!lead} /></label>
          <label>Mulai<input type="time" value={f.time} onChange={set('time')} disabled={!lead} /></label>
        </div>
        <div className="two">
          <label>Durasi
            <select value={f.dur} onChange={set('dur')} disabled={!lead}>
              {[30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m} menit</option>)}
            </select>
          </label>
          <label>Status
            <select value={f.status} onChange={set('status')} disabled={!canStatus}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>
        </div>
        <div className="actions">
          {canDelete && <button className="danger" onClick={onDelete}>Hapus</button>}
          <div className="grow" />
          <button className="ghost" onClick={onClose}>Tutup</button>
          {(lead || canStatus) && !gone && <button className="primary" onClick={() => f.title.trim() && onSave(f)}>Simpan</button>}
        </div>
      </div>
    </div>
  );
}

function PasswordModal({ me, onClose }) {
  const [f, setF] = useState({ oldPassword: '', newPassword: '' });
  const [msg, setMsg] = useState('');
  const save = async () => {
    if (f.newPassword.length < 6) return setMsg('Password baru minimal 6 karakter');
    const { error: e1 } = await supabase.auth.signInWithPassword({ email: me.email, password: f.oldPassword });
    if (e1) return setMsg('Password lama salah');
    const { error: e2 } = await supabase.auth.updateUser({ password: f.newPassword });
    if (e2) return setMsg(e2.message);
    onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <label>Password lama<input type="password" value={f.oldPassword} onChange={(e) => setF({ ...f, oldPassword: e.target.value })} autoFocus /></label>
        <label>Password baru (minimal 6 karakter)<input type="password" value={f.newPassword} onChange={(e) => setF({ ...f, newPassword: e.target.value })} /></label>
        {msg && <p className="err">{msg}</p>}
        <div className="actions">
          <div className="grow" />
          <button className="ghost" onClick={onClose}>Batal</button>
          <button className="primary" onClick={save}>Simpan password</button>
        </div>
      </div>
    </div>
  );
}

function ProfileModal({ me, onClose }) {
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar || { type: 'animal', value: ANIMALS[0] });
  const [msg, setMsg] = useState('');
  const pick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const m = Math.min(img.width, img.height);
      c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 128, 128);
      setAvatar({ type: 'photo', value: c.toDataURL('image/jpeg', 0.8) });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => setMsg('File bukan gambar yang valid');
    img.src = URL.createObjectURL(file);
  };
  const save = async () => {
    const n = name.trim();
    if (n.length < 2 || n.length > 40) return setMsg('Nama harus 2–40 karakter');
    const { error } = await supabase.from('profiles').update({ name: n, avatar_type: avatar.type, avatar_value: avatar.value }).eq('id', me.id);
    if (error) setMsg(error.message); else onClose();
  };
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="bigav">{face({ name, avatar })}</div>
        <label>Nama tampilan<input value={name} onChange={(e) => setName(e.target.value)} autoFocus /></label>
        <div>
          <b className="lbl">Pilih ikon hewan</b>
          <div className="animals">
            {ANIMALS.map((a) => (
              <button key={a} type="button" className={avatar.type === 'animal' && avatar.value === a ? 'on' : ''}
                onClick={() => setAvatar({ type: 'animal', value: a })}>{a}</button>
            ))}
          </div>
        </div>
        <label>Atau unggah foto<input type="file" accept="image/*" onChange={pick} /></label>
        {msg && <p className="err">{msg}</p>}
        <div className="actions">
          <div className="grow" />
          <button className="ghost" onClick={onClose}>Batal</button>
          <button className="primary" onClick={save}>Simpan profil</button>
        </div>
      </div>
    </div>
  );
}