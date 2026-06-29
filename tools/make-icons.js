/* ============================================================
   make-icons.js — PWA ikonlarını saf Node ile üretir (bağımlılık yok).
   Marka şimşeğini volt-yeşil zemine çizer; PNG'yi zlib ile kodlar.
   Çalıştır:  node tools/make-icons.js
   ============================================================ */
const fs = require("fs");
const zlib = require("zlib");
const path = require("path");

const VOLT = [215, 255, 62];   // #d7ff3e
const DARK = [11, 13, 14];     // #0b0d0e

// Şimşek poligonu (24x24 koordinat uzayı)
const BOLT = [[13, 2], [4, 14], [10, 14], [9, 22], [18, 10], [12, 10]];
const BB = { cx: 11, cy: 12, h: 20 };

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function makeIcon(size, opts) {
  const r = opts.maskable ? 0 : size * 0.22;
  const targetH = size * opts.logoFrac;
  const scale = targetH / BB.h;
  const SS = 4; // kenar yumuşatma için süper örnekleme
  const data = Buffer.alloc(size * size * 4);

  function insideRoundRect(px, py) {
    if (px < 0 || py < 0 || px > size || py > size) return false;
    if (r <= 0) return true;
    let dx = 0, dy = 0;
    if (px < r) dx = r - px; else if (px > size - r) dx = px - (size - r);
    if (py < r) dy = r - py; else if (py > size - r) dy = py - (size - r);
    if (dx > 0 && dy > 0) return dx * dx + dy * dy <= r * r;
    return true;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let rr = 0, gg = 0, bb = 0, covered = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;
          if (!insideRoundRect(px, py)) continue;
          const bx = (px - size / 2) / scale + BB.cx;
          const by = (py - size / 2) / scale + BB.cy;
          const col = pointInPoly(bx, by, BOLT) ? DARK : VOLT;
          rr += col[0]; gg += col[1]; bb += col[2]; covered++;
        }
      }
      const idx = (y * size + x) * 4;
      if (covered === 0) {
        data[idx] = data[idx + 1] = data[idx + 2] = data[idx + 3] = 0;
      } else {
        data[idx] = Math.round(rr / covered);
        data[idx + 1] = Math.round(gg / covered);
        data[idx + 2] = Math.round(bb / covered);
        data[idx + 3] = Math.round((covered / (SS * SS)) * 255);
      }
    }
  }
  return encodePNG(size, size, data);
}

/* ---- minimal PNG kodlayıcı (RGBA, 8-bit) ---- */
const CRC = (() => {
  const t = new Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const stride = 1 + w * 4;
  const raw = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0;
    rgba.copy(raw, y * stride + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const outDir = path.join(__dirname, "..", "icons");
fs.mkdirSync(outDir, { recursive: true });
const jobs = [
  { file: "icon-192.png", size: 192, maskable: false, logoFrac: 0.58 },
  { file: "icon-512.png", size: 512, maskable: false, logoFrac: 0.58 },
  { file: "icon-maskable-512.png", size: 512, maskable: true, logoFrac: 0.5 },
  { file: "apple-touch-icon-180.png", size: 180, maskable: true, logoFrac: 0.56 },
];
jobs.forEach((j) => {
  fs.writeFileSync(path.join(outDir, j.file), makeIcon(j.size, j));
  console.log("yazıldı:", j.file);
});
