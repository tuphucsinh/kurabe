import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const artifactRoot = process.env.KURABE_H5_ARTIFACT_ROOT;
if (!artifactRoot || !path.isAbsolute(artifactRoot)) throw new Error('KURABE_H5_ARTIFACT_ROOT must be an absolute disposable artifact path');
export const c = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'private-runtime.json')));
export const f = JSON.parse(fs.readFileSync(path.join(artifactRoot, 'fixtures.json')));
export const origin = `http://127.0.0.1:${c.nextPort}`;
let cookies = fs.existsSync(`${c.root}/private-cookies.json`)
  ? JSON.parse(fs.readFileSync(`${c.root}/private-cookies.json`, 'utf8'))
  : {};

export function sql(statement) {
  return execFileSync(
    'docker',
    ['exec', '-i', `${c.name}-db`, 'psql', '-X', '-U', 'postgres', '-d', c.db, '-At', '-v', 'ON_ERROR_STOP=1'],
    { input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  ).trim();
}

export const save = (name, value) => fs.writeFileSync(`${c.root}/${name}`, JSON.stringify(value, null, 2));

export function manifest() {
  return Object.entries(JSON.parse(fs.readFileSync(`${c.source}/.next/dev/server/server-reference-manifest.json`, 'utf8')).node)
    .map(([id, x]) => ({ id, name: x.exportedName, filename: x.filename, workers: Object.keys(x.workers) }));
}

function decodeFlight(text) {
  const chunks = new Map();
  for (const line of text.split('\n')) {
    const match = line.match(/^([0-9a-f]+):([\s\S]*)$/);
    if (!match) continue;
    try { chunks.set(match[1], JSON.parse(match[2])); } catch {}
  }
  function decode(value, depth = 0) {
    if (depth > 25) return '[DEPTH_LIMIT]';
    if (typeof value === 'string') {
      const ref = value.match(/^\$(?:@)?([0-9a-f]+)$/);
      if (ref && chunks.has(ref[1])) return decode(chunks.get(ref[1]), depth + 1);
      if (value === '$undefined') return undefined;
      return value;
    }
    if (Array.isArray(value)) return value.map(item => decode(item, depth + 1));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, decode(v, depth + 1)]));
    return value;
  }
  const root = chunks.get('0');
  if (root && Object.hasOwn(root, 'a')) return decode(root.a);
  return { decodeError: true, raw: text.slice(-5000) };
}

export async function route(user, routePath) {
  const response = await fetch(origin + routePath, {
    headers: { ...(cookies[user] ? { Cookie: cookies[user] } : {}) },
    signal: AbortSignal.timeout(150000),
    redirect: 'manual',
  });
  return { status: response.status, text: await response.text(), location: response.headers.get('location') };
}

function selectWorker(name, item) {
  if (name === 'loginAction') return item.workers.find(w => w === 'app/login/page');
  if (name === 'getEvaluationHistoryAction') return item.workers.find(w => w.includes('history/[employeeId]'));
  if (name === 'upsertTeamAction' || name === 'softDeleteTeamAction') return item.workers.find(w => w.includes('teams/page')) ?? item.workers[0];
  if (name === 'getCriteriaForRoleAction' || name === 'getGradeBandsAction' || name === 'getCurrentUserAction') {
    return item.workers.find(w => w.includes('evaluations/[id]'))
      ?? item.workers.find(w => w.includes('settings/page'))
      ?? item.workers.find(w => w !== 'app/login/page')
      ?? item.workers[0];
  }
  return item.workers.find(w => w.includes('evaluations/[id]'))
    ?? item.workers.find(w => w.includes('settings/page'))
    ?? item.workers.find(w => w !== 'app/login/page')
    ?? item.workers[0];
}

export async function action(user, name, args = [], label = name) {
  const item = manifest().find(x => x.name === name);
  if (!item) throw new Error(`ACTION_NOT_COMPILED ${name}`);
  const worker = selectWorker(name, item);
  let endpoint = worker.replace(/^app/, '').replace(/\/page$/, '') || '/';
  if (worker.includes('evaluations/[id]')) endpoint = `/evaluations/${args[0]}`;
  else if (worker.includes('history/[employeeId]')) endpoint = `/history/${args[0]}`;
  const response = await fetch(origin + endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Accept: 'text/x-component',
      'Next-Action': item.id,
      Origin: origin,
      ...(cookies[user] ? { Cookie: cookies[user] } : {}),
    },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(150000),
    redirect: 'manual',
  });
  const raw = await response.text();
  const data = decodeFlight(raw);
  for (const cookie of response.headers.getSetCookie()) {
    if (cookie.startsWith('auth_session=')) {
      cookies[user] = cookie.split(';')[0];
      fs.writeFileSync(`${c.root}/private-cookies.json`, JSON.stringify(cookies), { mode: 0o600 });
    }
  }
  const evidence = { at: new Date().toISOString(), user, action: name, actionId: item.id, endpoint, http: response.status, result: data };
  fs.appendFileSync(`${c.root}/action-evidence.jsonl`, JSON.stringify({ label, ...evidence }) + '\n');
  return evidence;
}

export async function login(user) {
  const fixture = f.users.find(x => x.key === user);
  const result = await action(user, 'loginAction', [fixture.code, c.fixturePassword], `login-${user}`);
  if (!result.result?.success) throw new Error(`AUTH_FAILED ${user}`);
  const current = await action(user, 'getCurrentUserAction', [], `current-${user}`);
  if (current.result?.id !== fixture.id) throw new Error(`SESSION_READBACK_FAILED ${user}`);
  return { login: result.result.success, current: current.result };
}
