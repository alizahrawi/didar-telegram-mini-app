import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function git(args, options = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, ...options });
  if (result.status !== 0) throw new Error(result.stderr.trim() || `git ${args.join(' ')} failed`);
  return result.stdout;
}

const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
const forbiddenFiles = tracked.filter((file) => file === '.env' || file === '.dev.vars' || file.startsWith('node_modules/') || /\.(?:pem|p12|pfx|key)$/i.test(file));

const patterns = [
  ['Telegram bot token', /\b\d{7,12}:[A-Za-z0-9_-]{30,}\b/g],
  ['GitHub access token', /\bgh[pousr]_[A-Za-z0-9_]{30,}\b/g],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
];

const findings = [];
for (const file of tracked) {
  if (file === 'package-lock.json') continue;
  let content;
  try { content = readFileSync(file, 'utf8'); } catch { continue; }
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    patterns.forEach(([name, pattern]) => {
      pattern.lastIndex = 0;
      if (pattern.test(line)) findings.push(`${file}:${index + 1} — ${name}`);
    });
  });
}

const history = git(['log', '-p', '--all', '--format=']);
const historyFindings = patterns.filter(([, pattern]) => {
  pattern.lastIndex = 0;
  return pattern.test(history);
}).map(([name]) => name);

if (forbiddenFiles.length || findings.length || historyFindings.length) {
  console.error('Security check failed.');
  forbiddenFiles.forEach((file) => console.error(`Tracked sensitive file: ${file}`));
  findings.forEach((finding) => console.error(`Potential credential: ${finding}`));
  historyFindings.forEach((name) => console.error(`Potential credential in Git history: ${name}`));
  process.exit(1);
}

console.log(`Security check passed: ${tracked.length} tracked files and Git history contain no recognized credentials.`);
