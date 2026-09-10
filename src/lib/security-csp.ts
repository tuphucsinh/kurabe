/**
 * Content Security Policy (CSP) header generator.
 */

export interface ContentSecurityPolicyOptions {
  supabaseUrl?: string;
  production?: boolean;
  nonce?: string;
}

const SAFE_NONCE = /^[A-Za-z0-9+/_-]{16,128}$/;

function isValidOctet(value: string): boolean {
  return /^(?:0|[1-9]\d{0,2})$/.test(value) && Number(value) <= 255;
}

function isApprovedLocalDevHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host === '::1' || host === '0.0.0.0') return true;

  const octets = host.split('.');
  if (octets.length !== 4 || !octets.every(isValidOctet)) return false;
  const [first, second] = octets.map(Number);
  return first === 127 || first === 10 || (first === 192 && second === 168) ||
    (first === 172 && second >= 16 && second <= 31);
}

function getConnectOrigins(supabaseUrl: string | undefined, production: boolean): string[] {
  if (!supabaseUrl || typeof supabaseUrl !== 'string') {
    return ["'self'"];
  }

  // Reject control characters, whitespace, and non-origin URL components before parsing.
  if (/[\u0000-\u001f\u007f\s?#]/.test(supabaseUrl)) {
    return ["'self'"];
  }

  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ["'self'"];
    }

    if (
      !url.hostname ||
      url.hostname.includes('*') ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      return ["'self'"];
    }

    if (production && url.protocol !== 'https:') return ["'self'"];
    if (url.protocol === 'http:' && !isApprovedLocalDevHost(url.hostname)) return ["'self'"];

    const origin = url.origin;
    if (!origin || origin === 'null' || origin.includes('*')) {
      return ["'self'"];
    }

    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsOrigin = `${wsProtocol}//${url.host}`;

    return ["'self'", origin, wsOrigin];
  } catch {
    return ["'self'"];
  }
}

/**
 * Builds Content-Security-Policy header string.
 */
export function buildContentSecurityPolicy(options: ContentSecurityPolicyOptions = {}): string {
  const isProd = options.production === true;
  const connectOrigins = getConnectOrigins(options.supabaseUrl, isProd);
  const nonce = typeof options.nonce === 'string' && SAFE_NONCE.test(options.nonce)
    ? options.nonce
    : undefined;
  const nonceSource = nonce ? `'nonce-${nonce}'` : undefined;

  const scriptSrc = isProd
    ? ["'self'", ...(nonceSource ? [nonceSource, "'strict-dynamic'"] : [])]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'", ...(nonceSource ? [nonceSource] : [])];
  const styleSrc = ["'self'", "'unsafe-inline'", ...(nonceSource ? [nonceSource] : [])];

  const directives: string[] = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    `connect-src ${connectOrigins.join(' ')}`,
  ];

  if (isProd) {
    directives.push("upgrade-insecure-requests");
  }

  return directives.join('; ');
}
