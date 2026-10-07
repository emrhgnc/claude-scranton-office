// Generates docs/screenshot.png for the README.
// Usage: node tools/screenshot.js [scale]
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const A = require('../plugins/scranton-office/scripts/office-art.js');

const scale = Number(process.argv[2] || 2);
const base = A.buildStatic();
// A few desks busy, and the regional manager mid-quote at Jim's desk
const busy = ['Jim', 'Dwight', 'Pam', 'Oscar', 'Stanley'];
const occupied = new Map(A.SEATS.map((s, i) => [s.who, i]).filter(([who]) => busy.includes(who)).map(([, i]) => [i, true]));
let now = 0;
for (let t = 0; ; t += 250) {
  const m = A.michaelState(t);
  if (m.mode === 'talk' && m.lines[0].startsWith("THAT'S")) {
    now = t + 1000;
    break;
  }
}
const { W, H, color } = A.renderFrame(base, occupied, 0, now);

const OW = W * scale, OH = H * scale;
const raw = Buffer.alloc((OW * 3 + 1) * OH);
for (let y = 0; y < OH; y++)
  for (let x = 0; x < OW; x++) {
    let c = color[Math.floor(y / scale) * W + Math.floor(x / scale)];
    if (c < 0) c = 0x2b2836;
    const o = y * (OW * 3 + 1) + 1 + x * 3;
    raw[o] = c >> 16;
    raw[o + 1] = (c >> 8) & 255;
    raw[o + 2] = c & 255;
  }
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => {
  let c = ~0;
  for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, sum]);
};
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OW, 0);
ihdr.writeUInt32BE(OH, 4);
ihdr[8] = 8;
ihdr[9] = 2;
const out = path.join(__dirname, '..', 'docs', 'screenshot.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log(`wrote ${out} (${OW}x${OH})`);
