import test from "node:test";
import assert from "node:assert/strict";
import {
  LIMITS,
  inspectFiles,
  parseCap,
  makePlan,
  buildArchives,
} from "../src/core.js";
import {
  file,
  own,
  zipSize,
  bytesFor,
  readStoreZip,
  sha,
  slowCrc,
} from "./helpers.js";

test("published limits are bounded and explicit", () => {
  assert.deepEqual(LIMITS, {
    maxFiles: 1000,
    maxTotalBytes: 134217728,
    maxPartBytes: 67108864,
    maxParts: 100,
    maxPathBytes: 1024,
  });
});
test("B, decimal MB and binary MiB are distinct", () => {
  assert.equal(parseCap("123", "B"), 123);
  assert.equal(parseCap("1", "MB"), 1_000_000);
  assert.equal(parseCap("1", "MiB"), 1_048_576);
  for (const n of ["0", "-1", "NaN", "Infinity", "junk"])
    assert.throws(() => parseCap(n, "B"));
  assert.throws(() => parseCap("1", "GB"));
});
test("only exact appended .xmp gets a suggestion; variants need explicit review", () => {
  const files = [
    "a.CR2",
    "a.CR2.xmp",
    "a.xmp",
    "a_01.CR2.xmp",
    "orphan.xmp",
    "note.txt",
  ].map((p) => file(p, 1));
  const scanned = inspectFiles(files);
  const byPath = Object.fromEntries(scanned.entries.map((e) => [e.path, e]));
  assert.equal(scanned.totalBytes, 6);
  assert.equal(byPath["a.CR2.xmp"].suggestedGroup, "a.CR2");
  for (const p of ["a.xmp", "a_01.CR2.xmp", "orphan.xmp"]) {
    assert.equal(byPath[p].suggestedGroup, null);
    assert.equal(byPath[p].needsReview, true);
  }
});
test("every entry needs a reviewed assignment, including benign originals", () => {
  const files = [file("a.raw", 1), file("a.raw.xmp", 2)];
  assert.throws(() => makePlan(files, {}, 1000));
  assert.throws(() => makePlan(files, { "a.raw": "a.raw" }, 1000));
  assert.throws(() =>
    makePlan(files, { "a.raw": null, "a.raw.xmp": "a.raw" }, 1000),
  );
  assert.throws(() =>
    makePlan(files, { "a.raw": "missing", "a.raw.xmp": "a.raw" }, 1000),
  );
  const plan = makePlan(
    files,
    { "a.raw": "a.raw", "a.raw.xmp": "a.raw" },
    1000,
  );
  assert.equal(plan.parts.length, 1);
  assert.deepEqual(
    plan.parts[0].files.map((f) => f.group),
    ["a.raw", "a.raw"],
  );
});
test("assignment inheritance cannot implicitly approve a file", () => {
  const files = [file("a.raw", 1)];
  assert.throws(() =>
    makePlan(files, Object.create({ "a.raw": "a.raw" }), 1000),
  );
});
test("exclusions are explicit and never appear in ZIP parts", () => {
  const files = [file("a.raw", 3), file("skip.txt", 5)];
  const plan = makePlan(files, { "a.raw": "a.raw", "skip.txt": null }, 1000);
  assert.deepEqual(plan.excluded, ["skip.txt"]);
  assert.deepEqual(
    plan.parts.flatMap((p) => p.files.map((f) => f.path)),
    ["a.raw"],
  );
});
test("zero bytes and multibyte filenames count exact actual ZIP overhead", async () => {
  const files = [file("資料/写真.raw", 0), file("資料/写真.raw.xmp", 7)];
  const assignments = {
    "資料/写真.raw": "資料/写真.raw",
    "資料/写真.raw.xmp": "資料/写真.raw",
  };
  const exact = zipSize(files);
  const plan = makePlan(files, assignments, exact);
  assert.equal(plan.parts[0].size, exact);
  assert.throws(() => makePlan(files, assignments, exact - 1));
  const result = await buildArchives({
    files,
    assignments,
    capBytes: exact,
    readFile: (p) => bytesFor(p, files.find((f) => f.path === p).size),
  });
  assert.equal(result.archives[0].bytes.length, exact);
  readStoreZip(result.archives[0].bytes);
});
test("an indivisible group refuses an oversize cap rather than emitting an oversize part", () => {
  const files = [file("a.raw", 100), file("a.raw.xmp", 100)];
  assert.throws(() =>
    makePlan(
      files,
      { "a.raw": "a.raw", "a.raw.xmp": "a.raw" },
      zipSize(files) - 1,
    ),
  );
});
test("path policy rejects traversal, absolute, backslash, device, controls and conflicts", () => {
  for (const path of [
    "",
    "/tmp/a",
    "../a",
    "a/../b",
    "./a",
    "a//b",
    "a\\b",
    "C:/a",
    "a\0b",
    "a\nb",
    "a:b",
    "CON",
    "aux.txt",
    "a.",
    "a ",
  ]) {
    assert.throws(() => inspectFiles([file(path, 0)]), path);
  }
  for (const paths of [
    ["A.raw", "a.raw"],
    ["café.raw", "cafe\u0301.raw"],
    ["folder", "folder/file.raw"],
    ["same", "same"],
  ])
    assert.throws(
      () => inspectFiles(paths.map((p) => file(p, 0))),
      paths.join(" / "),
    );
  assert.equal(
    inspectFiles([file("folder/写真 [1].raw", 0)]).entries[0].path,
    "folder/写真 [1].raw",
  );
});
test("unsafe sizes, file count, total cap, part cap and too many parts are rejected", () => {
  for (const size of [-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => inspectFiles([file("a", size)]));
  assert.throws(() =>
    inspectFiles(
      Array.from({ length: LIMITS.maxFiles + 1 }, (_, i) => file(`f${i}`, 0)),
    ),
  );
  assert.throws(() => inspectFiles([file("a", LIMITS.maxTotalBytes + 1)]));
  const files = [file("a", 1)];
  assert.throws(() => makePlan(files, own(files), LIMITS.maxPartBytes + 1));
  const many = Array.from({ length: 101 }, (_, i) =>
    file(`f${String(i).padStart(3, "0")}`, 1),
  );
  assert.throws(() => makePlan(many, own(many), zipSize([many[0]])));
});
test("seeded property cases preserve groups, unique inclusion, cap and permutation invariance", () => {
  let state = 0x534350;
  const random = (n) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state % n;
  };
  for (let iteration = 0; iteration < 160; iteration++) {
    const files = [],
      assignments = {};
    const count = 1 + random(12);
    for (let group = 0; group < count; group++) {
      const anchor = `g${String(group).padStart(2, "0")}.raw`;
      for (let j = 0; j < 1 + random(3); j++) {
        const path = j === 0 ? anchor : `${anchor}.${j}.xmp`;
        files.push(file(path, random(400)));
        assignments[path] = anchor;
      }
    }
    const cap = 2000;
    const plan = makePlan(files, assignments, cap);
    assert.deepEqual(
      makePlan(
        [...files].reverse(),
        Object.fromEntries(Object.entries(assignments).reverse()),
        cap,
      ),
      plan,
    );
    const emitted = plan.parts.flatMap((p) => p.files);
    assert.deepEqual(
      emitted.map((f) => f.path).sort(),
      files.map((f) => f.path).sort(),
    );
    assert.equal(new Set(emitted.map((f) => f.path)).size, files.length);
    const groupParts = new Map();
    for (const [partIndex, part] of plan.parts.entries()) {
      assert.equal(part.size, zipSize(part.files));
      assert.ok(part.size <= cap);
      for (const f of part.files) {
        if (groupParts.has(f.group))
          assert.equal(groupParts.get(f.group), partIndex);
        else groupParts.set(f.group, partIndex);
      }
    }
  }
});
test("archive bytes, CRCs, SHA-256 and receipt match independent readers and repeat exactly", async () => {
  const files = [
    file("one.raw", 300),
    file("one.raw.xmp", 20),
    file("two.raw", 250),
    file("三.raw", 100),
    file("empty.txt", 0),
  ];
  const assignments = own(files);
  assignments["one.raw.xmp"] = "one.raw";
  const readFile = (p) => bytesFor(p, files.find((f) => f.path === p).size);
  const options = { files, assignments, capBytes: 700, readFile };
  const first = await buildArchives(options);
  const second = await buildArchives({
    ...options,
    files: [...files].reverse(),
  });
  assert.equal(first.receiptText, second.receiptText);
  assert.deepEqual(JSON.parse(first.receiptText), first.receipt);
  assert.equal(first.archives.length, first.plan.parts.length);
  const paths = [];
  for (let i = 0; i < first.archives.length; i++) {
    const a = first.archives[i];
    assert.deepEqual(a.bytes, second.archives[i].bytes);
    assert.equal(a.sha256, sha(a.bytes));
    assert.equal(a.size, a.bytes.length);
    assert.ok(a.size <= 700);
    for (const entry of readStoreZip(a.bytes)) {
      assert.deepEqual(entry.bytes, Buffer.from(readFile(entry.path)));
      paths.push(entry.path);
    }
  }
  assert.deepEqual(paths.sort(), files.map((f) => f.path).sort());
  assert.equal(slowCrc(Buffer.from("123456789")), 0xcbf43926);
  assert.deepEqual(
    first.receipt.archives,
    first.archives.map(({ name, size, sha256 }) => ({ name, size, sha256 })),
  );
  for (const record of first.receipt.files) {
    assert.equal(record.sha256, sha(readFile(record.path)));
    assert.equal(record.group, assignments[record.path]);
    assert.ok(first.archives.some((a) => a.name === record.part));
  }
  assert.deepEqual(
    first.receipt.files.map((f) => f.path).sort(),
    files.map((f) => f.path).sort(),
  );
});
test("read failures and changed content length fail the build", async () => {
  const files = [file("a", 3)],
    assignments = own(files);
  await assert.rejects(
    buildArchives({
      files,
      assignments,
      capBytes: 1000,
      readFile: () => new Uint8Array(2),
    }),
  );
  await assert.rejects(
    buildArchives({
      files,
      assignments,
      capBytes: 1000,
      readFile: () => {
        throw new Error("Read denied");
      },
    }),
  );
});

test("Buffer sources are snapshotted before progress callbacks can mutate them", async () => {
  const source = Buffer.from([1, 2, 3]);
  const files = [file("a.raw", 3)];
  const result = await buildArchives({
    files,
    assignments: own(files),
    capBytes: 200,
    readFile: () => source,
    onProgress: () => source.fill(9),
  });
  const [entry] = readStoreZip(result.archives[0].bytes);
  assert.deepEqual(entry.bytes, Buffer.from([1, 2, 3]));
  assert.equal(result.receipt.files[0].sha256, entry.sha256);
});

test("extensionless basename and numbered sidecars never silently infer a family", () => {
  const entries = inspectFiles([
    file("photo", 1),
    file("photo.xmp", 1),
    file("photo_01.raw.xmp", 1),
  ]).entries;
  for (const path of ["photo.xmp", "photo_01.raw.xmp"]) {
    const e = entries.find((e) => e.path === path);
    assert.equal(e.suggestedGroup, null);
    assert.equal(e.needsReview, true);
  }
});
test("fractional byte caps are rejected but exact decimal units remain precise", () => {
  assert.equal(parseCap("1.5MiB"), 1572864);
  assert.equal(parseCap("0.000123MB"), 123);
  assert.equal(parseCap("64MiB"), LIMITS.maxPartBytes);
  assert.throws(() => parseCap("0.1B"));
  assert.throws(() => parseCap("0.0000001MB"));
  assert.throws(() => parseCap("64.000001MiB"));
});
test("hostile property names are data, while unknown assignments and cycles are rejected", () => {
  const files = [
    file("__proto__", 0),
    file("constructor", 0),
    file("toString", 0),
  ];
  assert.equal(makePlan(files, own(files), 1000).files.length, 3);
  assert.throws(() =>
    makePlan([file("a", 0)], { a: "a", surprise: "a" }, 1000),
  );
  assert.throws(() =>
    makePlan([file("a", 0), file("b", 0)], { a: "b", b: "a" }, 1000),
  );
});

test("Unicode control, format and line separators are refused while visible Unicode stays intact", () => {
  for (const invisible of [
    "\u0085",
    "\u061c",
    "\u200d",
    "\u2028",
    "\u2029",
    "\u202e",
    "\ud800",
  ]) {
    assert.throws(() => inspectFiles([file(`a${invisible}.raw`, 0)]));
  }
  assert.equal(
    inspectFiles([file("写真/📷.raw", 0)]).entries[0].path,
    "写真/📷.raw",
  );
});

test("unsafe filenames in diagnostics cannot inject terminal or bidi controls", () => {
  for (const path of ["a\u001b[31m.raw", "a\u061c.raw", "a\n.raw"]) {
    assert.throws(
      () => inspectFiles([file(path, 0)]),
      (error) => {
        assert.ok(!/[\p{Cc}\p{Cf}]/u.test(error.message));
        return true;
      },
    );
  }
});
