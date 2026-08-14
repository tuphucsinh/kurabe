import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database';

/**
 * Supabase ADMIN client — dùng SERVICE ROLE key (server-only, vượt RLS).
 * CHỈ dùng trong server actions đã qua requireAuth/requireManager (P54T01).
 * KHÔNG BAO GIỜ import vào client component (service key là bí mật).
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
