# Papan Kerja Tim

Papan kanban ala Trello dengan update real-time (React + Vite + Socket.io).
Tim: 1 Ketua Tim, 2 Asisten Ketua Tim, 3 Anggota (ubah di `USERS` pada `server/index.js`).

## Jalankan
    npm install
    npm run dev          # buka http://localhost:5173

## Untuk dipakai satu kantor (satu jaringan)
    npm run build && npm start   # buka http://IP-KOMPUTER-SERVER:3001

## Login
Semua akun awalnya memakai password `kantor123`. Setiap orang wajib menggantinya lewat tombol
"Ganti password" setelah login pertama. Password disimpan ter-hash di `server/passwords.json`;
lupa password = hapus entri orang itu di file tersebut lalu restart server (kembali ke `kantor123`).
Setelah 5 kali salah, akun dikunci 1 menit. Sesi hilang saat server di-restart.

## Profil
Tombol **Profil** di rel kiri: ganti nama tampilan, pilih ikon hewan, atau unggah foto (otomatis dipotong
kotak dan dikecilkan 128px). Perubahan langsung terlihat oleh semua orang. Disimpan di `server/profiles.json`.

## Tema
Tombol **Gelap/Terang** di rel kiri (atau di pojok halaman login) mengganti mode. Pilihan tersimpan di browser
masing-masing; bila belum dipilih, mengikuti pengaturan perangkat.

## Hak akses
- Ketua: tambah, ubah, hapus, pindah semua tugas
- Asisten: tambah, ubah, pindah semua tugas
- Anggota: hanya memindahkan tugas yang ditugaskan ke dirinya

Catatan: pakai HTTPS (misalnya lewat reverse proxy) bila diakses di luar jaringan kantor.
Data tersimpan di `server/data.json`.
