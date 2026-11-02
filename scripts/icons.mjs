// Draws Sleuthhound's crosshair into the PNG and ICO files the site needs:
// the favicon, web app icons, the Apple touch icon and the 1200x630 link
// preview. No image library: each pixel is sampled 4x4 against the same
// shapes as public/icon.svg and written with Node's zlib. Run it after
// changing the mark:
//
//   node scripts/icons.mjs
//
// Icons are the crosshair in light grey on black, so they read on light and
// dark tab bars alike: on a rounded square where the icon is shown as drawn,
// and full-bleed where the platform crops it (maskable and Apple icons).

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const root = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const LIGHT = [0xc9, 0xcd, 0xd2]; // --border-bright
const LOGO = [0x7a, 0x80, 0x88]; // --logo, the crosshair in the app

// The mark in its own units, centred on 0,0 within -300..300 (public/icon.svg).
function inMark(x, y) {
  const r = Math.hypot(x, y);
  if (r >= 180 && r <= 232) return true;
  const bar = (a, b) => Math.abs(a) <= 26.5 && Math.abs(b) >= 108 && Math.abs(b) <= 294;
  return bar(x, y) || bar(y, x);
}

// Inside a w x h rectangle with corners of radius r, from its top left.
function inRounded(x, y, w, h, r) {
  if (r <= 0) return x >= 0 && y >= 0 && x < w && y < h;
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  return Math.hypot(x - cx, y - cy) <= r && x >= 0 && y >= 0 && x <= w && y <= h;
}

/**
 * An RGBA image, width x height: black (with corners of `radius` pixels,
 * transparent outside), and the mark `size` pixels across, centred, in `ink`.
 */
function draw(width, height, size, { radius = 0, ink = LIGHT } = {}) {
  const px = Buffer.alloc(width * height * 4);
  const scale = 600 / size;
  const S = 4;
  for (let j = 0; j < height; j++) {
    for (let i = 0; i < width; i++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < S; sy++) {
        for (let sx = 0; sx < S; sx++) {
          const x = i + (sx + 0.5) / S;
          const y = j + (sy + 0.5) / S;
          if (!inRounded(x, y, width, height, radius)) continue;
          bg++;
          if (inMark((x - width / 2) * scale, (y - height / 2) * scale)) fg++;
        }
      }
      const o = (j * width + i) * 4;
      const alpha = bg / (S * S);
      // Mark colour over black, as a share of the covered area.
      const share = bg ? fg / bg : 0;
      for (let c = 0; c < 3; c++) px[o + c] = Math.round(ink[c] * share);
      px[o + 3] = Math.round(alpha * 255);
    }
  }
  return png(width, height, px);
}

const CRC = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let j = 0; j < height; j++) rgba.copy(rows, j * (width * 4 + 1) + 1, j * width * 4, (j + 1) * width * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(rows, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// An ICO holding PNG images, which every current browser reads.
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e[0] = size >= 256 ? 0 : size;
    e[1] = size >= 256 ? 0 : size;
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const out = (name, data) => fs.writeFileSync(path.join(root, "public", name), data);
const icon = (size) => draw(size, size, Math.round(size * 0.74), { radius: size * 0.22 });

out("favicon.ico", ico([16, 32].map((size) => ({ size, data: icon(size) }))));
out("icon-192.png", icon(192));
out("icon-512.png", icon(512));
// Full-bleed: launchers crop maskable icons to their own shape, keeping the
// middle 80%, and iOS rounds the Apple icon itself.
out("icon-maskable-512.png", draw(512, 512, 300));
out("apple-touch-icon.png", draw(180, 180, 128));
// The link preview keeps the app's own crosshair grey.
out("og.png", draw(1200, 630, 300, { ink: LOGO }));
console.log("Wrote public/favicon.ico, icon-192.png, icon-512.png, icon-maskable-512.png, apple-touch-icon.png and og.png.");
