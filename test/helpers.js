import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
export const file = (path, size) => ({ path, size });
export const own = (files) =>
  Object.fromEntries(files.map(({ path }) => [path, path]));
export const zipSize = (files) =>
  22 +
  files.reduce((n, f) => n + f.size + 76 + 2 * Buffer.byteLength(f.path), 0);
export function bytesFor(path, length) {
  const seed = [...Buffer.from(path)].reduce((a, b) => a + b, 0);
  return Uint8Array.from({ length }, (_, i) => (seed + i * 37) & 255);
}
// Deliberately bit-at-a-time, independent from production's table-based CRC implementation.
export function slowCrc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit++)
      value = value & 1 ? (value >>> 1) ^ 0xedb88320 : value >>> 1;
  }
  return (value ^ 0xffffffff) >>> 0;
}
// A narrow independent ZIP32 STORE reader for emitted-profile assertions. Never extracts paths.
export function readStoreZip(input) {
  const b = Buffer.from(input);
  const end = b.length - 22;
  assert.ok(end >= 0);
  assert.equal(b.readUInt32LE(end), 0x06054b50);
  assert.equal(b.readUInt16LE(end + 4), 0);
  assert.equal(b.readUInt16LE(end + 6), 0);
  const count = b.readUInt16LE(end + 10);
  assert.equal(b.readUInt16LE(end + 8), count);
  const centralSize = b.readUInt32LE(end + 12),
    centralStart = b.readUInt32LE(end + 16);
  assert.equal(centralStart + centralSize, end);
  assert.equal(b.readUInt16LE(end + 20), 0);
  let offset = centralStart,
    nextLocal = 0;
  const result = [];
  for (let index = 0; index < count; index++) {
    assert.equal(b.readUInt32LE(offset), 0x02014b50);
    assert.equal(
      b.readUInt16LE(offset + 4),
      0x0314,
      "fixed Unix made-by profile",
    );
    assert.equal(
      b.readUInt32LE(offset + 38),
      0x81a40000,
      "fixed regular 0644 attributes",
    );
    assert.equal(
      b.readUInt16LE(offset + 8),
      0x0800,
      "only UTF-8 general purpose flag",
    );
    assert.equal(b.readUInt16LE(offset + 10), 0, "STORE");
    assert.equal(b.readUInt16LE(offset + 12), 0);
    assert.equal(b.readUInt16LE(offset + 14), 33, "1980-01-01");
    const crc = b.readUInt32LE(offset + 16),
      size = b.readUInt32LE(offset + 24);
    assert.equal(b.readUInt32LE(offset + 20), size);
    const nameLen = b.readUInt16LE(offset + 28);
    assert.equal(b.readUInt16LE(offset + 30), 0);
    assert.equal(b.readUInt16LE(offset + 32), 0);
    assert.equal(b.readUInt16LE(offset + 34), 0);
    const local = b.readUInt32LE(offset + 42);
    assert.equal(
      local,
      nextLocal,
      "contiguous local records without descriptors",
    );
    const nameBytes = b.subarray(offset + 46, offset + 46 + nameLen);
    const path = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    assert.equal(b.readUInt32LE(local), 0x04034b50);
    assert.equal(b.readUInt16LE(local + 6), 0x0800);
    assert.equal(b.readUInt16LE(local + 8), 0);
    assert.equal(b.readUInt16LE(local + 10), 0);
    assert.equal(b.readUInt16LE(local + 12), 33);
    assert.equal(b.readUInt32LE(local + 14), crc);
    assert.equal(b.readUInt32LE(local + 18), size);
    assert.equal(b.readUInt32LE(local + 22), size);
    assert.equal(b.readUInt16LE(local + 26), nameLen);
    assert.equal(b.readUInt16LE(local + 28), 0);
    assert.deepEqual(b.subarray(local + 30, local + 30 + nameLen), nameBytes);
    const content = b.subarray(
      local + 30 + nameLen,
      local + 30 + nameLen + size,
    );
    assert.equal(content.length, size);
    assert.equal(slowCrc(content), crc);
    result.push({ path, size, crc, bytes: content, sha256: sha(content) });
    nextLocal = local + 30 + nameLen + size;
    offset += 46 + nameLen;
  }
  assert.equal(offset, end);
  assert.equal(nextLocal, centralStart);
  assert.equal(zipSize(result), b.length);
  return result;
}
