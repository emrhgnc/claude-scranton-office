// The Scranton branch office: isometric pixel art built from small voxels.
// The layout follows the show's floor plan (1 unit ≈ 12 cm). The camera looks from the plan's bottom-right
// corner: the top of the plan (conference room) is at the back, accounting is in front.
// The static scene (floor, walls, furniture) is rasterized once; each frame only adds
// monitor screens, character sprites, name labels and speech bubbles.

// --- Color helpers ----------------------------------------------------------
const hex = (s) => parseInt(s.slice(1), 16);
const mul = (c, f) =>
  (Math.min(255, Math.round(((c >> 16) & 255) * f)) << 16) |
  (Math.min(255, Math.round(((c >> 8) & 255) * f)) << 8) |
  Math.min(255, Math.round((c & 255) * f));
const mix = (a, b, t) =>
  (Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t) << 16) |
  (Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t) << 8) |
  Math.round((a & 255) * (1 - t) + (b & 255) * t);

const C = {
  carpet: hex('#7b7c82'),
  carpetSeam: hex('#727379'),
  slab: hex('#3b3946'),
  wallBack: hex('#e4dcc6'),
  wallLeft: hex('#cfc6ad'),
  wallCap: hex('#6f6a60'),
  baseboard: hex('#5d5850'),
  knee: hex('#d9d2bd'),
  wood: hex('#c99a5e'),
  woodDark: hex('#9a7044'),
  michaelDesk: hex('#c8682f'),
  partition: hex('#eceae4'),
  monitor: hex('#26272c'),
  screenOff: hex('#16222c'),
  keyboard: hex('#d6d3cc'),
  paper: hex('#f6f4ee'),
  chair: hex('#2f3138'),
  confChair: hex('#4a3328'),
  metal: hex('#55586a'),
  cabinet: hex('#a4a8ae'),
  glass: hex('#c4e2ee'),
  blind: hex('#eef0ec'),
  frame: hex('#4c4f58'),
  outline: hex('#231f2b'),
  plant: hex('#3f8f4a'),
  plantLight: hex('#62b85a'),
  pot: hex('#8a5a36'),
  couch: hex('#b8a48a'),
  green: hex('#4caf50'),
};

// --- Voxel world ----------------------------------------------------------------
const MAT = { none: 0, floor: 1, wallBack: 2, wallLeft: 3, other: 4, screen: 100 };
const key = (x, y, z) => ((x + 16) * 256 + (y + 16)) * 64 + (z + 4);

class World {
  constructor() {
    this.v = new Map();
  }
  // opts: left/right/top face colors, matL/matR/matT materials, alpha (glass)
  put(x, y, z, col, opts = {}) {
    this.v.set(key(x, y, z), {
      x, y, z,
      top: opts.top ?? col,
      left: opts.left ?? mul(col, 0.88),
      right: opts.right ?? mul(col, 0.72),
      matT: opts.matT ?? opts.mat ?? MAT.other,
      matL: opts.matL ?? opts.mat ?? MAT.other,
      matR: opts.matR ?? opts.mat ?? MAT.other,
      alpha: opts.alpha,
    });
  }
  box(x0, y0, z0, x1, y1, z1, col, opts) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++)
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++)
        for (let z = z0; z <= z1; z++)
          this.put(x, y, z, typeof col === 'function' ? col(x, y, z) : col, typeof opts === 'function' ? opts(x, y, z) : opts);
  }
  solid(x, y, z) {
    const v = this.v.get(key(x, y, z));
    return v && v.alpha === undefined;
  }
}

// --- Room size -------------------------------------------------------------------
const XN = 96;
const YN = 99;
const WALL_H = 22;

// --- Seating (chairs from the floor plan) --------------------------------------
// face: the direction the person looks. +x/+y face the viewer, -x/-y show their back.
// Michael's desk is never given to an agent (ambient). The main agent sits at Jim's desk,
// subagents take the other desks in list order.
const SEATS = [
  { who: 'Michael', cx: 7, cy: 65, face: '+x', ambient: true },
  { who: 'Dwight', cx: 59, cy: 46, face: '+y' },
  { who: 'Jim', cx: 44, cy: 55, face: '+x' },
  { who: 'Pam', cx: 57, cy: 90, face: '-y' },
  { who: 'Stanley', cx: 59, cy: 15, face: '+y' },
  { who: 'Phyllis', cx: 59, cy: 36, face: '-y' },
  { who: 'Angela', cx: 74, cy: 84, face: '+x' },
  { who: 'Oscar', cx: 83, cy: 72, face: '+y' },
  { who: 'Kevin', cx: 92, cy: 84, face: '-x' },
  { who: 'Andy', cx: 44, cy: 25, face: '+x' },
  { who: 'Creed', cx: 88, cy: 36, face: '+y' },
  { who: 'Meredith', cx: 88, cy: 56, face: '-y' },
  { who: 'Ryan', cx: 56, cy: 66, face: '-y' },
  { who: 'Toby', cx: 90, cy: 16, face: '-x' },
];
const DIR = { '+x': [1, 0], '-x': [-1, 0], '+y': [0, 1], '-y': [0, -1] };
const facesViewer = (f) => f === '+x' || f === '+y';

// Rectangular desk block, top at z=6: legs at the corners, panels on the outer edges
function deskBlock(w, x0, y0, x1, y1, col = C.wood) {
  w.box(x0, y0, 6, x1, y1, 6, col, { top: mul(col, 1.06) });
  for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) w.box(x, y, 1, x, y, 5, mul(col, 0.7));
  w.box(x0 + 1, y1, 2, x1 - 1, y1, 5, mul(col, 0.78));
  w.box(x1, y0 + 1, 2, x1, y1 - 1, 5, mul(col, 0.78));
  // Drawer pedestal
  w.box(x1 - 3, y1 - 3, 1, x1 - 1, y1 - 1, 5, C.partition, (x, y, z) => (z === 3 ? { left: mul(C.partition, 0.75), right: mul(C.partition, 0.65) } : {}));
}

// White privacy divider on top of a desk block
function divider(w, x0, y0, x1, y1) {
  w.box(x0, y0, 7, x1, y1, 9, C.partition, { top: mul(C.partition, 0.92) });
}

// Per person: flat monitor, keyboard, chair and a few desk items
function workplace(w, s, i) {
  const [dx, dy] = DIR[s.face];
  const px = dy !== 0 ? 1 : 0, py = dx !== 0 ? 1 : 0; // axis perpendicular to the facing direction
  const { cx, cy } = s;

  // Monitor: 5 units in front of the person, screen facing them
  const mx = cx + dx * 5, my = cy + dy * 5;
  w.put(mx, my, 7, C.monitor);
  for (let k = -2; k <= 1; k++)
    for (let z = 8; z <= 10; z++) {
      const x = mx + px * k, y = my + py * k;
      const inner = k > -2 && k < 1 && z === 9;
      // Tag the screen face as a screen material when it faces the viewer (+x/+y normal)
      const screenOn = inner || (z >= 8 && z <= 10 && k >= -2 && k <= 1);
      if (s.face === '-y' && screenOn) w.put(x, y, z, C.monitor, { left: C.screenOff, matL: MAT.screen + i });
      else if (s.face === '-x' && screenOn) w.put(x, y, z, C.monitor, { right: C.screenOff, matR: MAT.screen + i });
      else w.put(x, y, z, C.monitor);
    }
  // Keyboard and desk items
  for (let k = -1; k <= 1; k++) w.put(cx + dx * 3 + px * k, cy + dy * 3 + py * k, 7, C.keyboard);
  w.box(cx + dx * 4 + px * 3, cy + dy * 4 + py * 3, 7, cx + dx * 4 + px * 4, cy + dy * 4 + py * 4, 7, C.paper);
  w.box(cx + dx * 3 - px * 3, cy + dy * 3 - py * 3, 7, cx + dx * 3 - px * 3, cy + dy * 3 - py * 3, 8, hex('#e8e4dc'));

  // Chair: backrest behind the person, kept low when their back faces the viewer
  const chair = s.who === 'Michael' ? hex('#1f1f22') : C.chair;
  w.box(cx - 1, cy - 1, 3, cx + 1, cy + 1, 3, chair);
  w.put(cx, cy, 1, C.metal);
  w.put(cx, cy, 2, C.metal);
  const top = facesViewer(s.face) ? 9 : 6;
  for (let k = -1; k <= 1; k++) w.box(cx - dx * 2 + px * k, cy - dy * 2 + py * k, 4, cx - dx * 2 + px * k, cy - dy * 2 + py * k, top, chair);
}

// Interior wall: knee wall + glass with blinds + top rail; door: [a, b] opening
function innerWall(w, axis, fixed, from, to, door) {
  for (let t = from; t <= to; t++) {
    if (door && t >= door[0] && t <= door[1]) continue;
    const [x, y] = axis === 'x' ? [t, fixed] : [fixed, t];
    const post = (t - from) % 8 === 0 || t === to || (door && (t === door[0] - 1 || t === door[1] + 1));
    for (let z = 1; z <= 14; z++) {
      if (z <= 3 || z === 14 || post) w.put(x, y, z, z <= 3 ? C.knee : C.frame, { top: z <= 3 ? mul(C.knee, 0.9) : C.frame });
      else w.put(x, y, z, z % 2 ? C.glass : C.blind, { alpha: z % 2 ? 0.2 : 0.38 });
    }
  }
}

function plant(w, x, y, big = false) {
  const r = big ? 2 : 1;
  w.box(x - r, y - r, 1, x + r, y + r, 3, C.pot);
  const h = big ? 11 : 8;
  for (let z = 4; z <= h; z++) {
    const rad = big ? (z < 8 ? 3 : z < 10 ? 2 : 1) : z < 7 ? 2 : 1;
    for (let ax = -rad; ax <= rad; ax++)
      for (let ay = -rad; ay <= rad; ay++)
        if (Math.abs(ax) + Math.abs(ay) <= rad + ((x * 7 + ay * 3 + z) % 2)) w.put(x + ax, y + ay, z, (ax + ay + z) % 3 ? C.plant : C.plantLight);
  }
}

function buildWorld() {
  const w = new World();

  // Outer walls (back: y<0, left: x<0)
  for (let z = 1; z <= WALL_H; z++) {
    const base = z <= 1;
    for (let x = -2; x < XN; x++)
      for (const y of [-2, -1]) w.put(x, y, z, base ? C.baseboard : C.wallBack, { top: C.wallCap, left: base ? C.baseboard : C.wallBack, matL: base ? MAT.other : MAT.wallBack });
    for (let y = 0; y < YN; y++)
      for (const x of [-2, -1]) w.put(x, y, z, base ? C.baseboard : C.wallLeft, { top: C.wallCap, right: base ? mul(C.baseboard, 0.85) : C.wallLeft, matR: base ? MAT.other : MAT.wallLeft });
  }

  // --- Conference room (top left) ---
  innerWall(w, 'y', 30, 0, 47, [41, 46]); // bullpen side, with blinds
  innerWall(w, 'x', 48, 0, 30); // shared with Michael's office
  for (const y of [4, 9, 14, 19, 24, 29])
    for (const x of [8, 13, 18])
      if (!(y === 29 && x === 18)) {
        w.box(x, y, 1, x + 2, y + 2, 3, C.confChair);
        w.box(x, y - 1, 4, x + 2, y - 1, 6, C.confChair);
      }
  for (const y of [8, 14, 20, 26]) {
    w.box(25, y, 1, 27, y + 2, 3, C.confChair);
    w.box(28, y, 4, 28, y + 2, 6, C.confChair);
  }
  w.box(4, 38, 1, 11, 41, 3, hex('#9a9da3')); // couch
  w.box(4, 37, 4, 11, 37, 6, hex('#9a9da3'));
  plant(w, 4, 3, true);
  plant(w, 27, 4);

  // --- Michael's office (bottom left) ---
  innerWall(w, 'y', 30, 49, 81, [76, 80]);
  innerWall(w, 'x', 82, 0, 30);
  deskBlock(w, 10, 58, 15, 71, C.michaelDesk);
  w.box(13, 59, 7, 13, 60, 8, hex('#f4f4f4')); // "World's Best Boss" mug
  w.box(11, 69, 7, 12, 70, 7, C.paper);
  w.box(25, 66, 1, 27, 68, 3, C.chair); // guest chairs
  w.box(28, 66, 4, 28, 68, 7, C.chair);
  w.box(25, 72, 1, 27, 74, 3, C.chair);
  w.box(28, 72, 4, 28, 74, 7, C.chair);
  w.box(5, 51, 1, 9, 54, 5, C.woodDark); // small side table
  w.box(8, 78, 1, 27, 79, 4, C.woodDark); // low bookshelf
  w.box(20, 78, 5, 20, 78, 7, hex('#e2b93b')); // Dundie
  w.box(23, 78, 5, 24, 79, 6, hex('#3b6fc0')); // globe
  plant(w, 3, 77, true);

  // Long mail shelf between the conference room and the bullpen
  w.box(31, 7, 1, 34, 34, 8, C.wood, { top: mul(C.wood, 1.06) });
  w.box(32, 17, 9, 33, 19, 10, C.green);
  w.box(35, 11, 1, 38, 15, 4, hex('#d9d6cf')); // small white cabinet

  // --- Stanley / Phyllis / Andy desks ---
  deskBlock(w, 47, 19, 65, 31);
  divider(w, 53, 25, 65, 25);
  divider(w, 53, 19, 53, 31);
  w.box(66, 26, 1, 68, 30, 7, C.cabinet); // side cabinet
  w.box(66, 31, 1, 68, 35, 4, hex('#4fb3a8'));

  // --- Jim / Dwight / Ryan desks ---
  deskBlock(w, 47, 49, 65, 62);
  divider(w, 53, 55, 65, 55);
  divider(w, 53, 49, 53, 62);
  w.box(57, 51, 7, 58, 52, 8, hex('#f2d14a'), { alpha: 0.7 }); // Jim's prank: stapler in Jell-O
  w.box(67, 49, 1, 69, 57, 7, hex('#dfe2e6')); // side cabinet
  plant(w, 70, 60, true);
  w.box(40, 62, 1, 42, 64, 3, C.chair); // spare chair
  w.box(40, 61, 4, 42, 61, 7, C.chair);

  // --- Creed / Meredith desks (right) ---
  deskBlock(w, 80, 40, 95, 51);
  divider(w, 82, 45, 95, 45);
  w.box(80, 40, 7, 82, 43, 9, hex('#e6e8ea')); // printer
  w.box(81, 52, 1, 82, 53, 4, C.green);

  // --- Toby's glass office (top right) ---
  innerWall(w, 'y', 73, 9, 28);
  innerWall(w, 'x', 28, 73, 90, [84, 90]);
  deskBlock(w, 80, 9, 85, 23);
  w.box(87, 2, 1, 89, 4, 6, hex('#3a3a3a'));

  // --- Pam's curved reception desk ---
  for (let x = 40; x <= 62; x++)
    for (let y = 70; y <= 92; y++) {
      const d = Math.hypot(x - 58, y - 92);
      const ang = Math.atan2(y - 92, x - 58);
      if (d >= 9 && d <= 13 && ang <= -Math.PI / 2 + 0.25 && ang >= -Math.PI + 0.05) {
        const front = d > 12;
        for (let z = 1; z <= (front ? 8 : 6); z++) w.put(x, y, z, z === 6 || (front && z === 8) ? C.wood : mul(C.wood, 0.8), { top: mul(C.wood, 1.08) });
      }
    }
  w.box(48, 81, 9, 49, 82, 9, hex('#e05a5a')); // candy bowl

  // --- Accounting (bottom right) ---
  deskBlock(w, 77, 77, 89, 90);
  divider(w, 83, 77, 83, 90);
  w.box(63, 73, 1, 67, 93, 9, hex('#c8ccd2'), (x, y, z) => (z % 3 === 0 ? { left: hex('#9aa0a8'), right: hex('#8a9098') } : {})); // filing shelves
  w.box(63, 69, 1, 71, 72, 8, hex('#e8eaec'), { top: hex('#b8bcc2') }); // copier
  w.box(70, 94, 1, 95, 97, 5, hex('#e6e2d8')); // low cabinets
  w.box(84, 92, 1, 86, 93, 3, hex('#3a8fb8'));

  // --- Entrance: couch and plant ---
  w.box(24, 93, 1, 37, 97, 3, C.couch);
  w.box(24, 97, 4, 37, 97, 7, C.couch);
  w.box(24, 93, 4, 24, 96, 5, C.couch);
  w.box(37, 93, 4, 37, 96, 5, C.couch);
  w.box(39, 94, 1, 42, 97, 4, C.woodDark);
  plant(w, 33, 86);

  // Workplaces
  SEATS.forEach((s, i) => workplace(w, s, i));

  // Floor: carpet tiles with soft contact shadows around furniture
  for (let x = 0; x < XN; x++)
    for (let y = 0; y < YN; y++) {
      const seam = x % 8 === 0 || y % 8 === 0;
      let c = seam ? C.carpetSeam : C.carpet;
      let shadow = 0;
      for (let k = 1; k <= 4; k++) if (w.solid(x - k, y, k) || w.solid(x, y - k, k)) shadow++;
      if (w.solid(x - 1, y, 1) || w.solid(x, y - 1, 1)) shadow++;
      if (shadow) c = mul(c, Math.max(0.72, 1 - shadow * 0.07));
      w.put(x, y, 0, c, { mat: MAT.floor, left: C.slab, right: mul(C.slab, 0.8) });
      w.put(x, y, -1, C.slab, { left: C.slab, right: mul(C.slab, 0.8) });
    }
  return w;
}

// --- Rasterization --------------------------------------------------------------
const CUBE = [
  [0, 1, 1, 0],
  [1, 1, 1, 1],
  [2, 2, 3, 3],
  [2, 2, 3, 3],
]; // 1 top, 2 left (+y), 3 right (+x)

const project = (x, y, z) => [2 * (x - y), x + y - 2 * z];

function rasterWorld(w) {
  const vox = [...w.v.values()].filter((v) => !(w.solid(v.x + 1, v.y, v.z) && w.solid(v.x, v.y + 1, v.z) && w.solid(v.x, v.y, v.z + 1)));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const v of vox) {
    const [sx, sy] = project(v.x, v.y, v.z);
    minX = Math.min(minX, sx);
    maxX = Math.max(maxX, sx + 3);
    minY = Math.min(minY, sy);
    maxY = Math.max(maxY, sy + 3);
  }
  const PAD = 14; // headroom for labels
  const W = maxX - minX + 1, H = maxY - minY + 1 + PAD;
  const ox = -minX, oy = -minY + PAD;
  const color = new Int32Array(W * H).fill(-1);
  const depth = new Float32Array(W * H).fill(-1e9);
  const mat = new Int16Array(W * H);
  // Nearest glass surface per pixel: sprites behind it get tinted by the glass
  const glassDepth = new Float32Array(W * H).fill(-1e9);
  const glassCol = new Int32Array(W * H);
  const glassA = new Float32Array(W * H);

  vox.sort((a, b) => a.x + a.y + a.z - (b.x + b.y + b.z) || a.z - b.z);
  for (const v of vox) {
    const [sx, sy] = project(v.x, v.y, v.z);
    const d = v.x + v.y + v.z;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < 4; c++) {
        const f = CUBE[r][c];
        if (!f) continue;
        const i = (sy + oy + r) * W + sx + ox + c;
        const col = f === 1 ? v.top : f === 2 ? v.left : v.right;
        if (v.alpha !== undefined) {
          color[i] = color[i] < 0 ? col : mix(color[i], col, v.alpha);
          glassDepth[i] = d;
          glassCol[i] = col;
          glassA[i] = v.alpha;
          continue;
        }
        color[i] = col;
        depth[i] = d;
        mat[i] = f === 1 ? v.matT : f === 2 ? v.matL : v.matR;
        if (d >= glassDepth[i]) glassDepth[i] = -1e9;
      }
  }
  return { W, H, ox, oy, color, depth, mat, glassDepth, glassCol, glassA };
}

// --- Wall decals (bitmaps sheared onto the wall planes) ---------------------
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
  P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', ' ': '000000000000000', '!': '010010010000010', '?': '110001010000010', ',': '000000000010100', "'": '010010000000000', '.': '000000000000010', '-': '000000111000000',
  0: '111101101101111', 1: '010110010010111', 2: '110001010100111', 3: '110001010001110', 4: '101101111001001',
  5: '111100110001110', 6: '011100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001110',
};

// Render text as rows of "ink"/"paper" characters
function textRows(text, ink = '#', paper = '.') {
  const chars = [...text.toUpperCase()].map((ch) => FONT[ch] || FONT[' ']);
  const rows = [];
  for (let r = 0; r < 5; r++) rows.push(chars.map((g) => [...g.slice(r * 3, r * 3 + 3)].map((b) => (b === '1' ? ink : paper)).join('') + paper).join(''));
  return rows;
}

function framed(rows, border, fill) {
  const w = rows[0].length + 4;
  const line = border.repeat(w);
  const pad = border + fill.repeat(w - 2) + border;
  return [line, pad, ...rows.map((r) => border + fill + r + fill + border), pad, line];
}

// plane 'back': the y=0 plane, u -> +x;  plane 'left': the x=0 plane, u -> +y
function decal(img, plane, a0, ztop, rows, palette, scale = 1) {
  const { W, H, ox, oy, color, mat } = img;
  const want = plane === 'back' ? MAT.wallBack : MAT.wallLeft;
  for (let py = 0; py < H; py++)
    for (let px = 0; px < W; px++) {
      const i = py * W + px;
      if (mat[i] !== want) continue;
      const X = px - ox, Y = py - oy;
      let u, v;
      if (plane === 'back') {
        u = Math.floor((X - 2 * a0) / scale);
        v = Math.floor((2 * ztop - X / 2 + Y) / scale);
      } else {
        u = Math.floor((-X - 2 * a0) / scale);
        v = Math.floor((2 * ztop + X / 2 + Y) / scale);
      }
      if (v < 0 || v >= rows.length || u < 0 || u >= rows[0].length) continue;
      const ch = rows[v][u];
      if (palette[ch] !== undefined) color[i] = palette[ch];
    }
}

function blindsWindow(len, h = 14) {
  const rows = [];
  for (let r = 0; r < h; r++) {
    let row = '';
    for (let c = 0; c < len; c++) {
      const edge = r === 0 || r === h - 1 || c === 0 || c === len - 1 || c === Math.floor(len / 2);
      row += edge ? 'f' : r % 2 ? 's' : 'l';
    }
    rows.push(row);
  }
  return rows;
}

function decorateWalls(img) {
  const winPal = { f: hex('#f0ece2'), s: hex('#a9d4ec'), l: hex('#dfeaf0') };
  // Back wall: the company sign above the bullpen, conference whiteboard, doors
  decal(img, 'back', 34, 22, framed(textRows('Dunder Mifflin'), 'k', 'w'), { k: hex('#1d1d24'), w: hex('#f7f5ef'), '#': hex('#1d1d24') }, 2);
  const board = ['kkkkkkkkkkkkkkkkkk', 'kwwwwwwwwwwwwwwwwk', 'kwbbwwwrrrwwwwbbwk', 'kwwwbbbwwwwbbwwwwk', 'kwwwwwwwwrrwwwwwwk', 'kwbbbwwwwwwwbbbwwk', 'kwwwwwwwwwwwwwwwwk', 'kkkkkkkkkkkkkkkkkk'];
  decal(img, 'back', 9, 17, board, { k: hex('#7c838c'), w: hex('#f5f7f8'), b: hex('#3b6fc0'), r: hex('#c0403b') });
  const door = [];
  for (let r = 0; r < 24; r++) door.push(r === 0 ? 'kkkkkkkkkk' : r === 12 ? 'kddddddhdk' : 'kddddddddk');
  decal(img, 'back', 38, 12, door, { k: hex('#3e3e44'), d: hex('#8c8f96'), h: hex('#e0e0e0') });
  decal(img, 'back', 76, 12, door, { k: hex('#3e3e44'), d: hex('#8c8f96'), h: hex('#e0e0e0') });

  // Left wall: windows with blinds in the conference room and Michael's office, entrance door
  decal(img, 'left', 6, 18, blindsWindow(14), winPal);
  decal(img, 'left', 26, 18, blindsWindow(14), winPal);
  decal(img, 'left', 54, 18, blindsWindow(20), winPal);
  const entrance = [];
  for (let r = 0; r < 26; r++) entrance.push(r === 0 ? 'kkkkkkkkkkkkkkkk' : r === 13 ? 'kgggggghhgggggggk'.slice(0, 16) : 'kggggggkkggggggk');
  decal(img, 'left', 86, 14, entrance, { k: hex('#3e3e44'), g: hex('#b9dcea'), h: hex('#d0d0d0') });
}

// --- Outlines (darken silhouette edges) ---------------------------------------
function outline(img) {
  const { W, H, color, depth } = img;
  const src = Int32Array.from(color);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (src[i] < 0) continue;
      const d = depth[i];
      let edge = false;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (src[j] < 0 || depth[j] < d - 6) {
          edge = true;
          break;
        }
      }
      if (edge) color[i] = mix(src[i], C.outline, 0.55);
    }
}

// --- Characters ----------------------------------------------------------------
// hair: color, or null = bald; balding/long/bun/tall/part: hairstyle; glasses/stache/tie/jacket: extras
const CAST = {
  Michael: { hair: '#2e2018', skin: '#e8b896', shirt: '#f0f0f0', tie: '#2c3e66', jacket: '#2b2f3a', pants: '#2b2f3a' },
  Dwight: { hair: '#6b4a2a', skin: '#f0c8a0', shirt: '#d9b84a', tie: '#5a3e22', glasses: true, part: true },
  Jim: { hair: '#6b4a2f', skin: '#edc29c', shirt: '#a8cbe8', tie: '#2c3e66', tall: true },
  Pam: { hair: '#b0603a', skin: '#f2c9a5', shirt: '#e8a5b5', long: true },
  Stanley: { hair: null, skin: '#6b4630', shirt: '#c0d4e4', tie: '#7a2e2e', stache: '#a0a0a0', glasses: true },
  Phyllis: { hair: '#a08060', skin: '#f0c8a8', shirt: '#78a8a0', long: true },
  Angela: { hair: '#ecd67e', skin: '#f5d5b8', shirt: '#cbb99e', bun: true },
  Oscar: { hair: '#222222', skin: '#c69468', shirt: '#6082a8', tie: '#2a2a2a', stache: '#222222' },
  Kevin: { hair: '#8a6a4a', balding: true, skin: '#e8b48e', shirt: '#7fa070', tie: '#4a5a3a' },
  Andy: { hair: '#8a5a3a', skin: '#f0c8a0', shirt: '#b5403a' },
  Creed: { hair: '#dcdcdc', skin: '#e8c0a0', shirt: '#6b6b55' },
  Meredith: { hair: '#c0502a', skin: '#f0c0a0', shirt: '#7a5aa0', long: true },
  Ryan: { hair: '#2a1d14', skin: '#e8c09a', shirt: '#3a3a3a', tie: '#888888' },
  Toby: { hair: '#6b5a4a', skin: '#e8c09a', shirt: '#a8a8a8', tie: '#5a5a5a' },
};

const FRONT = [
  '...HHHH...',
  '..HHHHHH..',
  '.HHHHHHHH.',
  '.HSSSSSSH.',
  '.SSSSSSSS.',
  '.SSESSESS.',
  '.SSSSSSSS.',
  '..SSMMSS..',
  '...SSSS...',
  '....SS....',
  '..CWWWWC..',
  '.CCCTTCCC.',
  'CCCCTTCCCC',
  'CCCCTTCCCC',
  'CCCCTTCCCC',
  'SCCCCCCCCS',
];
const BACK = [
  '...HHHH...',
  '..HHHHHH..',
  '.HHHHHHHH.',
  '.HHHHHHHH.',
  '.HHHHHHHH.',
  'SHHHHHHHHS',
  '.HHHHHHHH.',
  '..HHHHHH..',
  '...SSSS...',
  '....SS....',
  '..CCCCCC..',
  '.CCCCCCCC.',
  'CCCCCCCCCC',
  'CCCCCCCCCC',
  'CCCCCCCCCC',
  'SCCCCCCCCS',
];

// Standing person: head + torso + trousers + shoes; step: 0 standing, 1/2 walking
function standingSprite(name, front, step) {
  const body = personSprite(name, front, false, true);
  const p = CAST[name];
  const legs = {
    0: ['.LLLLLLLL.', '..LL..LL..', '..LL..LL..', '..LL..LL..', '..KK..KK..'],
    1: ['.LLLLLLLL.', '..LL..LL..', '.LL....LL.', '.LL....LL.', '.KK....KK.'],
    2: ['.LLLLLLLL.', '...LLLL...', '...LLLL...', '...LLLL...', '...KKKK...'],
  }[step];
  const pants = hex(p.pants || '#3a3f4c');
  const extra = legs.map((r) => [...r].map((ch) => (ch === 'L' ? pants : ch === 'K' ? hex('#1c1c1c') : -1)));
  // Arms swing with each step
  if (step) {
    const n = body.length;
    const skin = hex(p.skin);
    if (step === 1) body[n - 1][0] = skin;
    else body[n - 1][9] = skin;
  }
  return [...body, ...extra];
}

// Michael leaves his office through its door, then heads to the person he wants to talk to
const EXIT = [[7, 65], [7, 74], [26, 75], [31, 78], [37, 72]];
const ROUTES = {
  Jim: [...EXIT, [35, 53]],
  Dwight: [...EXIT, [37, 42], [65, 43]],
  Oscar: [...EXIT, [52, 70], [62, 66], [74, 66], [77, 71]],
  Toby: [...EXIT, [37, 42], [70, 40], [78, 31], [87, 30], [87, 21]],
};
const QUOTES = [
  { to: 'Jim', lines: ["THAT'S WHAT", 'SHE SAID!'] },
  { to: 'Toby', lines: ['WHY ARE YOU', 'THE WAY THAT', 'YOU ARE?'] },
  { to: 'Oscar', lines: ['I DECLARE', 'BANKRUPTCY!'] },
  { to: 'Dwight', lines: ['BOOM!', 'ROASTED.'] },
  { to: 'Jim', lines: ["I'M NOT", 'SUPERSTITIOUS,', 'BUT I AM A', 'LITTLE STITIOUS.'] },
  { to: 'Dwight', lines: ['WOULD I RATHER BE', 'FEARED OR LOVED?', 'BOTH.'] },
  { to: 'Oscar', lines: ['I LOVE', 'INSIDE JOKES.'] },
  { to: 'Toby', lines: ['NO! GOD! NO!', 'NOOOOO!'] },
  { to: 'Dwight', lines: ['PARKOUR!'] },
];
const WALK_SPEED = 7; // units per second
const TALK_MS = 6000;
const CYCLE_MS = 95000; // one line per cycle
const routeLen = (pts) => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]), 0);

function alongPath(pts, t) {
  let dist = t * routeLen(pts);
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const seg = Math.hypot(bx - ax, by - ay);
    if (dist <= seg || i === pts.length - 1) {
      const k = Math.min(1, dist / seg);
      return { x: ax + (bx - ax) * k, y: ay + (by - ay) * k, front: bx - ax + (by - ay) > 0 };
    }
    dist -= seg;
  }
}

// Pick the line by cycle number: shuffled order, never the same line twice in a row
const ORDER = [0, 3, 1, 7, 4, 2, 8, 5, 6];
const quoteFor = (n) => QUOTES[ORDER[n % ORDER.length]];

// What is Michael doing right now? sit | walk | talk
function michaelState(now) {
  const n = Math.floor(now / CYCLE_MS);
  const q = quoteFor(n);
  const route = ROUTES[q.to];
  const walk = (routeLen(route) / WALK_SPEED) * 1000;
  const sit = CYCLE_MS - 2 * walk - TALK_MS;
  const t = now % CYCLE_MS;
  const step = 1 + (Math.floor(t / 250) % 2);
  if (t < sit) return { mode: 'sit' };
  if (t < sit + walk) return { mode: 'walk', ...alongPath(route, (t - sit) / walk), step };
  if (t < sit + walk + TALK_MS) {
    const [x, y] = route[route.length - 1];
    return { mode: 'talk', x, y, front: true, step: 0, lines: q.lines };
  }
  return { mode: 'walk', ...alongPath([...route].reverse(), (t - sit - walk - TALK_MS) / walk), step };
}

function personSprite(name, front, typing, noHands = false) {
  const p = CAST[name];
  let rows = (front ? FRONT : BACK).map((r) => [...r]);
  if (!p.hair) rows = rows.map((r, y) => r.map((ch) => (ch === 'H' && (front ? y < 3 : y < 5) ? 'S' : ch)));
  // Balding: bare crown, hair left on the sides and back
  if (p.balding) rows = rows.map((r, y) => r.map((ch) => (ch === 'H' && y < 3 ? 'S' : ch)));
  if (p.long) {
    if (front) for (let y = 3; y <= 11; y++) (rows[y][0] = 'H'), (rows[y][9] = 'H');
    else for (let y = 8; y <= 11; y++) for (let x = 1; x <= 8; x++) rows[y][x] = 'H';
  }
  if (p.bun) rows.unshift([...'....HH....']);
  if (p.tall) rows.unshift([...'..HHHHH...']);
  if (p.part && front) rows[1][5] = 'S';
  if (front) {
    const o = rows.length - 16;
    if (!p.tie) rows = rows.map((r) => r.map((ch) => (ch === 'T' ? 'C' : ch)));
    if (p.glasses) rows[5 + o] = [...'.SGEGGEGS.'];
    if (p.stache) rows[7 + o] = [...'..SBBBBS..'];
    if (p.jacket) for (let y = 11 + o; y < rows.length; y++) for (const x of [0, 1, 2, 7, 8, 9]) if (rows[y][x] === 'C') rows[y][x] = 'J';
  }
  if (typing) {
    const n = rows.length;
    rows[n - 1][0] = rows[n - 1][9] = 'C';
    rows[n - 2][0] = rows[n - 2][9] = 'S';
  }
  const skin = hex(p.skin);
  const hair = p.hair ? hex(p.hair) : mul(skin, 0.6);
  const shirt = hex(p.shirt);
  const pal = {
    H: hair,
    S: skin,
    E: hex('#1a1a1a'),
    G: hex('#1a1a1a'),
    M: mul(skin, 0.72),
    B: p.stache ? hex(p.stache) : skin,
    C: shirt,
    J: p.jacket ? hex(p.jacket) : shirt,
    W: p.tie ? hex('#f4f4f4') : mul(shirt, 1.1),
    T: p.tie ? hex(p.tie) : shirt,
  };
  if (noHands) rows = rows.slice(0, rows.length - 1);
  // Shade the right edge slightly for a sense of volume
  return rows.map((r) => r.map((ch, x) => (ch === '.' ? -1 : x >= 7 ? mul(pal[ch], 0.9) : pal[ch])));
}

// --- Static scene and frames -----------------------------------------------------
const SCREEN_COLORS = ['#3ddc84', '#56b6c2', '#e5c07b', '#c678dd', '#61afef'].map(hex);

function hash(n) {
  n = (n ^ 61) ^ (n >>> 16);
  n = (n + (n << 3)) | 0;
  n ^= n >>> 4;
  n = Math.imul(n, 0x27d4eb2d);
  return (n ^ (n >>> 15)) >>> 0;
}

function buildStatic() {
  const img = rasterWorld(buildWorld());
  decorateWalls(img);
  outline(img);
  // Collect each desk's screen pixels, row by row
  const lists = SEATS.map(() => []);
  for (let i = 0; i < img.mat.length; i++) if (img.mat[i] >= MAT.screen) lists[img.mat[i] - MAT.screen].push(i);
  img.screens = lists.map((pixels) => {
    const rows = new Map();
    for (const p of pixels) {
      const y = Math.floor(p / img.W);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push(p);
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, ps]) => ps.sort((a, b) => a - b));
  });
  return img;
}

function drawText(color, W, H, text, x0, y0, ink, bg) {
  const rows = textRows(text);
  const w = rows[0].length + 1;
  for (let y = -1; y < 6; y++)
    for (let x = -1; x < w; x++) {
      const px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const on = y >= 0 && y < 5 && x >= 0 && x < w - 1 && rows[y][x] === '#';
      color[py * W + px] = on ? ink : bg;
    }
  return w;
}

// occupied: Map(seatIndex -> anything); returns { W, H, color: Int32Array, labels, bubble }
// opts.overlay: leave name labels and the speech bubble out of the pixels and return them
// instead, so the text-mode renderer can print them as real (readable) text
function renderFrame(base, occupied, tick, now = Date.now(), opts = {}) {
  const { W, H, ox, oy, glassDepth, glassCol, glassA } = base;
  const color = Int32Array.from(base.color);
  const depth = Float32Array.from(base.depth);

  // Monitors: scrolling lines of code while an agent works at that desk
  base.screens.forEach((rows, i) => {
    rows.forEach((ps, r) => {
      const h = hash(i * 7919 + r + tick);
      const len = 1 + (h % Math.max(1, ps.length));
      ps.forEach((p, k) => {
        if (!occupied.has(i)) color[p] = C.screenOff;
        else color[p] = k < len && r % 2 === 0 ? SCREEN_COLORS[(h >>> 5) % SCREEN_COLORS.length] : hex('#0f1d18');
      });
    });
  });

  // People to draw: everyone at their desk (agents at work are typing) + Michael
  const people = SEATS.map((s, i) => [s, i])
    .filter(([s]) => !s.ambient)
    .map(([s, i]) => {
      const working = occupied.has(i);
      const [sx, sy] = project(s.cx, s.cy, 3);
      const spr = personSprite(s.who, facesViewer(s.face), working && (tick + i) % 2 === 1);
      return { name: s.who, i, spr, sx, sy, d: s.cx + s.cy + 7, label: true, working };
    });
  const m = michaelState(now);
  if (m.mode === 'sit') {
    const s = SEATS[0];
    const [sx, sy] = project(s.cx, s.cy, 3);
    people.push({ name: 'Michael', i: 0, spr: personSprite('Michael', true, false), sx, sy, d: s.cx + s.cy + 7, label: false });
  } else {
    const mx = Math.round(m.x), my = Math.round(m.y);
    const [sx, sy] = project(mx, my, 0);
    people.push({ name: 'Michael', i: 0, spr: standingSprite('Michael', m.front, m.step), sx, sy: sy + 1, d: mx + my + 6, label: m.mode === 'walk', bubble: m.mode === 'talk' && m.lines });
  }
  people.sort((a, b) => a.d - b.d);

  const labels = [];
  let bubble = null;
  for (const p of people) {
    const { spr, sx, sy, d, i } = p;
    const X0 = sx + ox - 4, Y0 = sy + oy - spr.length + 2;
    const mask = new Set();
    spr.forEach((row, r) =>
      row.forEach((c, k) => {
        if (c < 0) return;
        const px = X0 + k, py = Y0 + r;
        if (px < 0 || py < 0 || px >= W || py >= H) return;
        const j = py * W + px;
        if (depth[j] > d) return;
        // Tint with the glass color when behind glass
        color[j] = glassDepth[j] > d ? mix(c, glassCol[j], glassA[j]) : c;
        depth[j] = d;
        mask.add(j);
      })
    );
    // Sprite outline
    for (const j of mask)
      for (const n of [j - 1, j + 1, j - W, j + W])
        if (!mask.has(n) && n >= 0 && n < W * H && depth[n] < d - 1) color[n] = mix(color[n] < 0 ? C.outline : color[n], C.outline, 0.85);
    // Name labels only appear above characters working as an agent
    if (p.working) labels.push({ name: p.name, x: X0 + 5, y: Y0 - 9, i });
    if (p.bubble) bubble = { x: X0 + 3, y: Y0 - 3, lines: p.bubble };
  }

  if (opts.overlay) {
    const out = labels.map((l) => ({ name: l.name, x: l.x, y: l.y + 2, color: CAST[l.name].shirt, on: (tick + l.i) % 2 === 0 }));
    return { W, H, color, labels: out, bubble };
  }

  // Name labels: name + a blinking yellow "working" dot
  for (const l of labels) {
    const ink = hex(CAST[l.name].shirt);
    const text = l.name + ' ';
    const w = textRows(text)[0].length;
    const x0 = l.x - Math.floor(w / 2);
    drawText(color, W, H, text, x0, l.y, ink === hex('#3a3a3a') ? hex('#bbbbbb') : ink, hex('#1f2430'));
    const on = (tick + l.i) % 2 === 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      const px = x0 + w - 3 + dx, py = l.y + 1 + dy;
      if (px >= 0 && py >= 0 && px < W && py < H) color[py * W + px] = on ? hex('#ffd866') : hex('#59606e');
    }
  }
  if (bubble) speechBubble(color, W, H, bubble.x, bubble.y, bubble.lines);
  return { W, H, color, labels: [], bubble: null };
}

// White speech bubble whose tail points at (x, y)
function speechBubble(color, W, H, x, y, lines) {
  const rows = lines.map((l) => textRows(l));
  const tw = Math.max(...rows.map((r) => r[0].length)) + 3;
  const th = lines.length * 6 + 3;
  const x0 = x - Math.floor(tw / 2), y0 = y - th - 3;
  const ink = hex('#1a1a1a'), paper = hex('#ffffff');
  const set = (px, py, c) => {
    if (px >= 0 && py >= 0 && px < W && py < H) color[py * W + px] = c;
  };
  for (let py = 0; py < th; py++)
    for (let px = 0; px < tw; px++) {
      if ((px === 0 || px === tw - 1) && (py === 0 || py === th - 1)) continue;
      const border = px === 0 || py === 0 || px === tw - 1 || py === th - 1;
      set(x0 + px, y0 + py, border ? ink : paper);
    }
  rows.forEach((r, li) => {
    const off = Math.floor((tw - r[0].length) / 2) + 1;
    r.forEach((row, ry) => [...row].forEach((ch, rx) => ch === '#' && set(x0 + off + rx, y0 + 2 + li * 6 + ry, ink)));
  });
  // Tail: a small triangle from the bubble down to the speaker
  for (let k = 0; k < 3; k++) {
    set(x - 1, y0 + th - 1 + k, ink);
    for (let q = 0; q < 2 - k; q++) set(x + q, y0 + th - 1 + k, paper);
    set(x + 2 - k, y0 + th - 1 + k, ink);
  }
}

module.exports = { buildStatic, renderFrame, michaelState, SEATS, CAST, CYCLE_MS, QUOTES };
