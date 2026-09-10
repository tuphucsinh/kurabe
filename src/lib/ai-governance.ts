/**
 * AI Governance Boundary (src/lib/ai-governance.ts).
 * Pure, server-safe utilities and constants for input bounding, secret redaction,
 * history sanitization, action normalization, provider validation, payload governance,
 * coverage metadata, and prompt-injection detection.
 *
 * Invariant: Must import no React, Next, Supabase, fs, network, or env at module load.
 *
 * Provider transport contract (AI_PROVIDER_CONTRACT):
 * - Configured provider must be explicitly allowed.
 * - Fail closed for: malformed URL, credentials/query/hash in URL, unsupported protocol,
 *   disallowed host.
 * - HTTP (insecure) is only permitted when:
 *   (a) an explicit bounded development exception flag is passed (devExceptionAllowed=true), AND
 *   (b) the hostname resolves to a recognized loopback/private/local development target
 *       (localhost, 127.x.x.x, ::1, 0.0.0.0, or RFC 1918 private range).
 * - Empty allowlist + HTTPS permits only the built-in api.openai.com endpoint.
 * - Custom HTTPS providers require an exact AI_ALLOWED_HOSTS entry.
 * - Empty allowlist + HTTP without dev exception = REJECT (fail closed).
 */

export const MAX_AI_PROMPT_CHARS = 12000;
export const MAX_AI_SYSTEM_CHARS = 8000;
export const MAX_AI_HISTORY_ITEMS = 12;
export const MAX_AI_HISTORY_ITEM_CHARS = 800;
export const MAX_AI_IMAGE_BASE64_CHARS = 921600; // ~900KB base64 cap
export const MAX_AI_REPORT_HISTORY_CHARS = 8000;
export const DEFAULT_AI_ALLOWED_HOSTS = ['api.openai.com'] as const;

/** Maximum characters allowed in a single AI payload (system + prompt combined). */
export const MAX_AI_TOTAL_PAYLOAD_CHARS = MAX_AI_PROMPT_CHARS + MAX_AI_SYSTEM_CHARS;

/**
 * Per-field caps for server-side validation/bounding of client-provided HR
 * fields before they reach an AI payload (P100M1T02). Free-text fields are
 * bounded deterministically and secrets are redacted via boundAIText; numeric
 * fields are range-checked; arrays are capped by item count.
 */
export const MAX_AI_EMPLOYEE_CODE_CHARS = 24;
export const MAX_AI_NAME_CHARS = 120;
export const MAX_AI_ROLE_CHARS = 60;
export const MAX_AI_GRADE_CHARS = 8;
export const MAX_AI_CRITERIA_ITEMS = 64;
export const MAX_AI_CRITERIA_FIELD_CHARS = 200;
export const MAX_AI_PREVIOUS_COMMENTS_ITEMS = 20;
export const MAX_AI_COMMENT_CHARS = 500;
export const MAX_AI_NOTE_CHARS = 1500;
export const MAX_AI_PERIOD_NAME_CHARS = 80;
export const MAX_AI_QUESTION_CHARS = 1000;
/** Sanity ceiling for a QAQC evaluation total score (real bands are far lower). */
export const MAX_AI_RESULT_SCORE = 1000;

export interface AIHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface AIProviderValidationResult {
  allowed: boolean;
  hostname: string | null;
  reason?: string;
}

/**
 * Coverage metadata for a bounded AI payload.
 * Callers MUST NOT claim complete coverage when truncated=true or droppedItems > 0.
 */
export interface AIPayloadCoverage {
  /** True when the text was truncated to fit within maxChars. */
  truncated: boolean;
  /** Number of logical items (rows, history entries) dropped due to bounds. */
  droppedItems: number;
  /** Total logical items before bounding. */
  totalItems: number;
  /** Items actually included in the bounded payload. */
  fittedItems: number;
  /** Human-readable label for UI disclosure. */
  coverageLabel: string;
}

/**
 * Result of boundAITextWithMeta — carries the bounded text AND coverage metadata.
 * Use coverageMeta.truncated to decide UI disclosure label.
 */
export interface BoundedAITextResult {
  text: string;
  coverageMeta: AIPayloadCoverage;
}

const REDACTED_MARKER = '[REDACTED]';

// Regex patterns for credential-like values
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/gi;
const BASIC_AUTH_REGEX = /Basic\s+[A-Za-z0-9+/=]{10,}/gi;
const STANDALONE_TOKEN_REGEX = /\b(?:sk-[A-Za-z0-9_\-]{20,}|sbp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})\b/g;
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g;
const KEY_VALUE_SECRET_REGEX = /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret(?:[_-]?key)?|client[_-]?secret|password|passwd|pwd|cookie|session[_-]?token|private[_-]?key)\b\s*[:=]\s*(?:'|")?)([^\s"';,\n\r}]+)((?:'|")?)/gi;

/**
 * Prompt-injection / control-instruction detection patterns.
 * Matches common attempts to override AI system instructions.
 * Does NOT match ordinary Vietnamese text or employee codes.
 */
const PROMPT_INJECTION_PATTERNS: RegExp[] = [
  // Imperative override instructions
  /\bignore\s+(all\s+)?(?:previous|above|prior|system)\s+instructions?\b/i,
  /\bdisregard\s+(all\s+)?(?:previous|above|prior|system)\s+instructions?\b/i,
  /\bforget\s+(all\s+)?(?:your\s+)?(?:previous|above|prior|system)\s+instructions?\b/i,
  // Role-override attempts
  /\byou\s+are\s+now\s+(?:a|an|the)\s+\w/i,
  /\bact\s+as\s+(?:a|an|the)\s+\w/i,
  /\bpretend\s+(?:you\s+are|to\s+be)\b/i,
  // Jailbreak markers
  /\bDAN\b.*\bdo\s+anything\s+now\b/i,
  /\bjailbreak\b/i,
  // Injection via delimiter mimicry
  /^-{3,}\s*SYSTEM\s*-{3,}/im,
  /^\[INST\]/im,
  /^<\|(?:im_start|system|user)\|>/im,
];

/**
 * Returns true when prompt text appears to contain injection/control-override content.
 * Does NOT throw — callers decide policy (reject, log, or redact).
 */
export function detectPromptInjection(text: string | null | undefined): boolean {
  if (typeof text !== 'string' || !text) return false;
  return PROMPT_INJECTION_PATTERNS.some((p) => p.test(text));
}

/**
 * Redacts credential-like values without changing ordinary Vietnamese names,
 * scores, or employee codes.
 */
export function redactAISecrets(text: string | null | undefined): string {
  if (typeof text !== 'string' || !text) {
    return '';
  }

  let result = text;
  result = result.replace(BEARER_REGEX, `Bearer ${REDACTED_MARKER}`);
  result = result.replace(BASIC_AUTH_REGEX, `Basic ${REDACTED_MARKER}`);
  result = result.replace(STANDALONE_TOKEN_REGEX, REDACTED_MARKER);
  result = result.replace(JWT_TOKEN_REGEX, REDACTED_MARKER);
  result = result.replace(KEY_VALUE_SECRET_REGEX, (_match, p1, _p2, p3) => `${p1}${REDACTED_MARKER}${p3}`);

  return result;
}

/**
 * Trims non-printable control characters (keeping \t, \n, \r), redacts secrets,
 * and bounds output deterministically. Does not throw on nullish input.
 *
 * IMPORTANT: This function silently truncates. When tracking coverage is required,
 * use boundAITextWithMeta() which returns a BoundedAITextResult with coverage metadata.
 * Callers MUST NOT claim complete coverage after a bound drops data.
 */
export function boundAIText(text: string | null | undefined, maxChars: number): string {
  if (typeof text !== 'string' || !text || maxChars <= 0) {
    return '';
  }

  // Strip non-printable control characters (\x00-\x08, \x0B, \x0C, \x0E-\x1F, \x7F)
  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const redacted = redactAISecrets(cleaned);

  if (redacted.length <= maxChars) {
    return redacted;
  }
  return redacted.slice(0, maxChars);
}

/**
 * Variant of boundAIText that returns the bounded text WITH explicit coverage metadata.
 * Use this in any path where the caller must decide whether to disclose partial/truncated status.
 */
export function boundAITextWithMeta(
  text: string | null | undefined,
  maxChars: number,
  itemLabel = 'characters'
): BoundedAITextResult {
  if (typeof text !== 'string' || !text || maxChars <= 0) {
    return {
      text: '',
      coverageMeta: {
        truncated: false,
        droppedItems: 0,
        totalItems: 0,
        fittedItems: 0,
        coverageLabel: 'empty',
      },
    };
  }

  const cleaned = text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  const redacted = redactAISecrets(cleaned);
  const total = redacted.length;

  if (total <= maxChars) {
    return {
      text: redacted,
      coverageMeta: {
        truncated: false,
        droppedItems: 0,
        totalItems: total,
        fittedItems: total,
        coverageLabel: `complete (${total} ${itemLabel})`,
      },
    };
  }

  return {
    text: redacted.slice(0, maxChars),
    coverageMeta: {
      truncated: true,
      droppedItems: total - maxChars,
      totalItems: total,
      fittedItems: maxChars,
      coverageLabel: `partial — ${maxChars} of ${total} ${itemLabel} included`,
    },
  };
}

function sanitizeSerializableAIValue(value: unknown): unknown {
  if (typeof value === 'string') return redactAISecrets(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (Array.isArray(value)) return value.map((item) => sanitizeSerializableAIValue(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeSerializableAIValue(item)]));
  }
  return value;
}

/**
 * Build a bounded AI payload from a list of serializable items (rows).
 * Items are deterministically fitted within maxChars one-by-one.
 * Returns the JSON string AND explicit coverage metadata.
 * The caller MUST NOT report complete coverage when coverageMeta.droppedItems > 0.
 */
export function buildAIPayload<T>(
  prefix: string,
  rows: T[],
  maxChars: number
): { payload: string; coverageMeta: AIPayloadCoverage } {
  const totalItems = rows.length;
  const safePrefix = sanitizeSerializableAIValue(prefix) as string;
  if (safePrefix.length >= maxChars) {
    return {
      payload: safePrefix.slice(0, Math.max(0, maxChars)),
      coverageMeta: {
        truncated: true,
        droppedItems: totalItems,
        totalItems,
        fittedItems: 0,
        coverageLabel: `partial — prompt prefix exceeded ${maxChars} characters; no records included`,
      },
    };
  }
  const safeRows = rows.map((row) => sanitizeSerializableAIValue(row) as T);
  const fittedRows: T[] = [];

  for (const row of safeRows) {
    const candidate = [...fittedRows, row];
    const candidateJson = JSON.stringify(candidate, null, 1);
    const fullPayload = `${safePrefix}${candidateJson}`;
    if (fullPayload.length <= maxChars) {
      fittedRows.push(row);
    } else {
      break;
    }
  }

  const fittedItems = fittedRows.length;
  const droppedItems = totalItems - fittedItems;
  const payload = `${safePrefix}${JSON.stringify(fittedRows, null, 1)}`;

  const coverageMeta: AIPayloadCoverage = {
    truncated: droppedItems > 0,
    droppedItems,
    totalItems,
    fittedItems,
    coverageLabel:
      droppedItems > 0
        ? `partial — ${fittedItems}/${totalItems} records included (${droppedItems} dropped due to payload bound)`
        : `complete — ${fittedItems}/${totalItems} records`,
  };

  return { payload, coverageMeta };
}

/**
 * Accepts only user/assistant roles, bounds history to latest 12 items,
 * sanitizes each text to 800 chars, and returns a typed history array.
 */
export function sanitizeAIHistory(history: unknown): AIHistoryMessage[] {
  if (!Array.isArray(history)) {
    return [];
  }

  const validItems: AIHistoryMessage[] = [];
  for (const item of history) {
    if (!item || typeof item !== 'object') continue;
    const role = (item as { role?: unknown }).role;
    const text = (item as { text?: unknown }).text;

    if (role !== 'user' && role !== 'assistant') continue;
    if (typeof text !== 'string') continue;

    const sanitizedText = boundAIText(text, MAX_AI_HISTORY_ITEM_CHARS);
    if (!sanitizedText.trim()) continue;

    validItems.push({
      role,
      text: sanitizedText,
    });
  }

  return validItems.slice(-MAX_AI_HISTORY_ITEMS);
}

/**
 * Normalizes AI action to a bounded allowlisted-safe identifier (letters/numbers/_/-, max 64 chars).
 * Falls back to 'unknown' for invalid/overlong input.
 */
export function normalizeAIAction(action: unknown): string {
  if (typeof action !== 'string') {
    return 'unknown';
  }

  const trimmed = action.trim();
  if (!trimmed || trimmed.length > 64) {
    return 'unknown';
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return 'unknown';
  }

  return trimmed;
}

/**
 * Returns a stable pseudonym for use in AI prompts where identity is not required.
 * Format: employeeCode when available and well-formed; else "NV-<first 8 chars of ID>".
 * Use when the prompt only needs to reference a person for aggregation/comparison,
 * not for personalized output (where firstName is required for tone).
 */
export function toAIPseudonym(id: string, employeeCode?: string | null): string {
  if (employeeCode && /^[A-Za-z0-9_\-]{2,20}$/.test(employeeCode.trim())) {
    return employeeCode.trim();
  }
  if (typeof id === 'string' && id.length >= 8) {
    return `NV-${id.slice(0, 8)}`;
  }
  return 'NV-unknown';
}

/**
 * Recognized loopback and private development network hostname patterns.
 * Used by validateAIProvider to gate HTTP dev exceptions.
 */
function isApprovedLocalDevHost(hostname: string): boolean {
  if (!hostname) return false;
  // IPv6 literal hostnames arrive bracketed ([::1]) — normalize before matching.
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '::1' || h === '0.0.0.0') return true;
  // 127.x.x.x loopback range
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  // RFC 1918 private ranges
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  return false;
}

/**
 * Validates AI Provider base URL against the strict AI_PROVIDER_CONTRACT.
 * - Protocol: must be http: or https:
 * - HTTP is only permitted when devExceptionAllowed=true AND hostname is an approved
 *   loopback/private development target. Fail closed otherwise.
 * - Malformed URL, credentials in URL, query params, hash fragment → rejected.
 * - Host allowlist: when provided and non-empty, hostname must exactly match.
 * - Empty allowlist + HTTPS permits only api.openai.com.
 * - HTTP is never allowed outside the bounded local development exception.
 *
 * @param devExceptionAllowed Pass true only when AI_HTTP_DEV_EXCEPTION=true in server env.
 */
export function validateAIProvider(
  baseUrl: unknown,
  allowedHosts?: string | null,
  devExceptionAllowed?: boolean
): AIProviderValidationResult {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return { allowed: false, hostname: null, reason: 'invalid_url' };
  }

  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    return { allowed: false, hostname: null, reason: 'malformed_url' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { allowed: false, hostname: null, reason: 'unsupported_protocol' };
  }

  if (parsed.username || parsed.password) {
    return { allowed: false, hostname: null, reason: 'credentials_in_url' };
  }

  if (parsed.search || parsed.hash) {
    return { allowed: false, hostname: null, reason: 'query_or_hash_not_permitted' };
  }

  // Normalize: lowercase, and strip IPv6 bracket delimiters ([::1]) so hostname
  // comparison and dev-host matching agree between URL parsing and allowlist entries.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!hostname) {
    return { allowed: false, hostname: null, reason: 'missing_hostname' };
  }

  // HTTP transport policy: fail closed unless bounded dev exception applies.
  if (parsed.protocol === 'http:') {
    if (!devExceptionAllowed || !isApprovedLocalDevHost(hostname)) {
      return {
        allowed: false,
        hostname,
        reason: 'http_not_permitted_without_dev_exception',
      };
    }
    // Dev exception granted: HTTP to local/loopback target.
  }

  if (parsed.protocol === 'http:' && devExceptionAllowed) {
    return { allowed: true, hostname };
  }

  const allowedList = allowedHosts && typeof allowedHosts === 'string' && allowedHosts.trim()
    ? allowedHosts
        .split(',')
        .map((h) => h.trim().toLowerCase().replace(/^\[|\]$/g, ''))
        .filter(Boolean)
    : [...DEFAULT_AI_ALLOWED_HOSTS];

  if (!allowedList.includes(hostname)) {
    return { allowed: false, hostname, reason: 'host_not_allowed' };
  }

  return { allowed: true, hostname };
}
