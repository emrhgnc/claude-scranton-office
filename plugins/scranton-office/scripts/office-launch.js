// Opens or closes the office pane.
// Supported terminals: Windows Terminal (wta/wtcli), tmux, WezTerm.
// Anywhere else it prints how to run the viewer by hand.
// `--here`: run the viewer in this terminal.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const VIEW = path.join(__dirname, 'office-view.js');
const DIR = path.join(os.homedir(), '.claude', 'scranton-office');
const PANE_FILE = path.join(DIR, 'pane.json');
const viewCmd = `node "${VIEW}"`;

const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true });
const has = (cmd) => {
  const r = run(process.platform === 'win32' ? 'where' : 'which', [cmd]);
  return r.status === 0;
};
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

// Per terminal: open() -> pane id, close(id) -> success
const BACKENDS = {
  wt: {
    available: () => process.platform === 'win32' && !!process.env.WT_SESSION && has('wta'),
    open() {
      const id = run('wta', ['split-pane', '-v', '-s', '0.5']).stdout?.match(/Created pane (\S+)/)?.[1];
      if (!id) return null;
      // `wta split-pane -c` ignores the command, so type it into the new pane once its shell is up
      sleep(1500);
      run('wtcli', ['send-keys', '-t', id, viewCmd, 'Enter']);
      return id;
    },
    close: (id) => run('wta', ['kill-pane', '-t', id]).status === 0,
  },
  tmux: {
    available: () => !!process.env.TMUX,
    open: () => run('tmux', ['split-window', '-v', '-p', '50', '-P', '-F', '#{pane_id}', viewCmd]).stdout?.trim() || null,
    close: (id) => run('tmux', ['kill-pane', '-t', id]).status === 0,
  },
  wezterm: {
    available: () => !!process.env.WEZTERM_PANE,
    open: () => run('wezterm', ['cli', 'split-pane', '--bottom', '--percent', '50', '--', 'node', VIEW]).stdout?.trim() || null,
    close: (id) => run('wezterm', ['cli', 'kill-pane', '--pane-id', id]).status === 0,
  },
};

function main() {
  if (process.argv.includes('--here')) {
    spawnSync(process.execPath, [VIEW], { stdio: 'inherit' });
    return;
  }

  // If a pane is already open, close it (toggle)
  try {
    const { backend, id } = JSON.parse(fs.readFileSync(PANE_FILE, 'utf8'));
    fs.rmSync(PANE_FILE, { force: true });
    if (BACKENDS[backend]?.close(id)) {
      console.log('Office pane closed.');
      return;
    }
  } catch {}

  const name = Object.keys(BACKENDS).find((k) => BACKENDS[k].available());
  const id = name && BACKENDS[name].open();
  if (!id) {
    console.log('Could not open a split pane automatically (supported: Windows Terminal, tmux, WezTerm).');
    console.log('Open a new terminal pane with Sixel support and run:');
    console.log(`  ${viewCmd}`);
    return;
  }
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(PANE_FILE, JSON.stringify({ backend: name, id }));
  console.log(`Office opened in a split pane (${name}). Run the command again to close it.`);
}

main();
