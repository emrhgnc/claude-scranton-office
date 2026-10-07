// Plugins cannot set statusLine, so /scranton-office:statusline runs this script.
// It copies the status line script to a stable path (the plugin cache path changes on updates)
// and adds it to ~/.claude/settings.json. An existing status line is left alone. `remove` uninstalls it.
const fs = require('fs');
const path = require('path');
const os = require('os');

const DIR = path.join(os.homedir(), '.claude', 'scranton-office');
const TARGET = path.join(DIR, 'statusline.js');
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');
const command = `node "${TARGET.replace(/\\/g, '/')}"`;
const isOurs = (sl) => typeof sl?.command === 'string' && sl.command.includes('scranton-office');

let settings = {};
try {
  settings = JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
} catch (e) {
  if (e.code !== 'ENOENT') {
    console.log(`Could not parse ${SETTINGS}; nothing changed. (${e.message})`);
    process.exit(0);
  }
}

const save = () => {
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.scranton-office.bak');
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + '\n');
};

if (process.argv[2] === 'remove') {
  if (!isOurs(settings.statusLine)) {
    console.log('The Scranton office status line is not installed; nothing changed.');
  } else {
    delete settings.statusLine;
    save();
    console.log('Status line removed. Restart Claude Code (or open /config) to refresh.');
  }
  process.exit(0);
}

if (settings.statusLine && !isOurs(settings.statusLine)) {
  console.log(`You already have a status line (${settings.statusLine.command}); nothing changed.`);
  console.log('Remove it from ~/.claude/settings.json first if you want the office status line.');
  process.exit(0);
}

fs.mkdirSync(DIR, { recursive: true });
fs.copyFileSync(path.join(__dirname, 'office-statusline.js'), TARGET);
settings.statusLine = { type: 'command', command, refreshInterval: 2 };
save();
console.log(`Status line installed (${command}). It appears on the next Claude Code refresh.`);
