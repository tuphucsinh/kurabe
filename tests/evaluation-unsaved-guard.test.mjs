import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(moduleDir, '..');

// ============================================================================
// P110M1T04 — the evaluation page must warn before losing unsaved edits:
// beforeunload on refresh/close, confirm on internal <a> navigation, confirm
// before opening compare, and a reactive hasUnsavedChanges flag that clears
// only after a successful save (stays dirty on failure / during flight).
// ============================================================================

const clientPath = path.join(projectRoot, 'src/app/evaluations/[id]/EvaluationPageClient.tsx');
const hookPath = path.join(projectRoot, 'src/hooks/use-evaluation-page-state.ts');
const clientSource = fs.readFileSync(clientPath, 'utf8');
const hookSource = fs.readFileSync(hookPath, 'utf8');

// 1. Behavioral test of the real exported navigation-decision helper.
// The client file contains JSX (not transpilable standalone), so extract the
// two pure exports by AST and evaluate exactly those declarations.
const sourceFile = ts.createSourceFile(clientPath, clientSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let helperText = null;
let messageText = null;
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.getText(sourceFile) === 'shouldConfirmNavigation') {
    helperText = node.getText(sourceFile);
  }
  if (ts.isVariableDeclaration(node) && node.name.getText(sourceFile) === 'UNSAVED_CHANGES_CONFIRM_MESSAGE') {
    messageText = `const ${node.getText(sourceFile)};`;
  }
  ts.forEachChild(node, visit);
}
visit(sourceFile);
assert.ok(helperText && messageText, 'client must export the guard helper and confirm message');

const helperModule = { exports: {} };
new Function('exports', ts.transpileModule(`${messageText}\n${helperText}\nexports.shouldConfirmNavigation = shouldConfirmNavigation; exports.UNSAVED_CHANGES_CONFIRM_MESSAGE = UNSAVED_CHANGES_CONFIRM_MESSAGE;`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText)(helperModule.exports);
const { shouldConfirmNavigation, UNSAVED_CHANGES_CONFIRM_MESSAGE } = helperModule.exports;

assert.equal(typeof shouldConfirmNavigation, 'function', 'helper must be exported');
assert.ok(UNSAVED_CHANGES_CONFIRM_MESSAGE.includes('chưa lưu'), 'confirm message must mention unsaved edits');

const ORIGIN = 'https://kurabe.example';

function fakeTarget(markup) {
  // Minimal DOM-free emulation: closest('a[href]') inspects the anchor map.
  const attrs = markup;
  return {
    closest: (selector) => {
      if (selector !== 'a[href]') return null;
      if (!attrs.isAnchor) return null;
      return {
        getAttribute: (name) => attrs[name] ?? null,
      };
    },
  };
}

assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: true, href: '/employees' }), ORIGIN), true,
  'internal anchor requires confirmation');
assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: true, href: 'https://evil.example/x' }), ORIGIN), false,
  'other-origin anchor must not be intercepted');
assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: true, href: '#section' }), ORIGIN), false,
  'hash-only anchors must not be intercepted');
assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: true, href: null }), ORIGIN), false,
  'anchor without href must not be intercepted');
assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: true, href: '/employees', target: '_blank' }), ORIGIN), false,
  'new-tab anchors must not be intercepted');
assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: false }), ORIGIN), false,
  'non-anchor targets (buttons) must not be intercepted by the click guard');
assert.equal(shouldConfirmNavigation(null, ORIGIN), false, 'null target is safe');
assert.equal(shouldConfirmNavigation({ closest: 'not-a-function' }, ORIGIN), false, 'non-element target is safe');
assert.equal(shouldConfirmNavigation(fakeTarget({ isAnchor: true, href: '/x' }), 'not a url'), false,
  'invalid origin fails closed');

// 2. Client wiring: guards exist and are dirty-gated.
assert.match(clientSource, /historicalSnapshotState,\n\s*hasUnsavedChanges,\n\s*\} = useEvaluationPageState\(\{/,
  'client consumes hasUnsavedChanges from the page-state hook');
assert.match(clientSource, /if \(!hasUnsavedChanges\) return;\s*\n\s*const onBeforeUnload/, 'beforeunload must be gated on hasUnsavedChanges');
assert.match(clientSource, /event\.preventDefault\(\);\s*\n\s*event\.returnValue = '';/, 'beforeunload must trigger the browser warning');
assert.match(clientSource, /document\.addEventListener\('click', onClickCapture, true\)/, 'internal link guard must run in capture phase');
assert.match(clientSource, /hasUnsavedChanges && !window\.confirm\(UNSAVED_CHANGES_CONFIRM_MESSAGE\)\) return;\s*\n\s*router\.push\(`\/evaluations\/\$\{employeeId\}\/compare`\)/,
  'compare navigation must confirm before pushing while dirty');
assert.doesNotMatch(clientSource, /history\.pushState|history\.replaceState|window\.onpopstate/,
  'no history monkey-patching');

// 3. Hook contract: reactive unsaved flag mirrors userEditedRef at every transition.
assert.match(hookSource, /const \[hasUnsavedChanges, setHasUnsavedChanges\] = useState\(false\);/,
  'hook exposes a reactive unsaved flag');
assert.match(hookSource, /const setUserEdited = useCallback\(\(value: boolean\) => \{\s*\n\s*userEditedRef\.current = value;\s*\n\s*setHasUnsavedChanges\(value\);/,
  'ref and reactive state must be assigned together');
assert.equal((hookSource.match(/setUserEdited\(/g) || []).length, 4,
  'all transitions go through setUserEdited (edit=true, hydration x2=false, ack=result)');
assert.equal((hookSource.match(/userEditedRef\.current = /g) || []).length, 1,
  'no direct ref assignment outside the setter');
assert.match(hookSource, /hasUnsavedChanges,\n\s*editRevisionRef,/, 'hook returns hasUnsavedChanges');

console.log('P110M1T04 evaluation unsaved-changes guard: ALL PASS');
