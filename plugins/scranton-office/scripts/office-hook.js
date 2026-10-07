// Office state: writes Claude Code hook events to the file system.
// Per session, under ~/.claude/scranton-office/state/<session_id>/:
//   busy            -> the main agent is working
//   agents/<id>     -> one file per running subagent (contents: agent_type)
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(os.homedir(), '.claude', 'scranton-office', 'state');

let raw = '';
process.stdin.on('data', (d) => (raw += d));
process.stdin.on('end', () => {
  try {
    handle(JSON.parse(raw || '{}'));
  } catch {}
  process.exit(0);
});

function safe(s) {
  return String(s || '').replace(/[^A-Za-z0-9_-]/g, '_');
}

function handle(ev) {
  if (!ev.session_id) return;
  const dir = path.join(ROOT, safe(ev.session_id));
  const agents = path.join(dir, 'agents');
  const busy = path.join(dir, 'busy');

  switch (ev.hook_event_name) {
    case 'SessionStart':
      fs.rmSync(dir, { recursive: true, force: true });
      cleanupOldSessions();
      break;
    case 'UserPromptSubmit':
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(busy, String(Date.now()));
      break;
    case 'Stop':
    case 'StopFailure':
      fs.rmSync(busy, { force: true });
      break;
    case 'SubagentStart':
      fs.mkdirSync(agents, { recursive: true });
      fs.writeFileSync(path.join(agents, safe(ev.agent_id || Date.now())), ev.agent_type || '');
      break;
    case 'SubagentStop':
      if (ev.agent_id) fs.rmSync(path.join(agents, safe(ev.agent_id)), { force: true });
      break;
    case 'SessionEnd':
      fs.rmSync(dir, { recursive: true, force: true });
      break;
  }
}

function cleanupOldSessions() {
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  for (const name of fs.existsSync(ROOT) ? fs.readdirSync(ROOT) : []) {
    const p = path.join(ROOT, name);
    try {
      if (fs.statSync(p).mtimeMs < dayAgo) fs.rmSync(p, { recursive: true, force: true });
    } catch {}
  }
}
