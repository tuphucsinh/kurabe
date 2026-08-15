#!/usr/bin/env node
// Wrapper: chạy lệnh với env từ .env.local LUÔN ƯU TIÊN (chống shell env ô nhiễm từ project khác).
// Vì sao: Next ưu tiên process.env có sẵn > .env.local, và NEXT_PUBLIC_* inline lúc build —
// shell env trỏ nhầm sangwebsite (15-08) làm build/start dùng sai DB kurabe.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const env = { ...process.env };
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    // bỏ quotes bao ngoài nếu có
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error('Usage: node scripts/run-with-env.mjs <command> [args...]');
  process.exit(1);
}
const child = spawn(cmd, args, { stdio: 'inherit', env });
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
child.on('error', (err) => {
  console.error('spawn error:', err.message);
  process.exit(1);
});
