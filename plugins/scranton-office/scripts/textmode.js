// Text-mode renderer for terminals without Sixel (e.g. older Windows Terminal, the classic
// PowerShell console). The frame is box-filtered down to fit the pane and printed with
// half-block characters (▀), two pixels per cell. Name labels and the speech bubble are
// printed on top as real text so they stay readable at the smaller size.

const RESET = '\x1b[0m';
const rgb = (c) => `${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}`;
const hex = (s) => parseInt(s.slice(1), 16);

// Average the opaque pixels in each f×f box; a box that is mostly transparent stays transparent
function downsample(color, W, H, f) {
  const w = Math.max(1, Math.floor(W / f));
  const h = Math.max(2, Math.floor(H / f) & ~1);
  const out = new Int32Array(w * h).fill(-1);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * f), x1 = Math.max(x0 + 1, Math.floor((x + 1) * f));
      const y0 = Math.floor(y * f), y1 = Math.max(y0 + 1, Math.floor((y + 1) * f));
      let r = 0, g = 0, b = 0, n = 0, total = 0;
      for (let sy = y0; sy < y1 && sy < H; sy++)
        for (let sx = x0; sx < x1 && sx < W; sx++) {
          total++;
          const c = color[sy * W + sx];
          if (c < 0) continue;
          r += (c >> 16) & 255;
          g += (c >> 8) & 255;
          b += c & 255;
          n++;
        }
      if (n * 2 >= total && n) out[y * w + x] = (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
    }
  return { w, h, px: out };
}

// frame: { W, H, color, labels, bubble } from renderFrame(..., { overlay: true })
// Returns the image as terminal lines (without cursor positioning) and its size in cells.
function renderText(frame, maxCols, maxRows) {
  const f = Math.max(1, frame.W / maxCols, frame.H / (2 * maxRows));
  const { w, h, px } = downsample(frame.color, frame.W, frame.H, f);
  const rows = h / 2;

  // Cell grid: { ch, fg, bg, bold }; fg/bg null = terminal default
  const cells = [];
  for (let r = 0; r < rows; r++) {
    const line = [];
    for (let c = 0; c < w; c++) {
      const t = px[2 * r * w + c], u = px[(2 * r + 1) * w + c];
      if (t < 0 && u < 0) line.push({ ch: ' ', fg: null, bg: null });
      else if (t >= 0) line.push({ ch: '▀', fg: t, bg: u >= 0 ? u : null });
      else line.push({ ch: '▄', fg: u, bg: null });
    }
    cells.push(line);
  }
  const put = (r, c, ch, fg, bg, bold = false) => {
    if (r >= 0 && r < rows && c >= 0 && c < w) cells[r][c] = { ch, fg, bg, bold };
  };
  const toCell = (x, y) => [Math.floor(y / f / 2), Math.floor(x / f)];

  // Name labels with a blinking dot
  const chip = hex('#1f2430');
  for (const l of frame.labels) {
    const [r, c] = toCell(l.x, l.y);
    const text = `${l.name} `;
    const start = c - Math.floor((text.length + 1) / 2);
    [...text].forEach((ch, k) => put(r, start + k, ch, hex(l.color), chip, true));
    put(r, start + text.length, '●', l.on ? hex('#ffd866') : hex('#59606e'), chip);
  }

  // Speech bubble: white box with black text above the speaker
  if (frame.bubble) {
    const { x, y, lines } = frame.bubble;
    const [r, c] = toCell(x, y);
    const width = Math.max(...lines.map((s) => s.length)) + 2;
    const top = r - lines.length - 1;
    const left = Math.max(0, Math.min(w - width, c - Math.floor(width / 2)));
    const white = hex('#ffffff'), ink = hex('#1a1a1a');
    lines.forEach((s, i) => {
      const pad = Math.floor((width - s.length) / 2);
      for (let k = 0; k < width; k++) put(top + i, left + k, s[k - pad] && k >= pad ? s[k - pad] : ' ', ink, white, true);
    });
    put(top + lines.length, Math.max(left, Math.min(left + width - 1, c)), '▼', white, null);
  }

  // Serialize, emitting escape codes only when the style changes
  const out = cells.map((line) => {
    let s = '';
    let cur = {};
    for (const cell of line) {
      if (cell.bold !== cur.bold) s += cell.bold ? '\x1b[1m' : '\x1b[22m';
      if (cell.fg !== cur.fg) s += cell.fg === null ? '\x1b[39m' : `\x1b[38;2;${rgb(cell.fg)}m`;
      if (cell.bg !== cur.bg) s += cell.bg === null ? '\x1b[49m' : `\x1b[48;2;${rgb(cell.bg)}m`;
      s += cell.ch;
      cur = cell;
    }
    return s + RESET;
  });
  return { lines: out, cols: w, rows };
}

module.exports = { renderText };
