// Office status line: shows who is working in this session on a single line.
// For the full isometric office, run /scranton-office:office.
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(os.homedir(), '.claude', 'scranton-office', 'state');
const RESET = '\x1b[0m';
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(';');
const fg = (h) => `\x1b[38;2;${rgb(h)}m`;
const bg = (h) => `\x1b[48;2;${rgb(h)}m`;

function render(input) {
  const dir = path.join(ROOT, String(input.session_id || '').replace(/[^A-Za-z0-9_-]/g, '_'));
  const busy = fs.existsSync(path.join(dir, 'busy'));
  let types = [];
  try {
    const adir = path.join(dir, 'agents');
    types = fs.readdirSync(adir).map((f) => fs.readFileSync(path.join(adir, f), 'utf8') || 'agent');
  } catch {}

  const badge = `\x1b[1m${fg('#f2f2f2')}${bg('#2c5aa0')} DUNDER MIFFLIN ${RESET} `;
  if (!busy && !types.length) return badge + fg('#9aa5b1') + 'all quiet' + RESET;

  // Blinking "working" dot + who is at their desk
  const dot = Math.floor(Date.now() / 1000) % 2 ? '●' : '○';
  const counts = {};
  for (const t of types) counts[t] = (counts[t] || 0) + 1;
  const parts = [];
  if (busy) parts.push(`${fg('#a8cbe8')}Jim${RESET}`);
  if (types.length)
    parts.push(
      `${fg('#d4b44a')}${types.length} subagent${RESET}${fg('#9aa5b1')} (` +
        Object.entries(counts)
          .map(([t, n]) => (n > 1 ? `${t}×${n}` : t))
          .join(', ') +
        `)${RESET}`
    );
  return badge + fg('#ffd866') + dot + RESET + ' ' + parts.join(fg('#9aa5b1') + ' · ' + RESET);
}

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  let input = {};
  try {
    input = JSON.parse(raw || '{}');
  } catch {}
  process.stdout.write(render(input));
});
