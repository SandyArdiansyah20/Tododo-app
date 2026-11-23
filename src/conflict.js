// Aturan deteksi konflik edit (murni, mudah diuji). Nilai selalu dinormalkan dulu sebelum dibandingkan.
export const FIELDS = ['title', 'desc', 'assignee', 'type', 'status', 'date', 'time', 'dur'];
export const norm = (t) => ({
  title: (t.title || '').trim(), desc: t.desc || '', assignee: t.assignee || null, type: t.type, status: t.status,
  date: t.date || null, time: (t.time || '09:00').slice(0, 5), dur: Number(t.dur),
});
export const changedFields = (a, b) => FIELDS.filter((k) => a[k] !== b[k]);

// base   = salinan tugas saat formulir dibuka
// mine   = isian pengguna sekarang
// latest = tugas terbaru di database
// changed = bagian yang SAYA ubah | theirs = bagian yang ORANG LAIN ubah
// clash  = bagian yang kita berdua ubah ke nilai berbeda (hanya ini yang perlu keputusan)
export function planMerge(base, mine, latest) {
  const changed = changedFields(base, mine);
  const theirs = changedFields(base, latest);
  const clash = changed.filter((k) => theirs.includes(k) && latest[k] !== mine[k]);
  return { changed, theirs, clash };
}
