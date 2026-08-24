/**
 * AI Governance Boundary (src/lib/ai-governance.ts).
 * Pure, server-safe utilities and constants for input bounding, secret redaction,
 * history sanitization, action normalization, and provider validation.
 *
 * Invariant: Must import no React, Next, Supabase, fs, network, or env at module load.
 */

export const MAX_AI_PROMPT_CHARS = 12000;
export const MAX_AI_SYSTEM_CHARS = 8000;
export const MAX_AI_HISTORY_ITEMS = 12;
export const MAX_AI_HISTORY_ITEM_CHARS = 800;
export const MAX_AI_IMAGE_BASE64_CHARS = 921600; // ~900KB base64 cap
export const MAX_AI_REPORT_HISTORY_CHARS = 8000;

export interface AIHistoryMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface AIProviderValidationResult {
  allowed: boolean;
  hostname: string | null;
  reason?: string;
}

const REDACTED_MARKER = '[REDACTED]';

// Regex patterns for credential-like values
const BEARER_REGEX = /Bearer\s+[A-Za-z0-9_\-.~+/]+=*/gi;
const BASIC_AUTH_REGEX = /Basic\s+[A-Za-z0-9+/=]{10,}/gi;
const STANDALONE_TOKEN_REGEX = /\b(?:sk-[A-Za-z0-9_\-]{20,}|sbp_[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,})\b/g;
const JWT_TOKEN_REGEX = /\beyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\b/g;
const KEY_VALUE_SECRET_REGEX = /(\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|auth[_-]?token|secret(?:[_-]?key)?|client[_-]?secret|password|passwd|pwd|cookie|session[_-]?token|private[_-]?key)\b\s*[:=]\s*(?:'|")?)([^\s"';,\n\r}]+)((?:'|")?)/gi;

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
 * Validates AI Provider base URL against protocol, malformed structure, credentials,
 * query/hash parameters, and optional exact host allowlist.
 */
export function validateAIProvider(
  baseUrl: unknown,
  allowedHosts?: string | null
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

  const hostname = parsed.hostname.toLowerCase();
  if (!hostname) {
    return { allowed: false, hostname: null, reason: 'missing_hostname' };
  }

  if (allowedHosts && typeof allowedHosts === 'string' && allowedHosts.trim()) {
    const allowedList = allowedHosts
      .split(',')
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean);

    if (allowedList.length > 0 && !allowedList.includes(hostname)) {
      return { allowed: false, hostname, reason: 'host_not_allowed' };
    }
  }

  return { allowed: true, hostname };
}
