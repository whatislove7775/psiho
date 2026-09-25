/**
 * Tiny QR Code generator (byte mode, versions 1–40, ECC L/M/Q/H), no dependencies.
 * A compact port of Project Nayuki's reference algorithm (MIT).
 *
 *   const qr = encodeQr("https://aprosop.ru/…");   // { size, modules[y][x] }
 */

type Ecl = "L" | "M" | "Q" | "H";
const ECL_INDEX: Record<Ecl, number> = { L: 0, M: 1, Q: 2, H: 3 };
const ECL_FORMAT: Record<Ecl, number> = { L: 1, M: 0, Q: 3, H: 2 };

// prettier-ignore
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
// prettier-ignore
const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const getBit = (x: number, i: number) => ((x >>> i) & 1) !== 0;

function numRawDataModules(ver: number): number {
  let result = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (ver >= 7) result -= 36;
  }
  return result;
}

function numDataCodewords(ver: number, ecl: Ecl): number {
  const e = ECL_INDEX[ecl];
  return Math.floor(numRawDataModules(ver) / 8) - ECC_CODEWORDS_PER_BLOCK[e][ver] * NUM_ERROR_CORRECTION_BLOCKS[e][ver];
}

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = gfMul(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return result;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = divisor.map(() => 0);
  for (const b of data) {
    const factor = b ^ (result.shift() as number);
    result.push(0);
    divisor.forEach((coef, i) => (result[i] ^= gfMul(coef, factor)));
  }
  return result;
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

export interface QrCode {
  size: number;
  /** modules[y][x] — true = dark */
  modules: boolean[][];
  version: number;
}

export function encodeQr(text: string, minEcl: Ecl = "M"): QrCode {
  const bytes = utf8(text);
  let ver = 1;
  let bitsUsed = 0;
  for (; ; ver++) {
    if (ver > 40) throw new Error("QR: data too long");
    const ccBits = ver <= 9 ? 8 : 16;
    bitsUsed = 4 + ccBits + bytes.length * 8;
    if (bytes.length < 1 << ccBits && bitsUsed <= numDataCodewords(ver, minEcl) * 8) break;
  }
  let ecl = minEcl;
  for (const e of ["M", "Q", "H"] as Ecl[]) {
    if (ECL_INDEX[e] > ECL_INDEX[ecl] && bitsUsed <= numDataCodewords(ver, e) * 8) ecl = e;
  }

  // Bit stream: mode (byte = 0100), length, data, terminator, padding
  const bits: number[] = [];
  const push = (val: number, len: number) => {
    for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1);
  };
  push(0x4, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  bytes.forEach((b) => push(b, 8));
  const capacity = numDataCodewords(ver, ecl) * 8;
  push(0, Math.min(4, capacity - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) push(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
    data.push(b);
  }

  // Error correction + interleaving
  const e = ECL_INDEX[ecl];
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[e][ver];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[e][ver];
  const rawCodewords = Math.floor(numRawDataModules(ver) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const div = rsDivisor(blockEccLen);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < numShortBlocks) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) codewords.push(block[i]);
    });
  }

  // Matrix
  const size = ver * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const isFn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => {
    modules[y][x] = dark;
    isFn[y][x] = true;
  };

  for (let i = 0; i < size; i++) {
    setFn(6, i, i % 2 === 0);
    setFn(i, 6, i % 2 === 0);
  }
  const finder = (x: number, y: number) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        const xx = x + dx;
        const yy = y + dy;
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFn(xx, yy, dist !== 2 && dist !== 4);
      }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);

  const align: number[] = [];
  if (ver > 1) {
    const numAlign = Math.floor(ver / 7) + 2;
    const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    align.push(6);
    for (let pos = size - 7; align.length < numAlign; pos -= step) align.splice(1, 0, pos);
  }
  for (let i = 0; i < align.length; i++)
    for (let j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++)
        for (let dx = -2; dx <= 2; dx++) setFn(align[i] + dx, align[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }

  const drawFormat = (mask: number) => {
    const d = (ECL_FORMAT[ecl] << 3) | mask;
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const b = ((d << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, getBit(b, i));
    setFn(8, 7, getBit(b, 6));
    setFn(8, 8, getBit(b, 7));
    setFn(7, 8, getBit(b, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, getBit(b, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, getBit(b, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, getBit(b, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);

  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = getBit(b, i);
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      setFn(a, c, bit);
      setFn(c, a, bit);
    }
  }

  // Data modules (zig-zag)
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++)
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFn[y][x] && i < codewords.length * 8) {
          modules[y][x] = getBit(codewords[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
  }

  const maskFn = (m: number, x: number, y: number): boolean => {
    switch (m) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };
  const applyMask = (m: number) => {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!isFn[y][x] && maskFn(m, x, y)) modules[y][x] = !modules[y][x];
  };
  // Simplified penalty (runs, 2×2 blocks, balance) to pick a readable mask
  const penalty = (): number => {
    let p = 0;
    let dark = 0;
    for (let y = 0; y < size; y++) {
      let runX = 1;
      let runY = 1;
      for (let x = 0; x < size; x++) {
        if (modules[y][x]) dark++;
        if (x > 0) {
          if (modules[y][x] === modules[y][x - 1]) runX++;
          else runX = 1;
          if (runX === 5) p += 3;
          else if (runX > 5) p++;
          if (modules[x][y] === modules[x - 1][y]) runY++;
          else runY = 1;
          if (runY === 5) p += 3;
          else if (runY > 5) p++;
        }
        if (x > 0 && y > 0) {
          const c = modules[y][x];
          if (c === modules[y][x - 1] && c === modules[y - 1][x] && c === modules[y - 1][x - 1]) p += 3;
        }
      }
    }
    const total = size * size;
    p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return p;
  };
  let best = 0;
  let bestPenalty = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(m);
    drawFormat(m);
    const pen = penalty();
    if (pen < bestPenalty) {
      best = m;
      bestPenalty = pen;
    }
    applyMask(m); // undo (XOR)
  }
  applyMask(best);
  drawFormat(best);
  return { size, modules, version: ver };
}

/** SVG path data for the dark modules (1 unit = 1 module), with a quiet zone of `border` modules. */
export function qrPath(qr: QrCode, border = 4): string {
  const parts: string[] = [];
  for (let y = 0; y < qr.size; y++)
    for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) parts.push(`M${x + border},${y + border}h1v1h-1z`);
  return parts.join("");
}
