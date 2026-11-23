# Papan Kerja Tim (Supabase + Vercel)

Kalender jobdesk real-time (React + Vite) dengan database, login, dan real-time dari Supabase.
Tim: 1 Ketua Tim, 2 Asisten Ketua Tim, 3 Anggota.

## 1. Siapkan Supabase (sekali saja)
1. Buat project di supabase.com.
2. **SQL Editor -> New query**, tempel isi `supabase/schema.sql`, klik **Run**.
3. **Authentication -> Sign In / Providers**: matikan **Allow new users to sign up** (agar orang luar tidak bisa mendaftar).
4. **Project Settings -> API**: salin *Project URL*, *anon public key*, dan *service_role key*.

## 2. Buat akun tim (sekali saja, dari komputermu)
    npm install
    # PowerShell:
    $env:SUPABASE_URL="https://ltsvdbekxxfzzwhyqhcz.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0c3ZkYmVreHhmenp3aHlxaGN6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc5NDg5MzYxMywiZXhwIjoyMTEwNDY5NjEzfQ.zChT2h7dyMMEAcbuiAe_wLnUlOAkgE9z3IHA1HWnuAk"; npm run seed
Semua akun awalnya berpassword `kantor123` (ganti lewat tombol **Sandi**). Nama & peran ada di `scripts/seed-users.mjs`.
Lupa password? Jalankan lagi dengan `$env:RESET_PASSWORD="1"` sebelum `npm run seed` (semua akun kembali ke password awal).
`service_role` key RAHASIA: jangan di-commit dan jangan dipasang di Vercel.

## 3. Jalankan lokal
Salin `.env.example` menjadi `.env`, isi URL dan anon key, lalu `npm run dev`.

## 4. Deploy ke Vercel
**Settings -> Environment Variables**: tambahkan `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`, lalu **Redeploy**
(variabel hanya terbaca saat build).

## Hak akses (dijaga database, bukan browser)
- Ketua: tambah, ubah, hapus, pindah semua tugas
- Asisten: tambah, ubah, pindah semua tugas
- Anggota: hanya mengubah status dan jadwal tugas miliknya
