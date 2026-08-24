import { strict as assert } from 'node:assert';
import { buildContentSecurityPolicy } from '../src/lib/security-csp';

/**
 * Test-first contract for buildContentSecurityPolicy (#P1M2T01).
 * Chạy: npx tsc --module commonjs --target es2020 --esModuleInterop --strict \
 *          --outDir .tmp/testbuild tests/security-csp.test.ts \
 *        && node .tmp/testbuild/tests/security-csp.test.js
 */

// Helper to parse directive map from CSP string
function parseCspDirectives(csp: string): Map<string, string[]> {
  assert.equal(csp.includes('\n'), false, 'CSP output must be a single line (no newlines)');
  assert.equal(csp.includes('\r'), false, 'CSP output must not contain carriage returns');

  const directiveMap = new Map<string, string[]>();
  const tokens = csp.split(';').map(t => t.trim()).filter(Boolean);

  for (const token of tokens) {
    const parts = token.split(/\s+/);
    const directiveName = parts[0];
    const directiveValues = parts.slice(1);
    directiveMap.set(directiveName, directiveValues);
  }
  return directiveMap;
}

// 1. Production Mode Policy
{
  const cspProd = buildContentSecurityPolicy({
    supabaseUrl: 'https://example.supabase.co',
    production: true,
  });

  const dirs = parseCspDirectives(cspProd);

  // Core restrictive defaults
  assert.deepEqual(dirs.get('default-src'), ["'self'"], "default-src must be 'self'");
  assert.deepEqual(dirs.get('base-uri'), ["'self'"], "base-uri must be 'self'");
  assert.deepEqual(dirs.get('object-src'), ["'none'"], "object-src must be 'none'");
  assert.deepEqual(dirs.get('frame-ancestors'), ["'none'"], "frame-ancestors must be 'none'");
  assert.deepEqual(dirs.get('form-action'), ["'self'"], "form-action must be 'self'");

  // Production script-src: strictly 'self', NO unsafe-inline or unsafe-eval
  assert.deepEqual(dirs.get('script-src'), ["'self'"], "production script-src must strictly be 'self'");

  // Styles, assets, fonts, workers, manifests
  assert.deepEqual(dirs.get('style-src'), ["'self'", "'unsafe-inline'"], "style-src must allow 'self' 'unsafe-inline'");
  assert.deepEqual(dirs.get('img-src'), ["'self'", 'data:', 'blob:'], "img-src must allow 'self' data: blob:");
  assert.deepEqual(dirs.get('font-src'), ["'self'", 'data:'], "font-src must allow 'self' data:");
  assert.deepEqual(dirs.get('worker-src'), ["'self'", 'blob:'], "worker-src must allow 'self' blob:");
  assert.deepEqual(dirs.get('manifest-src'), ["'self'"], "manifest-src must be 'self'");

  // Supabase HTTPS + WSS origin in connect-src
  assert.deepEqual(
    dirs.get('connect-src'),
    ["'self'", 'https://example.supabase.co', 'wss://example.supabase.co'],
    'connect-src must contain self, https Supabase origin, and matching wss origin'
  );

  // Production must include upgrade-insecure-requests
  assert.equal(dirs.has('upgrade-insecure-requests'), true, 'production must include upgrade-insecure-requests');
}

// 2. Development Mode Policy (production = false / omitted)
{
  const cspDev = buildContentSecurityPolicy({
    supabaseUrl: 'http://localhost:54321',
    production: false,
  });

  const dirs = parseCspDirectives(cspDev);

  // Development script-src must allow unsafe-inline and unsafe-eval for dev tooling (e.g. Next.js HMR/eval)
  assert.deepEqual(
    dirs.get('script-src'),
    ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    "development script-src must allow 'self' 'unsafe-inline' 'unsafe-eval'"
  );

  // Local Supabase HTTP + WS origin
  assert.deepEqual(
    dirs.get('connect-src'),
    ["'self'", 'http://localhost:54321', 'ws://localhost:54321'],
    'connect-src must support local http and matching ws origins'
  );

  // Development must NOT enforce upgrade-insecure-requests (would break local http)
  assert.equal(dirs.has('upgrade-insecure-requests'), false, 'development must not include upgrade-insecure-requests');
}

// 3. Connect-src behavior without Supabase URL
{
  const cspNoUrl = buildContentSecurityPolicy({ production: false });
  const dirs = parseCspDirectives(cspNoUrl);
  assert.deepEqual(dirs.get('connect-src'), ["'self'"], "connect-src without supabaseUrl must be only 'self'");
}

// 4. URL Sanitization: trailing paths/query strings stripped to origin
{
  const cspWithPath = buildContentSecurityPolicy({
    supabaseUrl: 'https://project.supabase.co/rest/v1/users?select=*',
    production: false,
  });
  const dirs = parseCspDirectives(cspWithPath);
  assert.deepEqual(
    dirs.get('connect-src'),
    ["'self'", 'https://project.supabase.co', 'wss://project.supabase.co'],
    'connect-src must normalize URL to origin only (no subpaths or query strings)'
  );
}

// 5. URL Sanitization & Injection Prevention: Invalid URLs / Schemes / Newlines
{
  const invalidUrls = [
    'javascript:alert(1)',
    'data:text/html,test',
    'ftp://evil.com',
    'not-a-valid-url',
    'https://',
    '*',
    'https://*',
    'https://example.supabase.co\r\nInjected-Header: evil',
    'https://example.supabase.co\nscript-src evil.com',
  ];

  for (const badUrl of invalidUrls) {
    const csp = buildContentSecurityPolicy({ supabaseUrl: badUrl, production: false });
    const dirs = parseCspDirectives(csp);

    assert.equal(csp.includes('\n'), false, `CSP must never contain newline with input ${badUrl}`);
    assert.equal(csp.includes('\r'), false, `CSP must never contain CR with input ${badUrl}`);
    assert.equal(csp.includes('evil.com'), false, `CSP must not reflect injected payload from ${badUrl}`);
    assert.deepEqual(
      dirs.get('connect-src'),
      ["'self'"],
      `connect-src must safely fallback to 'self' for invalid URL: ${badUrl}`
    );
  }
}

// 6. Deterministic Output
{
  const opts = { supabaseUrl: 'https://test.supabase.co', production: true };
  const first = buildContentSecurityPolicy(opts);
  const second = buildContentSecurityPolicy(opts);
  assert.equal(first, second, 'buildContentSecurityPolicy must produce deterministic string output');
}

console.log('security-csp contract tests: ALL PASS');
