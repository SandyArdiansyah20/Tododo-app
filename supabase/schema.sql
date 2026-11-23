-- Papan Kerja Tim: skema Supabase. Jalankan SEKALI di Supabase -> SQL Editor -> New query.

-- ========== TABEL ==========
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  name text not null check (char_length(name) between 2 and 40),
  role text not null check (role in ('ketua', 'asisten', 'anggota')),
  sort int not null default 0,
  avatar_type text not null default 'animal' check (avatar_type in ('animal', 'photo')),
  avatar_value text not null default '🦁',
  constraint avatar_valid check (
    (avatar_type = 'animal' and char_length(avatar_value) <= 8)
    or (avatar_type = 'photo' and char_length(avatar_value) < 150000
        and avatar_value ~ '^data:image/jpeg;base64,[A-Za-z0-9+/=]+$')
  )
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  description text not null default '' check (char_length(description) <= 500),
  assignee uuid references public.profiles (id) on delete set null,
  type text not null default 'lain' check (type in ('rapat', 'laporan', 'admin', 'lain')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  date date,
  time time not null default '09:00',
  dur int not null default 60 check (dur between 30 and 480),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.activity (
  id bigint generated always as identity primary key,
  text text not null,
  created_at timestamptz not null default now()
);

-- ========== PERAN PENGGUNA ==========
create function public.my_role() returns text
language sql stable security definer set search_path = public as
$$ select role from public.profiles where id = auth.uid() $$;

-- ========== HAK AKSES (RLS) ==========
alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.activity enable row level security;

revoke all on public.profiles, public.tasks, public.activity from anon, authenticated;
grant select on public.profiles to anon, authenticated;                       -- daftar nama di halaman login
grant update (name, avatar_type, avatar_value) on public.profiles to authenticated;  -- peran TIDAK bisa diubah sendiri
grant select, insert, update, delete on public.tasks to authenticated;
grant select on public.activity to authenticated;

create policy "profil terbaca" on public.profiles for select to anon, authenticated using (true);
create policy "ubah profil sendiri" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "tugas terbaca anggota tim" on public.tasks for select to authenticated
  using (public.my_role() is not null);
create policy "ketua dan asisten menambah tugas" on public.tasks for insert to authenticated
  with check (public.my_role() in ('ketua', 'asisten'));
create policy "ubah tugas" on public.tasks for update to authenticated
  using (public.my_role() in ('ketua', 'asisten') or assignee = auth.uid())
  with check (public.my_role() in ('ketua', 'asisten') or assignee = auth.uid());
create policy "hanya ketua menghapus" on public.tasks for delete to authenticated
  using (public.my_role() = 'ketua');

create policy "aktivitas terbaca anggota tim" on public.activity for select to authenticated
  using (public.my_role() is not null);

-- Anggota hanya boleh mengubah status & jadwal tugasnya sendiri
create function public.guard_task_update() returns trigger language plpgsql as $$
begin
  if public.my_role() = 'anggota' and (
       new.title is distinct from old.title
    or new.description is distinct from old.description
    or new.assignee is distinct from old.assignee
    or new.type is distinct from old.type
    or new.dur is distinct from old.dur) then
    raise exception 'Anggota hanya boleh mengubah status dan jadwal tugasnya sendiri';
  end if;
  return new;
end $$;
create trigger guard_task_update before update on public.tasks
  for each row execute function public.guard_task_update();

-- Catatan aktivitas dibuat otomatis oleh database (tidak bisa dipalsukan dari browser)
create function public.log_task() returns trigger language plpgsql security definer set search_path = public as $$
declare who text; msg text;
begin
  select name into who from public.profiles where id = auth.uid();
  who := coalesce(who, 'Seseorang');
  if tg_op = 'INSERT' then msg := who || ' menambah tugas "' || new.title || '"';
  elsif tg_op = 'DELETE' then msg := who || ' menghapus tugas "' || old.title || '"';
  elsif new.status is distinct from old.status then msg := who || ' mengubah status "' || new.title || '"';
  elsif new.date is distinct from old.date or new.time is distinct from old.time then msg := who || ' menjadwalkan "' || new.title || '"';
  else msg := who || ' mengubah tugas "' || new.title || '"';
  end if;
  insert into public.activity (text) values (msg);
  delete from public.activity where id <= (select max(id) from public.activity) - 200;
  return null;
end $$;
create trigger log_task after insert or update or delete on public.tasks
  for each row execute function public.log_task();

-- ========== REAL-TIME ==========
alter publication supabase_realtime add table public.tasks, public.profiles, public.activity;
