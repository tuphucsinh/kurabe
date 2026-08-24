/**
 * Content Security Policy (CSP) header generator.
 */

export interface ContentSecurityPolicyOptions {
  supabaseUrl?: string;
  production?: boolean;
}

function getConnectOrigins(supabaseUrl?: string): string[] {
  if (!supabaseUrl || typeof supabaseUrl !== 'string') {
    return ["'self'"];
  }

  // Reject newlines, carriage returns, or whitespace
  if (/[\r\n\s]/.test(supabaseUrl)) {
    return ["'self'"];
  }

  try {
    const url = new URL(supabaseUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ["'self'"];
    }

    if (!url.hostname || url.hostname.includes('*') || url.hostname.includes(' ')) {
      return ["'self'"];
    }

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
  const connectOrigins = getConnectOrigins(options.supabaseUrl);

  const scriptSrc = isProd
    ? ["'self'"]
    : ["'self'", "'unsafe-inline'", "'unsafe-eval'"];

  const directives: string[] = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
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
