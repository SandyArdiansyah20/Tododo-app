// Membuat 6 akun tim + profilnya. Jalankan SEKALI dari komputermu (bukan di Vercel):
//   PowerShell: $env:SUPABASE_URL="https://xxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."; npm run seed
// service_role key bersifat RAHASIA: jangan dimasukkan ke Git, .env yang di-commit, atau Vercel.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const password = process.env.DEFAULT_PASSWORD || 'kantor123';
if (!url || !key) {
  console.error('Isi SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY dulu (lihat README).');
  process.exit(1);
}
const sb = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// slug, nama, peran, ikon awal
const TEAM = [
  ['u1', 'Budi Santoso', 'ketua', '🦁'],
  ['u2', 'Sari Wulandari', 'asisten', '🦊'],
  ['u3', 'Dedi Pratama', 'asisten', '🐼'],
  ['u4', 'Rina Maharani', 'anggota', '🐰'],
  ['u5', 'Andi Kurniawan', 'anggota', '🐯'],
  ['u6', 'Tono Hidayat', 'anggota', '🐨'],
];

for (const [i, [slug, name, role, emoji]] of TEAM.entries()) {
  const email = `${slug}@papan-kerja.app`;
  let id;
  const created = await sb.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    const { data } = await sb.auth.admin.listUsers({ perPage: 200 });
    id = data?.users.find((u) => u.email === email)?.id;
    if (!id) { console.error(`Gagal membuat ${email}:`, created.error.message); process.exit(1); }
    if (process.env.RESET_PASSWORD === '1') await sb.auth.admin.updateUserById(id, { password });
    console.log(`${email}: akun sudah ada, profil diperbarui${process.env.RESET_PASSWORD === '1' ? ', password direset' : ''}`);
  } else {
    id = created.data.user.id;
    console.log(`${email}: akun dibuat`);
  }
  const { error } = await sb.from('profiles').upsert({ id, email, name, role, sort: i, avatar_type: 'animal', avatar_value: emoji });
  if (error) { console.error(`Gagal menyimpan profil ${name}:`, error.message); process.exit(1); }
}
console.log(`Selesai. Semua akun memakai password: ${password}`);
