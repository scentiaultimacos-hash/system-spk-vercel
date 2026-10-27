import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const crcTable = createCrcTable();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePng(width, height, getPixel) {
  const rawData = Buffer.alloc(height * (width * 4 + 1));
  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y, width, height);
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // PNG Header
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: 6 (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([sig, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function renderAppIcon(x, y, w, h, isMaskable) {
  const cx = w / 2;
  const cy = h / 2;
  const dx = x - cx;
  const dy = y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);

  // Background gradient: Emerald green (#059669) to Teal (#0d9488) to dark slate
  const t = (x + y) / (w + h);
  const bgR = Math.round(5 * (1 - t) + 13 * t);
  const bgG = Math.round(150 * (1 - t) + 148 * t);
  const bgB = Math.round(105 * (1 - t) + 136 * t);

  if (isMaskable) {
    // Maskable: fill full bleed
    // Draw bottle silhouette or letter SU
    const normDist = dist / (w * 0.35);
    if (normDist < 1.0) {
      // Inner circle glow
      const blend = Math.max(0, 1 - normDist);
      const r = Math.min(255, Math.round(bgR + 40 * blend));
      const g = Math.min(255, Math.round(bgG + 60 * blend));
      const b = Math.min(255, Math.round(bgB + 50 * blend));
      return [r, g, b, 255];
    }
    return [bgR, bgG, bgB, 255];
  } else {
    // Rounded squircle
    const radius = w * 0.44;
    // Superellipse: (x/rx)^4 + (y/ry)^4 <= 1
    const nx = Math.abs(dx) / radius;
    const ny = Math.abs(dy) / radius;
    const p = Math.pow(nx, 4) + Math.pow(ny, 4);

    if (p > 1.0) {
      // transparent outside
      return [0, 0, 0, 0];
    } else if (p > 0.94) {
      // anti-aliasing edge
      const alpha = Math.round(255 * (1 - (p - 0.94) / 0.06));
      return [bgR, bgG, bgB, alpha];
    }

    // Inner subtle pattern / bottle silhouette
    if (dist < w * 0.28) {
      const glow = Math.max(0, 1 - dist / (w * 0.28));
      return [
        Math.min(255, Math.round(bgR + 40 * glow)),
        Math.min(255, Math.round(bgG + 55 * glow)),
        Math.min(255, Math.round(bgB + 45 * glow)),
        255
      ];
    }

    return [bgR, bgG, bgB, 255];
  }
}

const outDir = path.resolve('public');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Generate 192x192
const png192 = makePng(192, 192, (x, y, w, h) => renderAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'pwa-192x192.png'), png192);

// Generate 512x512
const png512 = makePng(512, 512, (x, y, w, h) => renderAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'pwa-512x512.png'), png512);

// Generate maskable 512x512
const pngMaskable = makePng(512, 512, (x, y, w, h) => renderAppIcon(x, y, w, h, true));
fs.writeFileSync(path.join(outDir, 'pwa-maskable-512x512.png'), pngMaskable);

// Generate apple-touch-icon 180x180
const appleIcon = makePng(180, 180, (x, y, w, h) => renderAppIcon(x, y, w, h, false));
fs.writeFileSync(path.join(outDir, 'apple-touch-icon.png'), appleIcon);

console.log('✅ Generated PWA icons successfully!');
