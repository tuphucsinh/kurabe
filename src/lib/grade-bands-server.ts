import 'server-only';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { loadGradeBandsSnapshotFromDb, GradeBandsSnapshot } from '@/lib/grade-bands';

/** Load the authoritative active version; DB/config failure blocks scoring writes. */
export async function ensureServerGradeBands(): Promise<GradeBandsSnapshot> {
  return loadGradeBandsSnapshotFromDb(supabaseAdmin);
}
