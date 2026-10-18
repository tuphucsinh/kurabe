#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
// Dynamic client loader allows dry-run and offline unit checks without requiring @supabase/supabase-js initialized in dry-run
async function createSupabaseServiceClient(supabaseUrl, serviceRoleKey) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch (err) {
    throw new Error(`Failed to initialize Supabase client: ${err?.message || String(err)}`);
  }
}


export const SYNTHETIC_FIXTURE_SHA256_ALLOWLIST = Object.freeze([
  'df47ee294d5b4158fbbee49341420fc6e639fc1fc64e50bc86dd52e8ccb56216',
]);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function uuidV5(name, namespace) {
  let nsBuf;
  if (typeof namespace === 'string') {
    if (!UUID_REGEX.test(namespace)) {
      throw new Error(`Invalid namespace UUID format: ${namespace}`);
    }
    const clean = namespace.replace(/-/g, '');
    nsBuf = Buffer.from(clean, 'hex');
    if (nsBuf.length !== 16) {
      throw new Error(`Namespace must decode to exactly 16 bytes: ${namespace}`);
    }
  } else if (Buffer.isBuffer(namespace) && namespace.length === 16) {
    nsBuf = namespace;
  } else {
    throw new Error('Namespace must be a valid UUID string or 16-byte Buffer');
  }

  const hash = crypto.createHash('sha1').update(nsBuf).update(Buffer.from(String(name), 'utf8')).digest();

  // Set version 5 (0x50) in byte 6
  hash[6] = (hash[6] & 0x0f) | 0x50;
  // Set variant RFC 4122 / 9562 (0x80) in byte 8
  hash[8] = (hash[8] & 0x3f) | 0x80;

  const hex = hash.toString('hex', 0, 16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function redact(text) {
  return String(text || '')
    .replace(/(?:postgres(?:ql)?:\/\/)[^\s)]+/gi, '[REDACTED_DB_TARGET]')
    .replace(/(\b(?:POSTGRES_PASSWORD|PGPASSWORD|password|secret|key|service_role|token)\b\s*[:=]\s*)(?:'[^']*'|"[^"]*"|[^\s,"';]+)/gi, '$1[redacted]')
    .replace(/eyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]*/g, '[REDACTED_JWT]');
}

export function isUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val.trim());
}

export function isLoopbackHost(hostname) {
  if (!hostname) return false;
  return LOOPBACK_HOSTS.has(hostname.toLowerCase());
}

export function parseArgs(argv) {
  const options = {
    mode: null,
    manifestPath: null,
    expectedVersion: null,
    signedSha: null,
    disposable: false,
    supabaseUrl: null,
    help: false,
  };

  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--dry-run') {
      options.mode = 'dry-run';
    } else if (arg === '--apply') {
      options.mode = 'apply';
    } else if (arg === '--verify') {
      options.mode = 'verify';
    } else if (arg === '--manifest' || arg === '-m') {
      options.manifestPath = argv[++i];
    } else if (arg === '--expected-version') {
      const v = argv[++i];
      options.expectedVersion = (v !== undefined && v !== null && v !== '') ? Number(v) : null;
    } else if (arg === '--signed-sha') {
      options.signedSha = argv[++i];
    } else if (arg === '--disposable' || arg === '--disposable-target' || arg === '--target-disposable' || arg === '--allow-disposable') {
      options.disposable = true;
    } else if (arg === '--supabase-url') {
      options.supabaseUrl = argv[++i];
    } else if (arg.startsWith('--')) {
      const optName = arg.split('=')[0];
      throw new Error(`Unknown option: ${optName}`);
    } else {
      positional.push(arg);
    }
  }

  if (!options.manifestPath && positional.length > 0) {
    options.manifestPath = positional[0];
  }

  return options;
}

export function loadEnv(rootDir = process.cwd()) {
  const env = { ...process.env };
  const envPath = path.join(rootDir, '.env.local');
  if (fs.existsSync(envPath)) {
    try {
      for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let value = m[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        env[m[1]] = value;
      }
    } catch {
      // ignore .env.local read errors
    }
  }
  return env;
}

export function computeSetHash(config, setKey) {
  const groups = (config.groups || [])
    .filter((g) => g.set_key === setKey)
    .map((g) => {
      const criteria = (g.criteria || [])
        .filter((c) => c.set_key === setKey)
        .map((c) => {
          const levels = (c.levels || []).map((l) => ({
            id: l.id,
            criterion_id: l.criterion_id || c.id,
            points: Number(l.points),
            label: String(l.label || '').trim(),
            description: l.description ? String(l.description).trim() : null,
            sort_order: Number(l.sort_order),
          })).sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

          return {
            id: c.id,
            group_id: c.group_id || g.id,
            set_key: c.set_key,
            code: String(c.code || '').trim(),
            name: String(c.name || '').trim(),
            description: c.description ? String(c.description).trim() : null,
            weight: Number(c.weight ?? 0),
            default_level_index: (c.default_level_index !== undefined && c.default_level_index !== null) ? Number(c.default_level_index) : null,
            sort_order: Number(c.sort_order),
            levels,
          };
        }).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));

      return {
        id: g.id,
        set_key: g.set_key,
        code: String(g.code || '').trim(),
        name: String(g.name || '').trim(),
        short_name: g.short_name ? String(g.short_name).trim() : null,
        sort_order: Number(g.sort_order),
        criteria,
      };
    }).sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code) || a.id.localeCompare(b.id));

  const normalized = {
    set_key: setKey,
    groups,
  };
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function computeAllSetHashes(config) {
  return {
    leader: computeSetHash(config, 'leader'),
    staff: computeSetHash(config, 'staff'),
    worker: computeSetHash(config, 'worker'),
  };
}

export function getCounts(config) {
  const counts = {
    leader: { groups: 0, criteria: 0 },
    staff: { groups: 0, criteria: 0 },
    worker: { groups: 0, criteria: 0 },
    total_groups: 0,
    total_criteria: 0,
  };

  for (const group of config.groups || []) {
    const setKey = group.set_key;
    if (counts[setKey]) {
      counts[setKey].groups += 1;
      counts.total_groups += 1;
      const critCount = (group.criteria || []).filter((c) => c.set_key === setKey).length;
      counts[setKey].criteria += critCount;
      counts.total_criteria += critCount;
    }
  }

  return counts;
}

export function validateManifestNodes(manifest) {
  const groups = Array.isArray(manifest) ? manifest : (manifest.groups || []);
  if (!Array.isArray(groups) || groups.length === 0) {
    throw new Error('REFUSE_INVALID_MANIFEST: manifest must have a non-empty groups array');
  }

  const seenUuids = new Set();

  for (const group of groups) {
    if (!isUuid(group.id)) {
      throw new Error(`REFUSE_MISSING_UUID: group code=${group.code || 'unknown'} missing UUID id`);
    }
    if (seenUuids.has(group.id)) {
      throw new Error(`REFUSE_DUPLICATE_UUID: duplicate group UUID: ${group.id}`);
    }
    seenUuids.add(group.id);

    if (!group.set_key || !['leader', 'staff', 'worker'].includes(group.set_key)) {
      throw new Error(`REFUSE_INVALID_SET: group code=${group.code} invalid set_key ${group.set_key}`);
    }
    const criteria = group.criteria || [];
    for (const criterion of criteria) {
      if (!isUuid(criterion.id)) {
        throw new Error(`REFUSE_MISSING_UUID: criterion code=${criterion.code || 'unknown'} missing UUID id`);
      }
      if (seenUuids.has(criterion.id)) {
        throw new Error(`REFUSE_DUPLICATE_UUID: duplicate criterion UUID: ${criterion.id}`);
      }
      seenUuids.add(criterion.id);

      if (criterion.group_id === undefined || criterion.group_id === null || typeof criterion.group_id !== 'string' || criterion.group_id.trim() === '') {
        throw new Error(`REFUSE_RELATION_MISSING: criterion ${criterion.code || 'unknown'} missing required group_id`);
      }
      if (!isUuid(criterion.group_id)) {
        throw new Error(`REFUSE_RELATION_MISSING: criterion ${criterion.code || 'unknown'} group_id must be a valid UUID`);
      }
      if (criterion.group_id !== group.id) {
        throw new Error(`REFUSE_RELATION_MISMATCH: criterion ${criterion.code} group_id ${criterion.group_id} does not match group id ${group.id}`);
      }
      if (criterion.set_key !== group.set_key) {
        throw new Error(`REFUSE_SET_MISMATCH: criterion code=${criterion.code} set_key ${criterion.set_key} does not match group set_key ${group.set_key}`);
      }
      const levels = criterion.levels || [];
      if (!Array.isArray(levels) || levels.length === 0) {
        throw new Error(`REFUSE_EMPTY_LEVELS: criterion code=${criterion.code} has no levels`);
      }
      for (const level of levels) {
        if (!isUuid(level.id)) {
          throw new Error(`REFUSE_MISSING_UUID: level label=${level.label || 'unknown'} for criterion ${criterion.code} missing UUID id`);
        }
        if (seenUuids.has(level.id)) {
          throw new Error(`REFUSE_DUPLICATE_UUID: duplicate level UUID: ${level.id}`);
        }
        seenUuids.add(level.id);

        if (level.criterion_id === undefined || level.criterion_id === null || typeof level.criterion_id !== 'string' || level.criterion_id.trim() === '') {
          throw new Error(`REFUSE_RELATION_MISSING: level ${level.id || 'unknown'} missing required criterion_id`);
        }
        if (!isUuid(level.criterion_id)) {
          throw new Error(`REFUSE_RELATION_MISSING: level ${level.id || 'unknown'} criterion_id must be a valid UUID`);
        }
        if (level.criterion_id !== criterion.id) {
          throw new Error(`REFUSE_RELATION_MISMATCH: level ${level.id} criterion_id ${level.criterion_id} does not match criterion id ${criterion.id}`);
        }
      }
    }
  }
}

export const G1_NAMESPACE = 'bdb8cc91-a1b0-5e76-807c-bf46cf444dc1';
export const PINNED_WORKBOOK_SHA256 = '3e3cfd7eddc18567eb3dfaaaf6586696044681fbfb337df845d043d884811743';
export const G1_DECISION_REF = '.ai/DECISIONS_LOG.md: P108 G1 — FULL owner approval / T02 local execution; manifest NOT SIGNED';

// The G1 pins are intentionally tied to the verified content; a future criteria revision must update the pin in code review
export const G1_CANONICAL_CONTENT_SHA256 = '2b91d4623c57f047b323632809490c86ddea9f059e3e10807d85537eb9d11893';
export const G1_PINNED_SET_HASHES = Object.freeze({
  leader: '82d98df54eb057c54d77c6bc2ecd278370fe4c2556f3b1715f30d58dd6fe0f22',
  staff: '10e3fcc8abd7637c0bb9337ae6667efd2e63606ef0e7c8b36d1b41120dc036b8',
  worker: 'e13625dd25f234c64e2820a435c0ddc414f1ed2d6adfbed135dabc67d418ade6',
});

export function projectCanonicalContent(manifest) {
  const groups = manifest?.groups || [];
  return {
    groups: groups.map((g) => ({
      id: g.id,
      set_key: g.set_key,
      code: g.code,
      name: g.name,
      short_name: g.short_name,
      sort_order: g.sort_order,
      criteria: (g.criteria || []).map((c) => ({
        id: c.id,
        group_id: c.group_id,
        set_key: c.set_key,
        code: c.code,
        name: c.name,
        description: c.description,
        weight: c.weight,
        default_level_index: c.default_level_index,
        sort_order: c.sort_order,
        levels: (c.levels || []).map((l) => ({
          id: l.id,
          criterion_id: l.criterion_id,
          points: l.points,
          label: l.label,
          description: l.description,
          sort_order: l.sort_order,
        })),
      })),
    })),
  };
}

export function validateG1Manifest(manifest) {
  if (!manifest || !manifest._metadata || typeof manifest._metadata !== 'object') {
    throw new Error('REFUSE_G1_MISSING_METADATA: manifest must contain _metadata object');
  }
  const meta = manifest._metadata;

  if (meta.workbook_sha256 !== PINNED_WORKBOOK_SHA256) {
    throw new Error(`REFUSE_G1_METADATA_WORKBOOK_SHA_MISMATCH: workbook_sha256 must be ${PINNED_WORKBOOK_SHA256}, got ${meta.workbook_sha256}`);
  }
  if (meta.uuid_namespace !== G1_NAMESPACE) {
    throw new Error(`REFUSE_G1_INVALID_NAMESPACE: uuid_namespace must be ${G1_NAMESPACE}, got ${meta.uuid_namespace}`);
  }
  if (meta.revision !== '07') {
    throw new Error(`REFUSE_G1_METADATA_REVISION_MISMATCH: revision must be 07, got ${meta.revision}`);
  }
  if (meta.effective_date !== '2026-10-01') {
    throw new Error(`REFUSE_G1_METADATA_EFFECTIVE_DATE_MISMATCH: effective_date must be 2026-10-01, got ${meta.effective_date}`);
  }
  if (meta.revised_date !== '2026-07-28') {
    throw new Error(`REFUSE_G1_METADATA_REVISED_DATE_MISMATCH: revised_date must be 2026-07-28, got ${meta.revised_date}`);
  }
  if (meta.first_period !== 'Kỳ 2026') {
    throw new Error(`REFUSE_G1_METADATA_FIRST_PERIOD_MISMATCH: first_period must be Kỳ 2026, got ${meta.first_period}`);
  }
  if (meta.period_frequency !== 'yearly') {
    throw new Error(`REFUSE_G1_METADATA_PERIOD_FREQUENCY_MISMATCH: period_frequency must be yearly, got ${meta.period_frequency}`);
  }
  if (meta.g1_decision_ref !== G1_DECISION_REF) {
    throw new Error('REFUSE_G1_METADATA_DECISION_REF_MISMATCH: g1_decision_ref mismatch');
  }

  const actualCounts = getCounts(manifest);
  if (
    actualCounts.leader.groups !== 6 || actualCounts.leader.criteria !== 33 ||
    actualCounts.staff.groups !== 6 || actualCounts.staff.criteria !== 30 ||
    actualCounts.worker.groups !== 6 || actualCounts.worker.criteria !== 30 ||
    actualCounts.total_groups !== 18 || actualCounts.total_criteria !== 93
  ) {
    throw new Error('REFUSE_G1_INVALID_COUNTS: manifest counts must be leader 6/33, staff 6/30, worker 6/30, total 18/93');
  }

  const expectedMetaCounts = {
    leader: { groups: 6, criteria: 33 },
    staff: { groups: 6, criteria: 30 },
    worker: { groups: 6, criteria: 30 },
    total_groups: 18,
    total_criteria: 93,
  };
  if (JSON.stringify(meta.counts) !== JSON.stringify(expectedMetaCounts)) {
    throw new Error('REFUSE_G1_METADATA_COUNTS_MISMATCH: _metadata.counts does not match expected G1 counts');
  }

  const expectedSets = ['leader', 'staff', 'worker'];
  for (const setKey of expectedSets) {
    const setGroups = (manifest.groups || []).filter((g) => g.set_key === setKey);
    const groupCodes = setGroups.map((g) => g.code);
    const expectedCodes = ['A', 'B', 'C', 'D', 'E', 'F'];
    if (JSON.stringify(groupCodes) !== JSON.stringify(expectedCodes)) {
      throw new Error(`REFUSE_G1_INVALID_GROUP_CODES: set ${setKey} group codes must be A..F in order`);
    }
  }

  for (const group of manifest.groups || []) {
    const expectedGroupId = uuidV5(`p108:${group.set_key}:group:${group.code}`, G1_NAMESPACE);
    if (group.id !== expectedGroupId) {
      throw new Error(`REFUSE_G1_INVALID_UUID: group ${group.code} (${group.set_key}) id must be ${expectedGroupId}, got ${group.id}`);
    }

    if (!group.provenance || typeof group.provenance !== 'object') {
      throw new Error(`REFUSE_G1_MISSING_PROVENANCE: group ${group.code} missing provenance`);
    }
    if (!group.provenance.source_sheet || !group.provenance.source_row || !group.provenance.document_code) {
      throw new Error(`REFUSE_G1_MISSING_PROVENANCE: group ${group.code} missing required provenance keys`);
    }

    for (const criterion of group.criteria || []) {
      const expectedCritId = uuidV5(`p108:${criterion.set_key}:criterion:${criterion.code}`, G1_NAMESPACE);
      if (criterion.id !== expectedCritId) {
        throw new Error(`REFUSE_G1_INVALID_UUID: criterion ${criterion.code} (${criterion.set_key}) id must be ${expectedCritId}, got ${criterion.id}`);
      }
      if (criterion.default_level_index !== null) {
        throw new Error(`REFUSE_G1_DEFAULT_LEVEL_INDEX_NOT_NULL: criterion ${criterion.code} default_level_index must be null, got ${criterion.default_level_index}`);
      }
      if (criterion.weight !== 0) {
        throw new Error(`REFUSE_G1_INVALID_WEIGHT: criterion ${criterion.code} weight must be 0, got ${criterion.weight}`);
      }

      if (!criterion.provenance || typeof criterion.provenance !== 'object') {
        throw new Error(`REFUSE_G1_MISSING_PROVENANCE: criterion ${criterion.code} missing provenance`);
      }
      if (!criterion.provenance.source_sheet || !criterion.provenance.source_row) {
        throw new Error(`REFUSE_G1_MISSING_PROVENANCE: criterion ${criterion.code} missing required provenance keys`);
      }

      const levels = criterion.levels || [];
      for (let idx = 0; idx < levels.length; idx++) {
        const level = levels[idx];
        if (level.sort_order !== idx) {
          throw new Error(`REFUSE_G1_INVALID_SORT_ORDER: level on ${criterion.code} sort_order must be sequential starting at 0, got ${level.sort_order}`);
        }
        const expectedLevelId = uuidV5(`p108:${criterion.set_key}:level:${criterion.code}:${level.sort_order}`, G1_NAMESPACE);
        if (level.id !== expectedLevelId) {
          throw new Error(`REFUSE_G1_INVALID_UUID: level on ${criterion.code} sort_order ${level.sort_order} id must be ${expectedLevelId}, got ${level.id}`);
        }
        if (!Number.isInteger(level.points)) {
          throw new Error(`REFUSE_G1_NON_INTEGER_POINTS: level on ${criterion.code} points must be an integer, got ${level.points}`);
        }

        if (!level.provenance || typeof level.provenance !== 'object') {
          throw new Error(`REFUSE_G1_MISSING_PROVENANCE: level on ${criterion.code} sort_order ${level.sort_order} missing provenance`);
        }
        if (!level.provenance.source_sheet || !level.provenance.source_row) {
          throw new Error(`REFUSE_G1_MISSING_PROVENANCE: level on ${criterion.code} sort_order ${level.sort_order} missing required provenance keys`);
        }
        if (level.provenance.points_origin === 'WORKBOOK_CELL') {
          if (!level.provenance.points_cell || level.provenance.points_raw === undefined) {
            throw new Error(`REFUSE_G1_MISSING_PROVENANCE: level on ${criterion.code} sort_order ${level.sort_order} missing points_cell or points_raw`);
          }
        } else if (level.provenance.points_origin === 'G1_DECISION') {
          if (!level.provenance.decision_ref || !level.provenance.rule_id) {
            throw new Error(`REFUSE_G1_MISSING_PROVENANCE: level on ${criterion.code} sort_order ${level.sort_order} missing decision_ref or rule_id`);
          }
        } else {
          throw new Error(`REFUSE_G1_MISSING_PROVENANCE: level on ${criterion.code} sort_order ${level.sort_order} invalid points_origin: ${level.provenance.points_origin}`);
        }
      }
    }
  }

  const projected = projectCanonicalContent(manifest);
  const actualProjectedSha = crypto.createHash('sha256').update(JSON.stringify(projected)).digest('hex');
  if (actualProjectedSha !== G1_CANONICAL_CONTENT_SHA256) {
    throw new Error(`REFUSE_G1_CANONICAL_CONTENT_MISMATCH: canonical content projection digest ${actualProjectedSha} does not match pinned ${G1_CANONICAL_CONTENT_SHA256}`);
  }

  const actualPayloadSha = crypto.createHash('sha256').update(JSON.stringify({ groups: manifest.groups })).digest('hex');
  if (meta.payload_sha256 !== actualPayloadSha) {
    throw new Error('REFUSE_G1_PAYLOAD_SHA_MISMATCH: _metadata.payload_sha256 mismatch');
  }

  const actualSetHashes = computeAllSetHashes(buildPayload(manifest));
  if (JSON.stringify(meta.set_hashes) !== JSON.stringify(actualSetHashes) || JSON.stringify(actualSetHashes) !== JSON.stringify(G1_PINNED_SET_HASHES)) {
    throw new Error('REFUSE_G1_SET_HASHES_MISMATCH: _metadata.set_hashes mismatch');
  }

  const targetMaxima = { leader: 190, staff: 175, worker: 175 };
  for (const setKey of expectedSets) {
    const gList = (manifest.groups || []).filter((g) => g.set_key === setKey);
    let maxTotal = 0;
    for (const g of gList) {
      for (const c of g.criteria || []) {
        maxTotal += Math.max(...(c.levels || []).map((l) => l.points));
      }
    }
    if (maxTotal !== targetMaxima[setKey]) {
      throw new Error(`REFUSE_G1_MAXIMA_MISMATCH: calculated max for ${setKey} is ${maxTotal}, expected ${targetMaxima[setKey]}`);
    }
    if (!meta.maxima || meta.maxima[setKey] !== targetMaxima[setKey]) {
      throw new Error(`REFUSE_G1_METADATA_MAXIMA_MISMATCH: metadata.maxima for ${setKey} is ${meta.maxima?.[setKey]}, expected ${targetMaxima[setKey]}`);
    }
  }
}

export function buildPayload(manifest) {
  const groups = Array.isArray(manifest) ? manifest : (manifest.groups || []);
  return {
    groups: groups.map((g) => ({
      id: g.id,
      set_key: g.set_key,
      code: String(g.code).trim(),
      name: String(g.name).trim(),
      short_name: g.short_name ? String(g.short_name).trim() : null,
      sort_order: Number(g.sort_order),
      criteria: (g.criteria || []).map((c) => ({
        id: c.id,
        set_key: c.set_key,
        code: String(c.code).trim(),
        name: String(c.name).trim(),
        description: c.description ? String(c.description).trim() : null,
        weight: Number(c.weight ?? 0),
        default_level_index: (c.default_level_index !== undefined && c.default_level_index !== null) ? Number(c.default_level_index) : null,
        sort_order: Number(c.sort_order),
        levels: (c.levels || []).map((l) => ({
          id: l.id,
          points: Number(l.points),
          label: String(l.label).trim(),
          description: l.description ? String(l.description).trim() : null,
          sort_order: Number(l.sort_order),
        })),
      })),
    })),
  };
}

function exitJson(obj, code = 0) {
  console.log(JSON.stringify(obj, null, 2));
  process.exit(code);
}

function exitFail(codeString, message, extra = {}) {
  const redactedMessage = redact(message);
  exitJson({
    success: false,
    code: codeString,
    error: redactedMessage,
    ...extra,
  }, 1);
}

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (err) {
    return exitFail('INVALID_ARGUMENTS', err.message);
  }

  if (options.help || !options.mode) {
    console.log(`Usage: node p108-import-criteria.mjs <--dry-run | --apply | --verify> [options]

Modes:
  --dry-run                 Build payload & per-set canonical hashes (no network write)
  --apply                   Apply payload via save_criteria_config RPC
  --verify                  Read back active configuration via get_active_criteria_config RPC

Options:
  --manifest, -m <path>     Path to criteria manifest JSON file
  --expected-version <N>    Expected criteria version number (required for --apply)
  --signed-sha <hash>       Expected SHA-256 digest of manifest (required for non-disposable targets)
  --disposable              Declare target is a disposable database (waives --signed-sha on loopback)
  --supabase-url <url>      Override Supabase URL
  --help, -h                Show this help message
`);
    process.exit(options.help ? 0 : 1);
  }

  // Handle manifest reading if needed
  let rawManifest = null;
  let manifest = null;
  let manifestSha = null;
  let payload = null;
  let isSynthetic = false;

  if (options.mode === 'dry-run' || options.mode === 'apply' || (options.mode === 'verify' && options.manifestPath)) {
    if (!options.manifestPath) {
      return exitFail('MISSING_MANIFEST_PATH', `Mode --${options.mode} requires manifest path`);
    }

    const resolvedPath = path.resolve(options.manifestPath);
    if (!fs.existsSync(resolvedPath)) {
      return exitFail('MANIFEST_NOT_FOUND', `Manifest file not found: ${options.manifestPath}`);
    }

    try {
      rawManifest = fs.readFileSync(resolvedPath);
      manifestSha = crypto.createHash('sha256').update(rawManifest).digest('hex');
      manifest = JSON.parse(rawManifest.toString('utf8'));
    } catch (err) {
      return exitFail('MANIFEST_PARSE_ERROR', `Failed to read/parse manifest: ${err.message}`);
    }

    // Refusal: any group/criterion/level node without a UUID id
    try {
      validateManifestNodes(manifest);
    } catch (err) {
      const match = err.message.match(/^(REFUSE_[A-Z0-9_]+):/);
      return exitFail(match ? match[1] : 'REFUSE_MANIFEST_VALIDATION', err.message);
    }

    isSynthetic = SYNTHETIC_FIXTURE_SHA256_ALLOWLIST.includes(manifestSha.toLowerCase()) &&
      manifest._metadata?.uuid_namespace !== G1_NAMESPACE;
    if (!isSynthetic) {
      try {
        validateG1Manifest(manifest);
      } catch (err) {
        const match = err.message.match(/^(REFUSE_G1_[A-Z0-9_]+):/);
        return exitFail(match ? match[1] : 'REFUSE_G1_VALIDATION', err.message);
      }
    }

    payload = buildPayload(manifest);
  }

  // DRY-RUN mode (pure, no network write)
  if (options.mode === 'dry-run') {
    const counts = getCounts(payload);
    const hashes = computeAllSetHashes(payload);

    return exitJson({
      success: true,
      mode: 'dry-run',
      manifest_path: options.manifestPath,
      manifest_sha256: manifestSha,
      counts: {
        leader: counts.leader,
        staff: counts.staff,
        worker: counts.worker,
      },
      total_groups: counts.total_groups,
      total_criteria: counts.total_criteria,
      hashes,
    }, 0);
  }

  // Pre-network validation for apply mode
  if (options.mode === 'apply') {
    if (
      options.expectedVersion === null ||
      options.expectedVersion === undefined ||
      !Number.isSafeInteger(options.expectedVersion) ||
      options.expectedVersion < 0
    ) {
      return exitFail('REFUSE_MISSING_EXPECTED_VERSION', '--apply requires a valid non-negative integer --expected-version N');
    }
  }

  // Network modes: Apply & Verify
  const env = loadEnv();
  const supabaseUrl = options.supabaseUrl || env.KURABE_SUPABASE_URL || env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.KURABE_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return exitFail('MISSING_ENV_CREDENTIALS', 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured');
  }

  let urlHostname = null;
  try {
    const parsedUrl = new URL(supabaseUrl);
    urlHostname = parsedUrl.hostname;
  } catch {
    return exitFail('INVALID_SUPABASE_URL', 'Configured Supabase URL cannot be parsed');
  }

  const isDeclaredDisposable = Boolean(options.disposable && isLoopbackHost(urlHostname));

  // APPLY mode
  if (options.mode === 'apply') {
    // Refusal: manifest SHA-256 != --signed-sha unless the target is an explicitly declared disposable target
    if (!isDeclaredDisposable) {
      if (options.signedSha && manifestSha.toLowerCase() !== options.signedSha.toLowerCase()) {
        return exitFail('REFUSE_SIGNED_SHA_MISMATCH', `Manifest SHA-256 (${manifestSha}) does not match --signed-sha (${options.signedSha})`);
      }
      if (isSynthetic) {
        return exitFail('REFUSE_SYNTHETIC_NON_DISPOSABLE', 'A synthetic manifest cannot be applied to a non-disposable target');
      }
      if (!options.signedSha) {
        return exitFail('REFUSE_NON_DISPOSABLE_MISSING_SIGNED_SHA', 'Non-disposable target requires --signed-sha argument matching the manifest SHA-256');
      }
    }

    let client;
    try {
      client = await createSupabaseServiceClient(supabaseUrl, serviceRoleKey);
    } catch (clientErr) {
      return exitFail('CLIENT_INIT_ERROR', clientErr.message);
    }

    let rpcResult;
    try {
      rpcResult = await client.rpc('save_criteria_config', {
        p_config: payload,
        p_expected_version: options.expectedVersion,
      });
    } catch (networkErr) {
      return exitFail('NETWORK_ERROR', networkErr.message);
    }

    if (rpcResult.error) {
      const err = rpcResult.error;
      const msg = err.message || JSON.stringify(err);
      let errorCode = 'RPC_ERROR';
      if (msg.includes('P108_PERIOD_ACTIVE')) {
        errorCode = 'P108_PERIOD_ACTIVE';
      } else if (msg.includes('P99M3T02_CONFIG_STALE')) {
        errorCode = 'P99M3T02_CONFIG_STALE';
      } else if (msg.includes('P99M3T02_INVALID_CONFIG')) {
        errorCode = 'P99M3T02_INVALID_CONFIG';
      }
      return exitFail(errorCode, msg, { details: redact(err.details || '') });
    }

    const savedConfig = rpcResult.data;
    if (!savedConfig || typeof savedConfig !== 'object') {
      return exitFail('RPC_INVALID_RESPONSE', 'save_criteria_config returned invalid data');
    }

    const counts = getCounts(savedConfig);
    const hashes = computeAllSetHashes(savedConfig);

    return exitJson({
      success: true,
      mode: 'apply',
      version: savedConfig.version,
      version_id: savedConfig.version_id,
      checksum: savedConfig.checksum,
      group_count: savedConfig.group_count,
      criterion_count: savedConfig.criterion_count,
      level_count: savedConfig.level_count,
      audience_count: savedConfig.audience_count,
      counts: {
        leader: counts.leader,
        staff: counts.staff,
        worker: counts.worker,
      },
      total_groups: counts.total_groups,
      total_criteria: counts.total_criteria,
      hashes,
    }, 0);
  }

  // VERIFY mode
  if (options.mode === 'verify') {
    let client;
    try {
      client = await createSupabaseServiceClient(supabaseUrl, serviceRoleKey);
    } catch (clientErr) {
      return exitFail('CLIENT_INIT_ERROR', clientErr.message);
    }

    let rpcResult;
    try {
      rpcResult = await client.rpc('get_active_criteria_config');
    } catch (networkErr) {
      return exitFail('NETWORK_ERROR', networkErr.message);
    }

    if (rpcResult.error) {
      const err = rpcResult.error;
      return exitFail('RPC_ERROR', err.message || JSON.stringify(err));
    }

    const activeConfig = rpcResult.data;
    if (!activeConfig || typeof activeConfig !== 'object') {
      return exitFail('RPC_INVALID_RESPONSE', 'get_active_criteria_config returned invalid data');
    }

    // Verify audience mappings
    const audienceMapping = {
      leader: 'management',
      staff: 'employee',
      worker: 'worker',
    };

    const criteriaAudienceViolations = [];
    for (const group of activeConfig.groups || []) {
      for (const criterion of group.criteria || []) {
        const expectedAudience = audienceMapping[criterion.set_key];
        const audiences = criterion.audiences || [];
        if (audiences.length !== 1 || audiences[0] !== expectedAudience) {
          criteriaAudienceViolations.push({
            id: criterion.id,
            code: criterion.code,
            set_key: criterion.set_key,
            audiences,
            expected: expectedAudience,
          });
        }
      }
    }

    if (criteriaAudienceViolations.length > 0) {
      return exitFail('AUDIENCE_MAPPING_VIOLATION', 'Criteria audience mappings do not match set rules', {
        violations: criteriaAudienceViolations,
      });
    }

    const counts = getCounts(activeConfig);
    const hashes = computeAllSetHashes(activeConfig);

    // If manifest was provided, verify hash equality with manifest
    if (payload) {
      const manifestHashes = computeAllSetHashes(payload);
      const hashMismatches = [];
      for (const setKey of ['leader', 'staff', 'worker']) {
        if (hashes[setKey] !== manifestHashes[setKey]) {
          hashMismatches.push({
            set_key: setKey,
            readback_hash: hashes[setKey],
            manifest_hash: manifestHashes[setKey],
          });
        }
      }

      if (hashMismatches.length > 0) {
        return exitFail('HASH_MISMATCH_WITH_MANIFEST', 'Readback canonical hashes differ from manifest hashes', {
          mismatches: hashMismatches,
        });
      }
    }

    return exitJson({
      success: true,
      mode: 'verify',
      version: activeConfig.version,
      version_id: activeConfig.version_id,
      checksum: activeConfig.checksum,
      group_count: activeConfig.group_count,
      criterion_count: activeConfig.criterion_count,
      level_count: activeConfig.level_count,
      audience_count: activeConfig.audience_count,
      counts: {
        leader: counts.leader,
        staff: counts.staff,
        worker: counts.worker,
      },
      total_groups: counts.total_groups,
      total_criteria: counts.total_criteria,
      audiences_verified: true,
      hashes,
    }, 0);
  }

  return exitFail('UNKNOWN_MODE', `Unhandled mode: ${options.mode}`);
}

// Execute if run as entry point
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main().catch((err) => {
    exitFail('UNCAUGHT_EXCEPTION', err.message);
  });
}
