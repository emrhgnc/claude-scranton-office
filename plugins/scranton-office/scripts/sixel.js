// Sixel encoder: prints a color buffer (0xRRGGBB, -1 = transparent) as real pixels.
// Windows Terminal scales sixel images to a 10x20 virtual cell.

// scale: integer upscaling is done while encoding (RLE run lengths are multiplied)
function encodeSixel(color, w, h, scale = 1) {
  const index = new Int16Array(w * h);
  const palette = new Map();
  const colors = [];
  for (let i = 0; i < w * h; i++) {
    const c = color[i];
    if (c < 0) {
      index[i] = -1;
      continue;
    }
    let idx = palette.get(c);
    if (idx === undefined) {
      if (colors.length < 256) {
        idx = colors.length;
        palette.set(c, idx);
        colors.push(c);
      } else idx = nearest(colors, c);
    }
    index[i] = idx;
  }

  const W = w * scale, H = h * scale;
  // P2=1: unpainted pixels stay transparent
  const parts = [`\x1bP0;1;0q"1;1;${W};${H}`];
  colors.forEach((c, i) => {
    const pct = (v) => Math.round((v / 255) * 100);
    parts.push(`#${i};2;${pct(c >> 16)};${pct((c >> 8) & 255)};${pct(c & 255)}`);
  });

  // Per color, a 6-bit mask per source column (filled in a single pass)
  const masks = colors.map(() => new Uint8Array(w));
  const touched = new Uint8Array(colors.length);
  for (let y0 = 0; y0 < H; y0 += 6) {
    const used = [];
    for (let k = 0; k < 6 && y0 + k < H; k++) {
      const o = Math.floor((y0 + k) / scale) * w;
      for (let x = 0; x < w; x++) {
        const c = index[o + x];
        if (c < 0) continue;
        if (!touched[c]) {
          touched[c] = 1;
          used.push(c);
        }
        masks[c][x] |= 1 << k;
      }
    }
    let band = '';
    for (let u = 0; u < used.length; u++) {
      const c = used[u];
      const m = masks[c];
      if (u) band += '$';
      band += '#' + c;
      let end = w;
      while (end > 0 && m[end - 1] === 0) end--;
      let x = 0;
      while (x < end) {
        const bits = m[x];
        let run = 1;
        while (x + run < end && m[x + run] === bits) run++;
        const n = run * scale;
        const ch = String.fromCharCode(63 + bits);
        band += n > 3 ? '!' + n + ch : ch.repeat(n);
        x += run;
      }
      m.fill(0);
      touched[c] = 0;
    }
    parts.push(band + '-');
  }
  parts.push('\x1b\\');
  return parts.join('');
}

function nearest(colors, c) {
  const r = c >> 16, g = (c >> 8) & 255, b = c & 255;
  let best = 0, bd = Infinity;
  colors.forEach((k, i) => {
    const d = (r - (k >> 16)) ** 2 + (g - ((k >> 8) & 255)) ** 2 + (b - (k & 255)) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  });
  return best;
}

// Integer upscaling (keeps pixel art crisp)
function upscale(color, w, h, s) {
  if (s === 1) return color;
  const out = new Int32Array(w * s * h * s);
  for (let y = 0; y < h * s; y++) {
    const src = Math.floor(y / s) * w;
    const dst = y * w * s;
    for (let x = 0; x < w * s; x++) out[dst + x] = color[src + Math.floor(x / s)];
  }
  return out;
}

module.exports = { encodeSixel, upscale };

// Test: `node sixel.js` prints a colorful gradient box
if (require.main === module) {
  const w = 240, h = 120;
  const px = new Int32Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) px[y * w + x] = (Math.floor((x / w) * 6) * 50 << 16) | (Math.floor((y / h) * 6) * 50 << 8) | 160;
  process.stdout.write('Sixel test: if you see a colorful box below, your terminal supports Sixel.\n');
  process.stdout.write(encodeSixel(px, w, h) + '\n');
  process.stdout.write('Done.\n');
}
