// Office viewer (Sixel).
// Reads the state office-hook.js writes for every session and seats each agent
// at a desk. Usually opened in a split pane by /scranton-office:office. Quit: q / Ctrl+C.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { buildStatic, renderFrame, michaelState, SEATS, CAST } = require('./office-art');
const { encodeSixel } = require('./sixel');

const ROOT = path.join(os.homedir(), '.claude', 'scranton-office', 'state');
const STALE_MS = 6 * 3600 * 1000; // older records are treated as stale
const FPS = 6; // while Michael walks; otherwise every other frame is drawn
// Cell size in pixels for Sixel scaling. Windows Terminal uses a 10x20 virtual cell;
// other terminals (WezTerm, iTerm2, foot...) are asked for the real size with CSI 16 t.
let CELL_W = 10, CELL_H = 20;
// The image is drawn fully opaque on the terminal's own background color, so every frame
// overwrites the previous one completely and the screen never has to be cleared (no flicker).
// Override with SCRANTON_BG=#rrggbb if the detected color is off.
let BG = 0x0c0c0c;

// Send a terminal query and wait briefly for a reply matching `re`
function queryTerminal(seq, re, ms = 300) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) return resolve(null);
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      const m = buf.match(re);
      if (m) done(m);
    };
    const done = (m) => {
      process.stdin.off('data', onData);
      clearTimeout(timer);
      resolve(m);
    };
    const timer = setTimeout(() => done(null), ms);
    process.stdin.on('data', onData);
    process.stdout.write(seq);
  });
}

async function detectTerminal() {
  if (!process.env.WT_SESSION) {
    const m = await queryTerminal('\x1b[16t', /\x1b\[6;(\d+);(\d+)t/);
    if (m) {
      CELL_H = Number(m[1]) || CELL_H;
      CELL_W = Number(m[2]) || CELL_W;
    }
  }
  const env = /^#?([0-9a-f]{6})$/i.exec(process.env.SCRANTON_BG || '');
  if (env) {
    BG = parseInt(env[1], 16);
    return;
  }
  // OSC 11 reply: rgb:RRRR/GGGG/BBBB (1-4 hex digits per channel)
  const m = await queryTerminal('\x1b]11;?\x1b\\', /\]11;rgb:([0-9a-f]{1,4})\/([0-9a-f]{1,4})\/([0-9a-f]{1,4})/i);
  if (m) {
    const ch = (h) => Math.round((parseInt(h, 16) / (16 ** h.length - 1)) * 255);
    BG = (ch(m[1]) << 16) | (ch(m[2]) << 8) | ch(m[3]);
  }
}

// --- State and seat assignment -------------------------------------------------
function readWorkers() {
  const now = Date.now();
  const out = [];
  let sessions = [];
  try {
    sessions = fs.readdirSync(ROOT);
  } catch {}
  for (const s of sessions) {
    const dir = path.join(ROOT, s);
    try {
      const st = fs.statSync(path.join(dir, 'busy'));
      if (now - st.mtimeMs < STALE_MS) out.push({ key: `main:${s}`, main: true, session: s, type: 'main agent', t: st.mtimeMs });
    } catch {}
    let files = [];
    try {
      files = fs.readdirSync(path.join(dir, 'agents'));
    } catch {}
    for (const f of files) {
      try {
        const p = path.join(dir, 'agents', f);
        const st = fs.statSync(p);
        if (now - st.mtimeMs < STALE_MS)
          out.push({ key: `agent:${s}:${f}`, main: false, session: s, type: fs.readFileSync(p, 'utf8') || 'agent', t: st.mtimeMs });
      } catch {}
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// Seats are sticky: nobody moves when someone else leaves
const seatOf = new Map();
function assignSeats(workers) {
  const live = new Set(workers.map((w) => w.key));
  for (const k of [...seatOf.keys()]) if (!live.has(k)) seatOf.delete(k);
  const used = new Set(seatOf.values());
  // Michael's desk (ambient) is never assigned; the main agent prefers Jim's desk
  const jim = SEATS.findIndex((s) => s.who === 'Jim');
  const desks = SEATS.map((_, i) => i).filter((i) => !SEATS[i].ambient && i !== jim);
  let waiting = 0;
  for (const w of workers) {
    if (seatOf.has(w.key)) continue;
    const order = w.main ? [jim, ...desks] : [...desks, jim];
    const free = order.find((i) => !used.has(i));
    if (free === undefined) {
      waiting++;
      continue;
    }
    seatOf.set(w.key, free);
    used.add(free);
  }
  return waiting;
}

// --- Terminal output ------------------------------------------------------------
const RESET = '\x1b[0m';
const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(';');
const fg = (h) => `\x1b[38;2;${rgb(h)}m`;
const bg = (h) => `\x1b[48;2;${rgb(h)}m`;

function pickScale(W, H, cols, rows) {
  // Title + image + 2 legend rows must fit
  let s = 1;
  for (let k = 2; k <= 4; k++) if ((W * k) / CELL_W <= cols && 1 + Math.ceil((H * k) / CELL_H) + 2 <= rows) s = k;
  return s;
}

async function main() {
  const out = process.stdout;
  const base = buildStatic();
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J');
  const restore = () => {
    out.write('\x1b[2J\x1b[?25h\x1b[?1049l');
    process.exit(0);
  };
  process.on('SIGINT', restore);
  process.on('SIGTERM', restore);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.on('data', (d) => {
      const k = d.toString();
      if (k === 'q' || k === '\x03') restore();
    });
  }
  await detectTerminal();

  let tick = 0;
  let lastSig = '';
  let lastSize = '';
  let lastLegendEnd = 0;
  const draw = (force) => {
    const workers = readWorkers();
    const waiting = assignSeats(workers);
    const occupied = new Map();
    for (const w of workers) if (seatOf.has(w.key)) occupied.set(seatOf.get(w.key), w);

    const cols = out.columns || 120, rows = out.rows || 40;
    const size = `${cols}x${rows}`;
    const michael = michaelState(Date.now()).mode;
    const sig = [...occupied.keys()].sort().join(',') + `|${waiting}|${michael}`;
    // Unless Michael is walking, 3 fps is enough
    if (!force && michael !== 'walk' && tick % 2) {
      tick++;
      return;
    }
    // Skip the redraw when nobody works, Michael is sitting and nothing changed
    if (!force && !occupied.size && michael === 'sit' && sig === lastSig && size === lastSize) return;
    // Only a resize needs a full clear; frames are opaque and overwrite each other
    if (size !== lastSize) out.write('\x1b[2J');
    lastSig = sig;
    lastSize = size;

    const frame = renderFrame(base, occupied, Math.floor(tick++ / 2));
    for (let i = 0; i < frame.color.length; i++) if (frame.color[i] < 0) frame.color[i] = BG;
    const s = pickScale(frame.W, frame.H, cols, rows);
    const imgCols = Math.ceil((frame.W * s) / CELL_W);
    const imgRows = Math.ceil((frame.H * s) / CELL_H);
    const left = Math.max(1, Math.floor((cols - imgCols) / 2) + 1);
    const sixel = encodeSixel(frame.color, frame.W, frame.H, s);

    const sessions = new Set(workers.map((w) => w.session));
    const head =
      `\x1b[1m${fg('#f2f2f2')}${bg('#2c5aa0')} DUNDER MIFFLIN ${RESET}${fg('#9aa5b1')} Scranton · ` +
      (workers.length ? `${workers.length} at work · ${sessions.size} session${sessions.size > 1 ? 's' : ''}` : 'all quiet, no agents at work') +
      `   ${fg('#59606e')}q: quit${RESET}`;

    const legend = [...occupied]
      .sort((a, b) => a[0] - b[0])
      .map(([i, w]) => {
        const who = SEATS[i].who;
        const sess = sessions.size > 1 ? ` [${w.session.slice(0, 4)}]` : '';
        return `${fg(CAST[who].shirt)}■ ${who}${RESET}${fg('#9aa5b1')} ${w.type}${sess}${RESET}`;
      });
    if (waiting) legend.push(`${fg('#9aa5b1')}+${waiting} waiting for a desk${RESET}`);

    let buf = `\x1b[1;${left}H${head}\x1b[K\x1b[2;${left}H${sixel}`;
    const per = Math.max(1, Math.floor(imgCols / 26));
    let r = 2 + imgRows;
    for (let k = 0; k < legend.length && r <= rows; k += per, r++)
      buf += `\x1b[${r};1H\x1b[2K\x1b[${r};${left}H${legend.slice(k, k + per).join('   ')}`;
    // Erase legend rows left over from a longer legend in the previous frame
    for (let q = r; q < lastLegendEnd && q <= rows; q++) buf += `\x1b[${q};1H\x1b[2K`;
    lastLegendEnd = r;
    out.write(buf);
  };

  out.on('resize', () => draw(true));
  draw(true);
  setInterval(() => draw(false), 1000 / FPS);
}

if (require.main === module) main();
