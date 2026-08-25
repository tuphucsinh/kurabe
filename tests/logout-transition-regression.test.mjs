/**
 * Regression contract for logout transition (P92T08).
 * Run: node tests/logout-transition-regression.test.mjs
 */
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const auth = read('src/contexts/AuthContext.tsx');
const layout = read('src/components/layout/AppLayout.tsx');
const sidebar = read('src/components/layout/Sidebar.tsx');

assert.ok(auth.includes('isLoggingOut: boolean;'), 'AuthContext must expose isLoggingOut');
assert.ok(auth.includes('const [isLoggingOut, setIsLoggingOut] = useState(false);'), 'isLoggingOut must default false');
assert.ok(
  /const logout = async \(\) => \{\s*setIsLoggingOut\(true\);[\s\S]*?await logoutAction\(\)/.test(auth),
  'logout must enter logging-out state before the server action'
);
assert.ok(auth.includes('isLoggingOut,\n      login,'), 'AuthProvider must expose isLoggingOut to consumers');

assert.ok(layout.includes('const { user, isLoading, isLoggingOut } = useAuth();'), 'AppLayout must consume isLoggingOut');
assert.ok(layout.includes('if (isLoading || isLoggingOut) return;'), 'AppLayout redirect effect must pause during logout');
assert.ok(layout.includes('isLoggingOut, pathname, router'), 'AppLayout effect dependencies must include isLoggingOut');
assert.ok(
  layout.includes('if (isLoggingOut)') &&
    layout.includes('className="min-h-screen bg-brand-strong flex items-center justify-center"') &&
    layout.includes('animate-spin'),
  'AppLayout must render a full-screen transition while logging out'
);

assert.ok(sidebar.includes('const { logout, currentPeriod, isLoggingOut } = useAuth();'), 'Sidebar must consume isLoggingOut');
assert.ok(sidebar.includes('if (isLogoutStarted || isLoggingOut) return;'), 'Sidebar must prevent duplicate logout clicks');
assert.ok(sidebar.includes('disabled={isLogoutStarted || isLoggingOut}'), 'Logout button must be disabled while pending');
assert.ok(sidebar.includes("window.location.replace('/login');"), 'Logout must use one replace navigation to login');
assert.ok(!sidebar.includes("window.location.href = '/login'"), 'Old href logout navigation must be removed');

console.log('logout-transition-regression tests: ALL PASS');
