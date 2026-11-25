// A small PNG reader for the tests: 8-bit RGBA or RGB, not interlaced, which is what the
// icon script writes. Plain Node, no installs. Not a test file itself.
const fs = require("node:fs");
const zlib = require("node:zlib");

// { width, height, pixels } with pixels as [r, g, b, a] rows, top to bottom
function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error(`${file} isn't a PNG`);
  let pos = 8, width, height, channels;
  const data = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos), type = buf.toString("ascii", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      const [depth, colour, , , interlace] = body.subarray(8, 13);
      if (depth !== 8 || interlace !== 0 || ![2, 6].includes(colour)) throw new Error(`${file}: unsupported PNG format`);
      channels = colour === 6 ? 4 : 3;
    }
    if (type === "IDAT") data.push(body);
    if (type === "IEND") break;
    pos += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = width * channels, out = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][filter];
      out[y * stride + x] = (line[x] + pred) & 0xff;
    }
  }
  const pixels = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) {
      const i = y * stride + x * channels;
      row.push([out[i], out[i + 1], out[i + 2], channels === 4 ? out[i + 3] : 255]);
    }
    pixels.push(row);
  }
  return { width, height, pixels };
}

module.exports = { readPng };
