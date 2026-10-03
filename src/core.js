/** Sidecar Pack's deliberately restricted ZIP32 STORE profile. No content decoding. */
export const LIMITS = Object.freeze({
  maxFiles: 1000,
  maxTotalBytes: 128 * 1024 * 1024,
  maxPartBytes: 64 * 1024 * 1024,
  maxParts: 100,
  maxPathBytes: 1024,
});
const encoder = new TextEncoder();
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const order = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const fail = (message) => {
  throw new Error(message);
};
const displayPath = (path) =>
  JSON.stringify(path).replace(
    /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,
    (character) => `\\u{${character.codePointAt(0).toString(16)}}`,
  );
const canonical = (path) =>
  path.normalize("NFC").toUpperCase().toLowerCase().normalize("NFC");

export function validatePath(path) {
  if (
    typeof path !== "string" ||
    !path ||
    encoder.encode(path).length > LIMITS.maxPathBytes
  )
    fail("Invalid path or path exceeds 1024 UTF-8 bytes.");
  if (/[\\<>:"|?*\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(path))
    fail(`Unsafe portable path: ${displayPath(path)}`);
  const components = path.split("/");
  for (const component of components) {
    if (
      !component ||
      component === "." ||
      component === ".." ||
      /[. ]$/.test(component) ||
      encoder.encode(component).length > 255 ||
      /^(con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:[. ]|$)/i.test(
        component,
      )
    )
      fail(`Unsafe portable path: ${displayPath(path)}`);
  }
  return path;
}

export function inspectFiles(files) {
  if (!Array.isArray(files) || !files.length) fail("Select at least one file.");
  if (files.length > LIMITS.maxFiles)
    fail(`Selection exceeds ${LIMITS.maxFiles} files.`);
  const names = new Map();
  let totalBytes = 0;
  const entries = files
    .map((file) => {
      if (!file || typeof file !== "object") fail("Invalid file metadata.");
      const path = validatePath(file.path);
      if (!Number.isSafeInteger(file.size) || file.size < 0)
        fail(`Invalid byte size: ${path}`);
      totalBytes += file.size;
      if (totalBytes > LIMITS.maxTotalBytes)
        fail("Selection exceeds 128 MiB of source bytes.");
      const key = canonical(path);
      if (names.has(key))
        fail(
          `Duplicate or case/NFC-equivalent paths: ${names.get(key)} / ${path}`,
        );
      names.set(key, path);
      return { path, size: file.size };
    })
    .sort((a, b) => order(a.path, b.path));
  for (const key of names.keys()) {
    const segments = key.split("/");
    for (let i = 1; i < segments.length; i++)
      if (names.has(segments.slice(0, i).join("/")))
        fail(`File/directory prefix conflict: ${names.get(key)}`);
  }
  const exact = new Set(entries.map((file) => file.path));
  for (const entry of entries) {
    const isXmp = /\.xmp$/i.test(entry.path);
    const base = entry.path.slice(0, -4);
    const appendMatch =
      isXmp &&
      exact.has(base) &&
      /^.+\.[^.]+$/.test(base.split("/").at(-1)) &&
      !/\.xmp$/i.test(base);
    entry.suggestedGroup = isXmp ? (appendMatch ? base : null) : entry.path;
    entry.needsReview = isXmp && !appendMatch;
  }
  return { entries, totalBytes };
}

export function parseCap(value, unit = "MiB") {
  if (typeof value !== "number" && typeof value !== "string")
    fail("Enter an explicit numeric archive cap.");
  const text = String(value).trim();
  const match = /^(\d+(?:\.\d+)?)(?:\s*(B|MB|MiB))?$/.exec(text);
  if (!match) fail("Use a positive decimal cap and B, MB or MiB.");
  const chosen = match[2] || unit;
  const multiplier = { B: 1, MB: 1_000_000, MiB: 1_048_576 }[chosen];
  if (!multiplier) fail("Choose B, MB or MiB.");
  // Integer arithmetic avoids accidentally accepting a rounded fractional byte.
  const [whole, fraction = ""] = match[1].split(".");
  if (whole.length + fraction.length > 30)
    fail("Cap is too precise or too large.");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * BigInt(multiplier);
  if (numerator % denominator !== 0n)
    fail("Cap must be a whole number of bytes.");
  const bytes = Number(numerator / denominator);
  if (!Number.isSafeInteger(bytes) || bytes < 22 || bytes > LIMITS.maxPartBytes)
    fail("Archive cap must be between 22 bytes and 64 MiB.");
  return bytes;
}

export function entryBytes(file) {
  return file.size + 76 + 2 * encoder.encode(file.path).length;
}

export function makePlan(files, assignments, capBytes) {
  const { entries, totalBytes } = inspectFiles(files);
  if (
    !Number.isSafeInteger(capBytes) ||
    capBytes < 22 ||
    capBytes > LIMITS.maxPartBytes
  )
    fail("Archive cap must be an integer from 22 bytes to 64 MiB.");
  if (
    !assignments ||
    typeof assignments !== "object" ||
    Array.isArray(assignments)
  )
    fail("Provide reviewed group assignments.");
  const paths = new Set(entries.map((entry) => entry.path));
  for (const key of Object.keys(assignments))
    if (!paths.has(key)) fail(`Unknown assignment path: ${key}`);
  const included = [],
    excluded = [];
  for (const entry of entries) {
    if (!own(assignments, entry.path) || assignments[entry.path] === undefined)
      fail(`Resolve this file before packing: ${entry.path}`);
    const group = assignments[entry.path];
    if (group === null) {
      excluded.push(entry.path);
      continue;
    }
    if (
      typeof group !== "string" ||
      !paths.has(group) ||
      !own(assignments, group) ||
      assignments[group] !== group
    )
      fail(
        `Group anchor must be an included, self-assigned file: ${entry.path}`,
      );
    included.push({ path: entry.path, size: entry.size, group });
  }
  if (!included.length) fail("Include at least one reviewed file.");
  const groupsById = new Map();
  for (const file of included) {
    if (!groupsById.has(file.group))
      groupsById.set(file.group, {
        id: file.group,
        paths: [],
        size: 22,
        cost: 0,
        files: [],
      });
    const group = groupsById.get(file.group);
    group.paths.push(file.path);
    group.files.push(file);
    group.cost += entryBytes(file);
    group.size = 22 + group.cost;
  }
  const groups = [...groupsById.values()];
  for (const group of groups)
    if (group.size > capBytes)
      fail(
        `Group ${group.id} needs at least ${group.size} archive bytes; cap is ${capBytes}. Groups cannot be split.`,
      );
  groups.sort((a, b) => b.cost - a.cost || order(a.id, b.id));
  const parts = [];
  for (const group of groups) {
    let part = parts.find((item) => item.size + group.cost <= capBytes);
    if (!part) {
      if (parts.length >= LIMITS.maxParts)
        fail(`Plan exceeds ${LIMITS.maxParts} parts.`);
      part = {
        name: `part-${String(parts.length + 1).padStart(3, "0")}.zip`,
        size: 22,
        files: [],
      };
      parts.push(part);
    }
    part.size += group.cost;
    part.files.push(...group.files);
  }
  for (const part of parts) part.files.sort((a, b) => order(a.path, b.path));
  return {
    capBytes,
    parts,
    files: included,
    excluded,
    groups: groups.map(({ id, paths, size }) => ({ id, paths, size })),
    totalBytes,
    includedBytes: included.reduce((sum, file) => sum + file.size, 0),
  };
}

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
export async function sha256(bytes) {
  return [
    ...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** All inputs are already bounded/validated. One local header + one central header. */
function encodeZip(records, expectedSize) {
  const zip = new Uint8Array(expectedSize),
    view = new DataView(zip.buffer);
  let offset = 0;
  const u16 = (position, value) => view.setUint16(position, value, true);
  const u32 = (position, value) => view.setUint32(position, value, true);
  for (const record of records) {
    record.offset = offset;
    const name = encoder.encode(record.path),
      crc = crc32(record.bytes);
    record.nameBytes = name;
    record.crc = crc;
    u32(offset, 0x04034b50);
    u16(offset + 4, 20);
    u16(offset + 6, 0x0800);
    u16(offset + 8, 0);
    u16(offset + 10, 0);
    u16(offset + 12, 33);
    u32(offset + 14, crc);
    u32(offset + 18, record.bytes.length);
    u32(offset + 22, record.bytes.length);
    u16(offset + 26, name.length);
    u16(offset + 28, 0);
    zip.set(name, offset + 30);
    zip.set(record.bytes, offset + 30 + name.length);
    offset += 30 + name.length + record.bytes.length;
  }
  const centralStart = offset;
  for (const record of records) {
    u32(offset, 0x02014b50);
    u16(offset + 4, 0x0314);
    u16(offset + 6, 20);
    u16(offset + 8, 0x0800);
    u16(offset + 10, 0);
    u16(offset + 12, 0);
    u16(offset + 14, 33);
    u32(offset + 16, record.crc);
    u32(offset + 20, record.bytes.length);
    u32(offset + 24, record.bytes.length);
    u16(offset + 28, record.nameBytes.length);
    u32(offset + 38, 0x81a40000);
    u32(offset + 42, record.offset);
    zip.set(record.nameBytes, offset + 46);
    offset += 46 + record.nameBytes.length;
  }
  const centralSize = offset - centralStart;
  u32(offset, 0x06054b50);
  u16(offset + 8, records.length);
  u16(offset + 10, records.length);
  u32(offset + 12, centralSize);
  u32(offset + 16, centralStart);
  offset += 22;
  if (offset !== expectedSize) fail("ZIP size model mismatch; output refused.");
  return zip;
}

export async function buildArchives({
  files,
  assignments,
  capBytes,
  readFile,
  onProgress = () => {},
}) {
  const plan = makePlan(files, assignments, capBytes);
  if (typeof readFile !== "function") fail("A local file reader is required.");
  const archives = [],
    receiptFiles = [];
  let completed = 0;
  for (const part of plan.parts) {
    const records = [];
    for (const file of part.files) {
      const source = await readFile(file.path);
      if (!(source instanceof Uint8Array) || source.byteLength !== file.size)
        fail(
          `File changed or could not be read at its declared size: ${file.path}`,
        );
      // Own a snapshot so a caller cannot mutate a file after its receipt hash.
      const bytes = new Uint8Array(source);
      const hash = await sha256(bytes);
      records.push({ path: file.path, bytes });
      receiptFiles.push({
        path: file.path,
        size: file.size,
        sha256: hash,
        group: file.group,
        part: part.name,
      });
      onProgress({
        completed: ++completed,
        total: plan.files.length,
        path: file.path,
      });
    }
    const bytes = encodeZip(records, part.size);
    if (bytes.byteLength !== part.size || bytes.byteLength > capBytes)
      fail("Actual archive size exceeds the verified plan; output refused.");
    archives.push({
      name: part.name,
      bytes,
      size: bytes.length,
      sha256: await sha256(bytes),
    });
  }
  receiptFiles.sort((a, b) => order(a.path, b.path));
  const receipt = {
    format: "sidecar-pack-receipt",
    version: 1,
    zipProfile: "ZIP32-STORE-UTF8-fixed-1980",
    packing: "deterministic-first-fit-decreasing",
    capBytes,
    limits: LIMITS,
    files: receiptFiles,
    excluded: plan.excluded,
    archives: archives.map(({ name, size, sha256: hash }) => ({
      name,
      size,
      sha256: hash,
    })),
    notice:
      "Hashes establish consistency, not authenticity. Archive-byte caps exclude transport encoding and provider rules. Files are unencrypted.",
  };
  return {
    plan,
    archives,
    receipt,
    receiptText: JSON.stringify(receipt, null, 2) + "\n",
  };
}
