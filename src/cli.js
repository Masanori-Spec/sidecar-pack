#!/usr/bin/env node
import fs from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  LIMITS,
  inspectFiles,
  parseCap,
  makePlan,
  buildArchives,
  sha256,
} from "./core.js";

const usage = `Sidecar Pack — local reviewed families, independently extractable hard-cap ZIPs

  node src/cli.js inspect INPUT_DIRECTORY
  node src/cli.js pack INPUT_DIRECTORY --out NEW_DIRECTORY --cap 25MiB --reviewed [--groups groups.json]
  node src/cli.js check RECEIPT_JSON [--dir ZIP_DIRECTORY]

inspect prints suggested assignments and unresolved XMP paths. Save/edit its
assignments as a plain JSON map (path: group anchor, null: explicitly exclude).
A group anchor must be an included file assigned to itself. Exact append XMPs
alone are suggested. Unresolved files require explicit assignments or exclusion.
--reviewed confirms your review of all included families. It does not authorize
an over-cap part. B / MB (1,000,000 B) / MiB (1,048,576 B) are distinct units.

STORE only: no compression, encryption, content parsing, or image decoding.
check compares ZIP byte sizes and SHA-256 only; it never extracts archives.
Hashes prove consistency with a receipt, not its authenticity. Caps cover ZIP
bytes, not email/base64 overhead or service policy. Only selected files count.
`;
const error = (text) => {
  throw new Error(text);
};
const same = (a, b) =>
  a.dev === b.dev &&
  a.ino === b.ino &&
  a.size === b.size &&
  a.mtimeMs === b.mtimeMs &&
  a.ctimeMs === b.ctimeMs;

async function noSymlinks(target, allowMissingLeaf = false) {
  const absolute = path.resolve(target);
  const root = path.parse(absolute).root;
  const segments = absolute.slice(root.length).split(path.sep).filter(Boolean);
  let current = root;
  for (let i = 0; i < segments.length; i++) {
    current = path.join(current, segments[i]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (cause) {
      if (
        cause.code === "ENOENT" &&
        allowMissingLeaf &&
        i === segments.length - 1
      )
        return absolute;
      throw cause;
    }
    if (stat.isSymbolicLink()) error(`Symlinks are refused: ${current}`);
    if (i < segments.length - 1 && !stat.isDirectory())
      error(`Parent is not a directory: ${current}`);
  }
  return absolute;
}

async function scanDirectory(directory) {
  const root = await noSymlinks(directory);
  const rootStat = await fs.lstat(root);
  if (!rootStat.isDirectory()) error("Input must be a directory.");
  const sources = new Map();
  let dirs = 0,
    total = 0;
  async function walk(current, relative, depth) {
    if (++dirs > 4096 || depth > 64)
      error("Input tree exceeds directory/depth safety limits.");
    // Stream directory entries so an oversized tree cannot first allocate an unbounded listing.
    const list = await fs.opendir(current);
    for await (const item of list) {
      const absolute = path.join(current, item.name),
        filePath = relative ? `${relative}/${item.name}` : item.name;
      const stat = await fs.lstat(absolute);
      if (stat.isSymbolicLink()) error(`Symlinks are refused: ${filePath}`);
      if (stat.isDirectory()) {
        await walk(absolute, filePath, depth + 1);
        continue;
      }
      if (!stat.isFile()) error(`Only regular files are accepted: ${filePath}`);
      if (sources.size >= LIMITS.maxFiles)
        error(`Selection exceeds ${LIMITS.maxFiles} files.`);
      total += stat.size;
      if (total > LIMITS.maxTotalBytes)
        error("Selection exceeds 128 MiB of source bytes.");
      sources.set(filePath, { absolute, stat });
    }
  }
  await walk(root, "", 0);
  const files = [...sources].map(([filePath, source]) => ({
    path: filePath,
    size: source.stat.size,
  }));
  return { root, sources, files, inspection: inspectFiles(files) };
}

async function boundedRead(absolute, expected, limit) {
  await noSymlinks(absolute);
  const handle = await fs.open(
    absolute,
    constants.O_RDONLY | (constants.O_NOFOLLOW || 0),
  );
  try {
    const before = await handle.stat();
    if (
      !before.isFile() ||
      !Number.isSafeInteger(before.size) ||
      before.size > limit
    )
      error(`File exceeds read bound or is not regular: ${absolute}`);
    if (expected && !same(before, expected))
      error(`File changed since selection: ${absolute}`);
    const bytes = new Uint8Array(before.size);
    let read = 0;
    while (read < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        read,
        Math.min(1024 * 1024, bytes.length - read),
        read,
      );
      if (!bytesRead) error(`File changed while reading: ${absolute}`);
      read += bytesRead;
    }
    const extra = new Uint8Array(1);
    if (
      (await handle.read(extra, 0, 1, read)).bytesRead !== 0 ||
      !same(before, await handle.stat())
    )
      error(`File changed while reading: ${absolute}`);
    return bytes;
  } finally {
    await handle.close();
  }
}

function parseArgs(args) {
  const [command, target, ...rest] = args;
  if (!command || command === "--help" || command === "-h")
    return { help: true };
  if (
    !["inspect", "pack", "check"].includes(command) ||
    !target ||
    target.startsWith("--")
  )
    error(usage);
  const options = Object.create(null);
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (
      !["--out", "--cap", "--groups", "--reviewed", "--dir"].includes(key) ||
      key in options
    )
      error(`Unknown or duplicate option: ${key}`);
    if (key === "--reviewed") {
      options[key] = true;
      continue;
    }
    const value = rest[++i];
    if (!value || value.startsWith("--")) error(`Missing value for ${key}`);
    options[key] = value;
  }
  const allowed = {
    inspect: [],
    pack: ["--out", "--cap", "--groups", "--reviewed"],
    check: ["--dir"],
  }[command];
  for (const key of Object.keys(options))
    if (!allowed.includes(key))
      error(`Option ${key} does not apply to ${command}.`);
  return { command, target, options };
}

async function readJson(filename, limit = 4 * 1024 * 1024) {
  const bytes = await boundedRead(path.resolve(filename), null, limit);
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}

async function checkReceipt(receiptFile, directory) {
  const receiptPath = await noSymlinks(receiptFile);
  const receipt = await readJson(receiptPath);
  if (
    !receipt ||
    receipt.format !== "sidecar-pack-receipt" ||
    receipt.version !== 1 ||
    !Array.isArray(receipt.archives) ||
    !receipt.archives.length ||
    receipt.archives.length > LIMITS.maxParts ||
    !Number.isInteger(receipt.capBytes) ||
    receipt.capBytes < 22 ||
    receipt.capBytes > LIMITS.maxPartBytes
  )
    error("Unsupported or invalid receipt.");
  const dir = await noSymlinks(directory || path.dirname(receiptPath));
  if (!(await fs.lstat(dir)).isDirectory())
    error("Archive location must be a directory.");
  const seen = new Set();
  let totalArchiveBytes = 0;
  const maximumArchiveBytes =
    LIMITS.maxTotalBytes +
    LIMITS.maxFiles * (76 + 2 * LIMITS.maxPathBytes) +
    22 * LIMITS.maxParts;
  for (const archive of receipt.archives) {
    if (
      !archive ||
      !/^part-\d{3}\.zip$/.test(archive.name) ||
      seen.has(archive.name) ||
      !Number.isInteger(archive.size) ||
      archive.size < 22 ||
      archive.size > receipt.capBytes ||
      typeof archive.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(archive.sha256)
    )
      error("Invalid archive record in receipt.");
    seen.add(archive.name);
    totalArchiveBytes += archive.size;
    if (totalArchiveBytes > maximumArchiveBytes)
      error("Receipt archives exceed the bounded profile total.");
  }
  for (const archive of receipt.archives) {
    const bytes = await boundedRead(
      path.join(dir, archive.name),
      null,
      LIMITS.maxPartBytes,
    );
    if (
      bytes.length !== archive.size ||
      (await sha256(bytes)) !== archive.sha256
    )
      error(`Archive hash/size mismatch: ${archive.name}`);
  }
  return {
    checked: receipt.archives.length,
    message:
      "Archive size and SHA-256 match the receipt. No extraction or source-file verification was performed; authenticity is not established.",
  };
}

export async function main(args = process.argv.slice(2)) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    process.stdout.write(usage);
    return;
  }
  const { command, target, options } = parsed;
  if (command === "check") {
    process.stdout.write(
      JSON.stringify(await checkReceipt(target, options["--dir"]), null, 2) +
        "\n",
    );
    return;
  }
  const scan = await scanDirectory(target);
  const assignments = Object.create(null),
    unresolved = [];
  for (const entry of scan.inspection.entries) {
    if (entry.needsReview) unresolved.push(entry.path);
    else assignments[entry.path] = entry.suggestedGroup;
  }
  if (command === "inspect") {
    process.stdout.write(
      JSON.stringify(
        {
          files: scan.inspection.entries,
          totalBytes: scan.inspection.totalBytes,
          assignments,
          unresolved,
          notice:
            "Review every family. Unresolved XMP paths must be assigned explicitly, kept as self-anchored singletons, or excluded with null.",
        },
        null,
        2,
      ) + "\n",
    );
    return;
  }
  if (!options["--reviewed"])
    error("Review all groups and pass --reviewed before packing.");
  if (!options["--out"] || !options["--cap"])
    error(
      "pack requires --out NEW_DIRECTORY and --cap with an explicit B, MB or MiB unit.",
    );
  if (!/(?:B|MB|MiB)$/.test(options["--cap"]))
    error("CLI cap requires an explicit B, MB or MiB suffix.");
  const capBytes = parseCap(options["--cap"]);
  if (options["--groups"]) {
    const custom = await readJson(options["--groups"]);
    if (!custom || typeof custom !== "object" || Array.isArray(custom))
      error("Groups JSON must be a plain path-to-anchor map.");
    for (const [key, value] of Object.entries(custom)) assignments[key] = value;
  }
  makePlan(scan.files, assignments, capBytes);
  const output = path.resolve(options["--out"]);
  if (output === scan.root || output.startsWith(scan.root + path.sep))
    error("Output cannot be inside the input tree.");
  await noSymlinks(output, true);
  try {
    await fs.lstat(output);
    error("Output already exists; choose a new directory.");
  } catch (cause) {
    if (cause.code !== "ENOENT") throw cause;
  }
  const result = await buildArchives({
    files: scan.files,
    assignments,
    capBytes,
    readFile: (filePath) => {
      const source = scan.sources.get(filePath);
      return boundedRead(source.absolute, source.stat, LIMITS.maxTotalBytes);
    },
  });
  // Only create output after every source read, hash and archive-size check succeeds.
  await noSymlinks(output, true);
  await fs.mkdir(output, { recursive: false });
  const outputStat = await fs.lstat(output);
  async function writeNew(name, bytes) {
    await noSymlinks(output);
    const current = await fs.lstat(output);
    if (
      current.isSymbolicLink() ||
      !current.isDirectory() ||
      current.ino !== outputStat.ino ||
      current.dev !== outputStat.dev
    )
      error("Output directory changed; remaining writes refused.");
    const handle = await fs.open(
      path.join(output, name),
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        (constants.O_NOFOLLOW || 0),
      0o600,
    );
    try {
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
  }
  for (const archive of result.archives)
    await writeNew(archive.name, archive.bytes);
  await writeNew("receipt.json", result.receiptText);
  process.stdout.write(
    JSON.stringify(
      {
        output,
        parts: result.archives.length,
        includedFiles: result.plan.files.length,
        excludedFiles: result.plan.excluded.length,
        capBytes,
        receipt: path.join(output, "receipt.json"),
      },
      null,
      2,
    ) + "\n",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((cause) => {
    const message = String(cause.message).replace(
      /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu,
      (character) => `\\u{${character.codePointAt(0).toString(16)}}`,
    );
    process.stderr.write(`Sidecar Pack: ${message}\n`);
    process.exitCode = 1;
  });
}
