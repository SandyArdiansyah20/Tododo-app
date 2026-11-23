import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// ready = false bila variabel lingkungan belum diisi (App menampilkan petunjuk, bukan layar kosong)
export const ready = Boolean(url && key);
export const supabase = ready ? createClient(url, key) : null;
