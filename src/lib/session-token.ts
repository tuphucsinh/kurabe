/**
 * Opaque session token validation.
 * Contract: Session tokens must be exactly 64 hexadecimal characters (SHA-256 hex string).
 */

const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

/**
 * Validates whether the given value is a valid opaque session token.
 * Exact 64 hexadecimal characters, case-insensitive, no trimming.
 */
export function isOpaqueSessionToken(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }
  return HEX_64_REGEX.test(value);
}
