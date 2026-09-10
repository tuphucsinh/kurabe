import { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Database, Json } from '@/types/database';
import type { Grade } from '@/types';
import { parseGrade } from '@/lib/parsers';

export type GradeBand = {
  grade: Grade;
  minScore: number | null;
  maxScore: number | null;
  sortOrder?: number;
};

export type GradeBands = {
  leader: GradeBand[];
  staff: GradeBand[];
  worker: GradeBand[];
  version?: number;
  versionId?: string;
  checksum?: string;
};

export type GradeBandsSnapshot = GradeBands & {
  version: number;
  versionId: string;
  checksum: string;
};

// Bootstrap-only values for the synchronous first render. Server scoring never
// silently falls back after an authoritative DB load has been attempted.
const HARDCODED_BANDS: GradeBands = {
  leader: [
    { grade: 'S', minScore: 170, maxScore: null, sortOrder: 0 },
    { grade: 'A', minScore: 160, maxScore: 169, sortOrder: 1 },
    { grade: 'AB', minScore: 130, maxScore: 159, sortOrder: 2 },
    { grade: 'B', minScore: 100, maxScore: 129, sortOrder: 3 },
    { grade: 'C', minScore: 70, maxScore: 99, sortOrder: 4 },
    { grade: 'D', minScore: null, maxScore: 69, sortOrder: 5 },
  ],
  staff: [
    { grade: 'S', minScore: 155, maxScore: null, sortOrder: 0 },
    { grade: 'A', minScore: 145, maxScore: 154, sortOrder: 1 },
    { grade: 'AB', minScore: 115, maxScore: 144, sortOrder: 2 },
    { grade: 'B', minScore: 90, maxScore: 114, sortOrder: 3 },
    { grade: 'C', minScore: 60, maxScore: 89, sortOrder: 4 },
    { grade: 'D', minScore: null, maxScore: 59, sortOrder: 5 },
  ],
  worker: [
    { grade: 'S', minScore: 155, maxScore: null, sortOrder: 0 },
    { grade: 'A', minScore: 145, maxScore: 154, sortOrder: 1 },
    { grade: 'AB', minScore: 115, maxScore: 144, sortOrder: 2 },
    { grade: 'B', minScore: 90, maxScore: 114, sortOrder: 3 },
    { grade: 'C', minScore: 60, maxScore: 89, sortOrder: 4 },
    { grade: 'D', minScore: null, maxScore: 59, sortOrder: 5 },
  ],
};

let cachedSnapshot: GradeBandsSnapshot | null = null;

export function getGradeBandsSync(): GradeBands {
  return cachedSnapshot ?? HARDCODED_BANDS;
}

function parseSnapshot(value: Json): GradeBandsSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('P99M3T01_CONFIG_UNAVAILABLE');
  const record = value as Record<string, Json>;
  if (typeof record.version !== 'number' || typeof record.version_id !== 'string' || typeof record.checksum !== 'string' || !Array.isArray(record.bands)) {
    throw new Error('P99M3T01_CONFIG_UNAVAILABLE');
  }
  const bands: GradeBands = { leader: [], staff: [], worker: [], version: record.version, versionId: record.version_id, checksum: record.checksum };
  for (const item of record.bands) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('P99M3T01_CONFIG_UNAVAILABLE');
    const row = item as Record<string, Json>;
    const group = row.role_group;
    if (group !== 'leader' && group !== 'staff' && group !== 'worker') throw new Error('P99M3T01_CONFIG_UNAVAILABLE');
    bands[group].push({
      grade: parseGrade(row.grade),
      minScore: typeof row.min_score === 'number' ? row.min_score : null,
      maxScore: typeof row.max_score === 'number' ? row.max_score : null,
      sortOrder: typeof row.sort_order === 'number' ? row.sort_order : undefined,
    });
  }
  if (bands.leader.length !== 6 || bands.staff.length !== 6 || bands.worker.length !== 6) throw new Error('P99M3T01_CONFIG_UNAVAILABLE');
  return bands as GradeBandsSnapshot;
}

export async function loadGradeBandsSnapshotFromDb(
  db: SupabaseClient<Database> = supabase
): Promise<GradeBandsSnapshot> {
  const { data, error } = await db.rpc('get_active_grade_config');
  if (error || !data) throw new Error(`P99M3T01_CONFIG_UNAVAILABLE: ${error?.message ?? 'empty response'}`);
  const snapshot = parseSnapshot(data);
  cachedSnapshot = snapshot;
  return snapshot;
}

export async function loadGradeBandsFromDb(
  db: SupabaseClient<Database> = supabase
): Promise<GradeBands> {
  return loadGradeBandsSnapshotFromDb(db);
}

export function invalidateGradeBandsCache() {
  cachedSnapshot = null;
}
