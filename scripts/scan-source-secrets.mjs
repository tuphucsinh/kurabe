#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const scannerPath = path.resolve(fileURLToPath(import.meta.url));
const ignoredDirectoryNames = new Set(['.git', 'node_modules', '.next', '.tmp', 'coverage']);
const textExtensions = new Set([
  '.cjs', '.css', '.html', '.js', '.json', '.mjs', '.sql', '.ts', '.tsx', '.txt', '.yaml', '.yml',
]);

const DEFAULT_TRACKED_DIRECTORIES = ['src', 'scripts', 'db', 'supabase', '.github', 'docs'];
const DEFAULT_TRACKED_FILES = [
  'package.json',
  'tsconfig.json',
  'eslint.config.mjs',
  'next.config.ts',
  'postcss.config.mjs',
  'README.md',
  'README.txt',
];

const CREDENTIAL_FILE_PATTERN = /(?:^\.env(?:\..+)?$|\.(?:pem|key|pkcs12|p12|pfx|kdbx)$|^(?:id_rsa|id_ed25519|credentials|secret_key)(?:\..+)?$)/i;

function parseArgs(argv) {
  const paths = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--path') {
      const value = argv[++index];
      if (!value) throw new Error('--path requires a file or directory');
      paths.push(value);
      continue;
    }
    if (argv[index] === '--help') return { help: true, paths: [] };
    throw new Error(`unknown argument ${JSON.stringify(argv[index])}`);
  }
  return { help: false, paths };
}

function resolveInsideProject(input) {
  const resolved = path.resolve(projectRoot, input);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error('--path must remain inside the project worktree');
  }
  return resolved;
}

function isIgnoredDir(relative) {
  return relative.split('/').some((part) => ignoredDirectoryNames.has(part));
}

function collectFiles(inputPath, explicit = false, scope = { files: [], omitted: [], binary: [], oversize: [] }) {
  if (inputPath === scannerPath) return scope;
  const relative = path.relative(projectRoot, inputPath).replaceAll(path.sep, '/');
  const base = path.basename(inputPath);

  // Credential files: if not explicit, NEVER read credential files
  if (!explicit && CREDENTIAL_FILE_PATTERN.test(base)) {
    scope.omitted.push(relative);
    return scope;
  }

  // Seeded fixture exclusion
  if (!explicit && (relative.startsWith('tests/fixtures/release/') || relative.includes('/fixtures/release/'))) {
    scope.omitted.push(relative);
    return scope;
  }

  if (isIgnoredDir(relative)) {
    scope.omitted.push(relative);
    return scope;
  }

  if (!fs.existsSync(inputPath)) return scope;

  const stat = fs.lstatSync(inputPath);
  if (stat.isSymbolicLink()) {
    scope.omitted.push(relative);
    return scope;
  }

  if (stat.isFile()) {
    if (stat.size > 1024 * 1024) {
      scope.oversize.push(relative);
      return scope;
    }
    const ext = path.extname(inputPath).toLowerCase();
    if (!explicit && !textExtensions.has(ext)) {
      scope.binary.push(relative);
      return scope;
    }
    scope.files.push(inputPath);
    return scope;
  }

  if (!stat.isDirectory()) return scope;

  for (const entry of fs.readdirSync(inputPath, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(inputPath, entry.name);
    const childRel = path.relative(projectRoot, child).replaceAll(path.sep, '/');
    if (!explicit && (entry.name === 'fixtures' && childRel.startsWith('tests/fixtures'))) {
      scope.omitted.push(childRel);
      continue;
    }
    collectFiles(child, explicit, scope);
  }

  return scope;
}

function lineNumber(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

function scanText(text) {
  const patterns = [
    { rule: 'private-key-block', expression: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g },
    { rule: 'credentialed-database-url', expression: /(?:postgres(?:ql)?|mysql):\/\/[^\s:@]+:[^\s@]+@/gi },
    {
      rule: 'secret-assignment',
      expression: /(?:password|secret|token|api[_-]?key|private[_-]?key|service[_-]?role[_-]?key|database[_-]?url)\s*[:=]\s*['"]?([A-Za-z0-9+/=_-]{16,})/gi,
      filter: (match) => !/placeholder|example|dummy|synthetic.*placeholder/i.test(match[1]),
    },
    { rule: 'provider-key-prefix', expression: /\b(?:sk|pk|rk)-[A-Za-z0-9_-]{16,}\b/g },
    { rule: 'github-token', expression: /\b(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}\b/g },
    { rule: 'aws-access-key', expression: /\bAKIA[0-9A-Z]{16}\b/g },
    { rule: 'jwt-like-secret', expression: /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  ];
  const findings = [];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern.expression)) {
      if (pattern.filter && !pattern.filter(match)) {
        continue;
      }
      findings.push({ rule: pattern.rule, offset: match.index ?? 0 });
    }
  }
  return findings;
}

export function scanPaths(inputs = []) {
  const explicit = inputs.length > 0;
  const roots = explicit
    ? inputs.map(resolveInsideProject)
    : [
        ...DEFAULT_TRACKED_DIRECTORIES.map((relative) => path.join(projectRoot, relative)),
        ...DEFAULT_TRACKED_FILES.map((relative) => path.join(projectRoot, relative)).filter((p) => fs.existsSync(p)),
      ];

  const scope = { files: [], omitted: [], binary: [], oversize: [] };
  for (const root of roots) {
    collectFiles(root, explicit, scope);
  }

  const uniqueFiles = [...new Set(scope.files)].sort();
  const uniqueOmitted = [...new Set(scope.omitted)].sort();
  const uniqueBinary = [...new Set(scope.binary)].sort();
  const uniqueOversize = [...new Set(scope.oversize)].sort();

  const findings = [];
  for (const filePath of uniqueFiles) {
    const text = fs.readFileSync(filePath, 'utf8');
    for (const finding of scanText(text)) {
      findings.push({
        file: path.relative(projectRoot, filePath).replaceAll(path.sep, '/'),
        line: lineNumber(text, finding.offset),
        rule: finding.rule,
      });
    }
  }

  return {
    files: uniqueFiles,
    findings,
    scope: {
      scanned: uniqueFiles.length,
      omitted: uniqueOmitted.length,
      binary: uniqueBinary.length,
      oversize: uniqueOversize.length,
    },
    omitted: uniqueOmitted,
    binary: uniqueBinary,
    oversize: uniqueOversize,
  };
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      console.log('Usage: node scripts/scan-source-secrets.mjs [--path <project-relative-file-or-directory>]');
      return;
    }
    const report = scanPaths(options.paths);
    if (report.findings.length > 0) {
      console.error(`SOURCE_SECRET_SCAN FAIL findings=${report.findings.length}`);
      for (const finding of report.findings) {
        console.error(`  ${finding.file}:${finding.line} rule=${finding.rule} value=[redacted]`);
      }
      process.exitCode = 1;
      return;
    }
    console.log(`SOURCE_SECRET_SCAN PASS files=${report.files.length} scanned=${report.files.length} omitted=${report.omitted.length} binary=${report.binary.length} oversize=${report.oversize.length} findings=0`);
  } catch (error) {
    console.error(`SOURCE_SECRET_SCAN FAIL ${String(error.message || error)}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scannerPath) main();
