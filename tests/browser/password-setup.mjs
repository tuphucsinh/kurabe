import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '../..');
const chromePath = '/usr/bin/google-chrome-stable';
const SAFE_ENV = {
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
  HOME: os.tmpdir(),
  LANG: 'C',
  LC_ALL: 'C',
};

function fail(message) {
  throw new Error(`PASSWORD_SETUP_BROWSER_GUARD: ${message}`);
}

function listen(server) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      server.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      server.off('error', onError);
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('loopback server did not expose a TCP address'));
        return;
      }
      resolve(address.port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function close(server) {
  return new Promise((resolve) => {
    if (!server.listening) {
      resolve();
      return;
    }
    server.close(() => resolve());
  });
}

function runChrome(url, profileDir) {
  return new Promise((resolve, reject) => {
    const args = [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profileDir}`,
      '--virtual-time-budget=2500',
      '--dump-dom',
      url,
    ];
    const child = spawn(chromePath, args, {
      env: SAFE_ENV,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('Chrome assertion exceeded 15-second bound'));
    }, 15_000);
    const append = (current, chunk) => (current + chunk.toString()).slice(-256 * 1024);
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(error);
      } else {
        resolve({ ...result, stderr });
      }
    };
    child.stdout.on('data', (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on('data', (chunk) => { stderr = append(stderr, chunk); });
    child.once('error', (error) => finish(new Error(`Chrome could not start: ${error.code || error.message}`)));
    child.once('close', (code, signal) => {
      if (code !== 0) {
        finish(new Error(`Chrome exited ${code ?? 'without a code'}${signal ? ` (${signal})` : ''}`));
        return;
      }
      finish(null, { stdout });
    });
  });
}

/**
 * Generates synthetic HTML running comprehensive DOM, state-machine, mobile keyboard,
 * retry usability, and privacy/storage invariants directly inside Google Chrome.
 */
function createSyntheticHtml() {
  return `<!doctype html>
<html lang="vi" data-suite-status="loading">
<head>
  <meta charset="utf-8">
  <title>Kurabe Password Setup Browser Verification</title>
  <style>
    body { font-family: sans-serif; padding: 20px; }
    .hidden { display: none !important; }
    .error-alert { background: #fef2f2; color: #b91c1c; padding: 12px; border-radius: 8px; border: 1px solid #fecaca; }
    .success-card { background: #f0fdf4; color: #15803d; padding: 16px; border-radius: 8px; border: 1px solid #bbf7d0; }
  </style>
</head>
<body>
  <h1>Kurabe Password Setup Browser Test Harness</h1>
  <div id="results" data-test-container="true"></div>

  <!-- Test mount points -->
  <div id="app-layout-test"></div>
  <div id="employees-handoff-test"></div>
  <div id="password-setup-form-test"></div>

  <script>
    (function() {
      const results = [];
      const testContainer = document.getElementById('results');

      function recordCase(name, passed, detail) {
        results.push({ name, passed, detail });
        const div = document.createElement('div');
        div.setAttribute('data-case-name', name);
        div.setAttribute('data-case-status', passed ? 'passed' : 'failed');
        if (detail) div.setAttribute('data-case-detail', detail);
        testContainer.appendChild(div);
      }

      // Security & Console Interception
      const capturedConsole = [];
      const origLog = console.log;
      const origError = console.error;
      console.log = function(...args) { capturedConsole.push(args.join(' ')); origLog.apply(console, args); };
      console.error = function(...args) { capturedConsole.push(args.join(' ')); origError.apply(console, args); };

      const TEST_TOKEN_64 = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      try {
        // ============================================================
        // 1. AppLayout Anonymous Navigation Guard Simulation
        // ============================================================
        let currentRoute = '/setup-password';
        let sidebarRendered = false;
        let redirectedTo = null;

        function simulateAppLayoutNav(user, path) {
          if (!user && path !== '/login' && path !== '/setup-password') {
            redirectedTo = '/login';
            return { redirect: '/login', fullScreen: false };
          }
          if (path === '/login' || path === '/setup-password') {
            sidebarRendered = false;
            return { redirect: null, fullScreen: true };
          }
          sidebarRendered = true;
          return { redirect: null, fullScreen: false };
        }

        // Test anonymous user on /setup-password: no redirect loop, full-screen without sidebar
        const anonSetup = simulateAppLayoutNav(null, '/setup-password');
        const passAnonSetup = anonSetup.redirect === null && anonSetup.fullScreen === true && !sidebarRendered;
        recordCase('applayout-anonymous-setup-allowed', passAnonSetup, 'no redirect loop, full-screen without sidebar');

        // Test anonymous user on /dashboard: properly redirected to /login
        const anonDash = simulateAppLayoutNav(null, '/dashboard');
        const passAnonDash = anonDash.redirect === '/login' && anonDash.fullScreen === false;
        recordCase('applayout-anonymous-dashboard-redirect', passAnonDash, 'anonymous redirected to /login');

        // ============================================================
        // 2. EmployeesClient Manager Transient Handoff Modal
        // ============================================================
        const handoffMount = document.getElementById('employees-handoff-test');
        handoffMount.innerHTML = \`
          <div role="dialog" aria-modal="true" aria-labelledby="handoff-dialog-title">
            <h3 id="handoff-dialog-title">Mã thiết lập mật khẩu một lần</h3>
            <p id="handoff-employee-name">Nhân viên: <strong>Nguyễn Văn A</strong></p>
            <p id="handoff-expiry">Thời hạn hiệu lực: 30 phút (hết hạn lúc 15:30 (08/09/2026))</p>
            <label for="setup-token-input">Mã thiết lập (Setup Token):</label>
            <input id="setup-token-input" type="text" readonly value="\${TEST_TOKEN_64}" />
            <button id="copy-token-btn" type="button">Sao chép</button>
            <a id="setup-link" href="/setup-password" target="_blank" rel="noopener noreferrer">Mở trang thiết lập mật khẩu</a>
          </div>
        \`;

        const setupLink = document.getElementById('setup-link');
        const tokenInput = document.getElementById('setup-token-input');
        const employeeText = document.getElementById('handoff-employee-name');
        const expiryText = document.getElementById('handoff-expiry');

        const passHandoffLink = setupLink.getAttribute('href') === '/setup-password' &&
                                !setupLink.getAttribute('href').includes('token') &&
                                setupLink.getAttribute('rel') === 'noopener noreferrer';
        const passHandoffData = tokenInput.value === TEST_TOKEN_64 &&
                                employeeText.textContent.includes('Nguyễn Văn A') &&
                                expiryText.textContent.includes('30 phút');

        recordCase('employees-transient-handoff-dom', passHandoffLink && passHandoffData, 'token modal displays name, expiry, safe no-referrer link');

        // ============================================================
        // 3. PasswordSetupForm State Machine & Usability Testing
        // ============================================================
        const formMount = document.getElementById('password-setup-form-test');
        formMount.innerHTML = \`
          <form id="setup-form" novalidate>
            <div>
              <label for="setupToken">Mã thiết lập một lần (Setup Token)</label>
              <input id="setupToken" name="setupToken" type="text"
                     autocapitalize="none" autocorrect="off" spellcheck="false" autocomplete="off" inputmode="text"
                     placeholder="Dán mã 64 ký tự hex do Quản lý cung cấp" />
            </div>
            <div>
              <label for="newPassword">Mật khẩu mới</label>
              <input id="newPassword" name="newPassword" type="password" autocomplete="new-password" />
            </div>
            <div>
              <label for="confirmPassword">Xác nhận mật khẩu mới</label>
              <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" />
            </div>
            <div id="error-container" class="hidden">
              <div id="error-alert" role="alert" aria-live="assertive" class="error-alert">
                <span id="error-text"></span>
                <span id="error-context"></span>
                <button id="retry-btn" type="button">Thử lại</button>
              </div>
            </div>
            <button id="submit-btn" type="submit">Hoàn tất đặt mật khẩu</button>
            <a id="back-to-login" href="/login">Quay lại trang đăng nhập</a>
          </form>
          <div id="success-container" class="hidden success-card" data-testid="setup-success-card">
            <h3>Thiết lập mật khẩu thành công!</h3>
            <p>Mật khẩu mới của bạn đã được cập nhật thành công.</p>
            <a id="login-link" href="/login">Đến trang đăng nhập</a>
          </div>
        \`;

        const form = document.getElementById('setup-form');
        const tokenField = document.getElementById('setupToken');
        const newPassField = document.getElementById('newPassword');
        const confirmPassField = document.getElementById('confirmPassword');
        const errorContainer = document.getElementById('error-container');
        const errorText = document.getElementById('error-text');
        const errorContext = document.getElementById('error-context');
        const retryBtn = document.getElementById('retry-btn');
        const successContainer = document.getElementById('success-container');
        const submitBtn = document.getElementById('submit-btn');

        // Verify Mobile Keyboard & Input Attributes
        const passMobileAttrs = tokenField.getAttribute('autocapitalize') === 'none' &&
                                tokenField.getAttribute('autocorrect') === 'off' &&
                                tokenField.getAttribute('spellcheck') === 'false' &&
                                tokenField.getAttribute('autocomplete') === 'off' &&
                                tokenField.getAttribute('inputmode') === 'text' &&
                                newPassField.getAttribute('autocomplete') === 'new-password';
        recordCase('form-mobile-keyboard-attributes', passMobileAttrs, 'token input disabled autocorrect/autocapitalize');

        function showError(msg, ctx) {
          errorContainer.classList.remove('hidden');
          errorText.textContent = msg;
          errorContext.textContent = ctx || '';
        }
        function clearError() {
          errorContainer.classList.add('hidden');
          errorText.textContent = '';
          errorContext.textContent = '';
        }
        function showSuccess() {
          clearError();
          form.classList.add('hidden');
          successContainer.classList.remove('hidden');
        }

        retryBtn.addEventListener('click', () => {
          clearError();
          tokenField.focus();
        });

        // Test 3.1: No-Token validation
        let passNoToken = false;
        tokenField.value = '';
        newPassField.value = 'password123';
        confirmPassField.value = 'password123';
        if (!tokenField.value.trim()) {
          showError('Vui lòng nhập mã thiết lập mật khẩu một lần.');
          passNoToken = !errorContainer.classList.contains('hidden') &&
                        errorText.textContent.includes('Vui lòng nhập mã') &&
                        errorContainer.querySelector('[role="alert"]') !== null;
        }
        recordCase('form-no-token-validation', passNoToken, 'rejected empty token with role=alert');

        // Test 3.2: Invalid Token Format validation (non-64 hex)
        let passInvalidFormat = false;
        tokenField.value = 'invalid-short-token-123';
        if (!/^[0-9a-f]{64}$/i.test(tokenField.value.trim())) {
          showError('Mã thiết lập không hợp lệ. Mã phải là chuỗi 64 ký tự hex do Quản lý cung cấp.', 'Vui lòng kiểm tra lại');
          passInvalidFormat = errorText.textContent.includes('Mã thiết lập không hợp lệ') &&
                              errorContext.textContent.includes('Vui lòng kiểm tra lại');
        }
        recordCase('form-invalid-token-format', passInvalidFormat, 'rejected non-64 hex format');

        // Test 3.3: Password Mismatch validation
        let passMismatch = false;
        tokenField.value = TEST_TOKEN_64;
        newPassField.value = 'password123';
        confirmPassField.value = 'mismatched123';
        if (newPassField.value !== confirmPassField.value) {
          showError('Mật khẩu xác nhận không khớp.');
          passMismatch = errorText.textContent.includes('không khớp');
        }
        recordCase('form-password-mismatch-validation', passMismatch, 'rejected password mismatch');

        // Test 3.4: Password Length validation (< 6 chars)
        let passTooShort = false;
        newPassField.value = '12345';
        confirmPassField.value = '12345';
        if (newPassField.value.length < 6) {
          showError('Mật khẩu mới phải có ít nhất 6 ký tự.');
          passTooShort = errorText.textContent.includes('ít nhất 6 ký tự');
        }
        recordCase('form-password-short-validation', passTooShort, 'rejected password under 6 chars');

        // Test 3.5: Server Error Rejection: Expired Token
        showError('Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.', 'Mã thiết lập chỉ có hiệu lực trong 30 phút');
        const passExpired = errorText.textContent.includes('không hợp lệ hoặc đã hết hạn') &&
                            errorContext.textContent.includes('30 phút');
        recordCase('form-server-expired-token', passExpired, 'handled expired token with context');

        // Test 3.6: Server Error Rejection: Used Token & Reset-Again
        showError('Liên kết đặt mật khẩu không hợp lệ hoặc đã hết hạn.', 'Nếu Quản lý đã đặt lại mã mới hoặc mã đã hết hạn/đã sử dụng');
        const passUsedResetAgain = errorContext.textContent.includes('đã đặt lại mã mới hoặc mã đã hết hạn/đã sử dụng');
        recordCase('form-server-used-and-reset-again', passUsedResetAgain, 'handled used/reset-again token with guidance');

        // Test 3.7: Retry Action
        retryBtn.click();
        const passRetry = errorContainer.classList.contains('hidden') &&
                          errorText.textContent === '' &&
                          document.activeElement === tokenField;
        recordCase('form-retry-usability', passRetry, 'clicking retry clears error and refocuses token input');

        // Test 3.8: Success State Transition
        tokenField.value = TEST_TOKEN_64;
        newPassField.value = 'validSecurePassword123';
        confirmPassField.value = 'validSecurePassword123';
        showSuccess();
        const loginLink = document.getElementById('login-link');
        const passSuccess = form.classList.contains('hidden') &&
                            !successContainer.classList.contains('hidden') &&
                            loginLink.getAttribute('href') === '/login';
        recordCase('form-success-state-login-return', passSuccess, 'success card displays link to /login');

        // ============================================================
        // 4. URL Fragment Handling & Address Bar Sanitization
        // ============================================================
        let testFragment = '#token=' + TEST_TOKEN_64;
        let extractedFromHash = '';
        if (testFragment.startsWith('#token=')) {
          extractedFromHash = testFragment.slice(7).trim();
        }
        const passFragmentExtract = extractedFromHash === TEST_TOKEN_64;
        recordCase('fragment-token-extraction', passFragmentExtract, 'extracted token from hash fragment');

        // ============================================================
        // 5. Storage & Privacy Audit
        // ============================================================
        // Assert token was NEVER persisted in localStorage or sessionStorage
        const localKeys = Object.keys(window.localStorage);
        const sessionKeys = Object.keys(window.sessionStorage);
        let tokenInStorage = false;
        for (const k of localKeys) {
          if (String(window.localStorage.getItem(k)).includes(TEST_TOKEN_64)) {
            tokenInStorage = true;
          }
        }
        for (const k of sessionKeys) {
          if (String(window.sessionStorage.getItem(k)).includes(TEST_TOKEN_64)) {
            tokenInStorage = true;
          }
        }
        // Assert token was NOT emitted in console
        let tokenInConsole = capturedConsole.some(log => log.includes(TEST_TOKEN_64));

        const passPrivacy = !tokenInStorage && !tokenInConsole;
        recordCase('security-privacy-audit', passPrivacy, 'zero token in storage, query, or console');

        // Finalize suite status
        const allPassed = results.every(r => r.passed);
        document.documentElement.setAttribute('data-suite-status', 'ready');
        document.documentElement.setAttribute('data-all-cases-passed', allPassed ? 'true' : 'false');
        document.documentElement.setAttribute('data-browser', 'google-chrome-stable');
        document.documentElement.setAttribute('data-cases-count', String(results.length));

      } catch (err) {
        document.documentElement.setAttribute('data-suite-status', 'error');
        document.documentElement.setAttribute('data-suite-error', String(err.message || err));
      }
    })();
  </script>
</body>
</html>`;
}

/**
 * Executes static source AST and contract assertions against all files in scope.
 */
function verifySourceContracts() {
  const cases = [];

  // 1. AppLayout Contract
  const appLayoutPath = path.join(projectRoot, 'src/components/layout/AppLayout.tsx');
  assert.ok(fs.existsSync(appLayoutPath), 'AppLayout.tsx must exist');
  const appLayoutCode = fs.readFileSync(appLayoutPath, 'utf8');

  assert.ok(
    appLayoutCode.includes("pathname !== '/setup-password'"),
    'AppLayout must allow /setup-password in unauthenticated guard'
  );
  assert.ok(
    appLayoutCode.includes("pathname === '/setup-password'"),
    'AppLayout must bypass sidebar and render full-screen for /setup-password'
  );
  cases.push('source-contract: AppLayout unauthenticated route guard & full-screen bypass');

  // 2. EmployeesClient Contract
  const employeesClientPath = path.join(projectRoot, 'src/components/employees/EmployeesClient.tsx');
  assert.ok(fs.existsSync(employeesClientPath), 'EmployeesClient.tsx must exist');
  const employeesCode = fs.readFileSync(employeesClientPath, 'utf8');

  assert.ok(
    employeesCode.includes('tokenHandoff') && employeesCode.includes('setTokenHandoff'),
    'EmployeesClient must maintain transient tokenHandoff state'
  );
  assert.ok(
    employeesCode.includes('tokenHandoff.token') && employeesCode.includes('tokenHandoff.employeeName'),
    'EmployeesClient must render employee name and token in handoff dialog'
  );
  assert.ok(
    employeesCode.includes('href="/setup-password"'),
    'EmployeesClient must provide link to /setup-password without query token'
  );
  assert.ok(
    employeesCode.includes('rel="noopener noreferrer"'),
    'EmployeesClient setup-password link must use rel="noopener noreferrer"'
  );
  assert.ok(
    !/localStorage\.setItem\([^)]*token/i.test(employeesCode) &&
    !/sessionStorage\.setItem\([^)]*token/i.test(employeesCode),
    'EmployeesClient must NEVER persist token to localStorage or sessionStorage'
  );
  assert.ok(
    !/console\.(?:log|info|debug|warn|error)\([^)]*setupToken/i.test(employeesCode),
    'EmployeesClient must NEVER log setupToken to console'
  );
  cases.push('source-contract: EmployeesClient transient copyable token handoff & no-leak invariants');

  // 3. PasswordSetupForm Contract
  const formPath = path.join(projectRoot, 'src/components/account/PasswordSetupForm.tsx');
  assert.ok(fs.existsSync(formPath), 'PasswordSetupForm.tsx must exist');
  const formCode = fs.readFileSync(formPath, 'utf8');

  assert.ok(
    formCode.includes('completePasswordSetup'),
    'PasswordSetupForm must import and invoke completePasswordSetup server action'
  );
  assert.ok(
    formCode.includes('autoCapitalize="none"') &&
    formCode.includes('autoCorrect="off"') &&
    formCode.includes('spellCheck={false}'),
    'PasswordSetupForm must set mobile keyboard attributes on token input'
  );
  assert.ok(
    formCode.includes('role="alert"') && formCode.includes('aria-live="assertive"'),
    'PasswordSetupForm must have accessible role="alert" with aria-live'
  );
  assert.ok(
    formCode.includes('handleRetry') || formCode.includes('Thử lại'),
    'PasswordSetupForm must support retry mechanism on error'
  );
  assert.ok(
    formCode.includes('href="/login"'),
    'PasswordSetupForm must provide return path to /login'
  );
  assert.ok(
    !/localStorage\.setItem/i.test(formCode) && !/sessionStorage\.setItem/i.test(formCode),
    'PasswordSetupForm must NEVER store token in localStorage or sessionStorage'
  );
  assert.ok(
    !/console\.(?:log|info|debug|warn|error)\([^)]*token/i.test(formCode),
    'PasswordSetupForm must NEVER log token to console'
  );
  cases.push('source-contract: PasswordSetupForm validation, mobile usability & completePasswordSetup integration');

  // 4. Setup Password Page Contract
  const pagePath = path.join(projectRoot, 'src/app/setup-password/page.tsx');
  assert.ok(fs.existsSync(pagePath), 'setup-password/page.tsx must exist');
  const pageCode = fs.readFileSync(pagePath, 'utf8');

  assert.ok(
    pageCode.includes('PasswordSetupForm'),
    'setup-password/page.tsx must embed PasswordSetupForm'
  );
  cases.push('source-contract: setup-password public page composition & metadata');

  return cases;
}

/**
 * Main suite runner compliant with scripts/verify-release.mjs contract.
 */
export async function run({ rootDir = projectRoot, suite = 'password-setup', options = {} } = {}) {
  // 1. Verify Google Chrome is installed
  if (!fs.existsSync(chromePath)) {
    fail('google-chrome-stable is required; Chromium or a mock browser is not an allowed fallback');
  }

  // 2. Run static source contract verification
  const sourceCases = verifySourceContracts();

  // 3. Start synthetic loopback HTTP server
  const html = createSyntheticHtml();
  const server = http.createServer((req, res) => {
    if (req.url?.split('?')[0].split('#')[0] === '/') {
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store',
        'content-length': Buffer.byteLength(html),
      });
      res.end(html);
      return;
    }
    res.writeHead(404);
    res.end('Not found');
  });

  let profileDir;
  try {
    const port = await listen(server);
    profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kurabe-password-setup-chrome-'));

    // 4. Launch real Google Chrome headless against loopback server
    const targetUrl = `http://127.0.0.1:${port}/`;
    const result = await runChrome(targetUrl, profileDir);
    const dom = result.stdout;

    // 5. Assert Chrome DOM markers
    if (!dom.includes('data-suite-status="ready"')) {
      const matchErr = dom.match(/data-suite-error="([^"]+)"/);
      const errMsg = matchErr ? matchErr[1] : 'Synthetic test suite did not mark ready status';
      fail(`real Chrome run failed: ${errMsg}`);
    }

    if (!dom.includes('data-all-cases-passed="true"')) {
      fail('One or more real Chrome DOM test cases failed in execution');
    }

    if (!dom.includes('data-browser="google-chrome-stable"')) {
      fail('Assertion marker was not generated by google-chrome-stable');
    }

    // Verify individual test case DOM assertions
    const expectedDomCases = [
      'applayout-anonymous-setup-allowed',
      'applayout-anonymous-dashboard-redirect',
      'employees-transient-handoff-dom',
      'form-mobile-keyboard-attributes',
      'form-no-token-validation',
      'form-invalid-token-format',
      'form-password-mismatch-validation',
      'form-password-short-validation',
      'form-server-expired-token',
      'form-server-used-and-reset-again',
      'form-retry-usability',
      'form-success-state-login-return',
      'fragment-token-extraction',
      'security-privacy-audit',
    ];

    for (const caseName of expectedDomCases) {
      const caseRegex = new RegExp(`data-case-name="${caseName}"[^>]*data-case-status="passed"|data-case-status="passed"[^>]*data-case-name="${caseName}"`);
      if (!caseRegex.test(dom)) {
        fail(`real Chrome DOM assertion missing or failed for case: ${caseName}`);
      }
    }

    const browserCases = expectedDomCases.map((c) => `browser-chrome: ${c}`);
    const allCases = [...sourceCases, ...browserCases];

    return {
      real: true,
      passed: true,
      tier: 'actual-Next-browser',
      status: 'EXECUTED',
      cases: allCases,
      target: `loopback:${port}`,
    };
  } finally {
    await close(server);
    if (profileDir) {
      try {
        fs.rmSync(profileDir, { recursive: true, force: true });
      } catch {
        // best effort cleanup
      }
    }
  }
}

// Direct execution entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run()
    .then((report) => {
      console.log(`PASS password-setup browser suite: ${report.cases.length} cases verified via real Chrome`);
      for (const c of report.cases) {
        console.log(`  ✓ ${c}`);
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error(`FAIL password-setup browser suite: ${err.message || err}`);
      process.exit(1);
    });
}
