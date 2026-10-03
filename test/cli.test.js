import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  stat,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { sha, readStoreZip } from "./helpers.js";
const cli = resolve("src/cli.js");
const run = (...args) =>
  spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
const good = (result) => {
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
};
const bad = (result) =>
  assert.notEqual(result.status, 0, "Expected a refused operation");
async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), "sidecar-cli-"));
  const input = join(root, "input");
  await mkdir(input);
  await writeFile(join(input, "a.raw"), Buffer.from("original bytes"));
  await writeFile(join(input, "a.raw.xmp"), Buffer.from("<opaque/>"));
  try {
    await fn({ root, input, out: join(root, "output") });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("inspect, pack, receipt check and independent ZIP read preserve originals", () =>
  fixture(async ({ root, input, out }) => {
    const before = {};
    for (const name of await readdir(input))
      before[name] = {
        hash: sha(await readFile(join(input, name))),
        stat: await stat(join(input, name)),
      };
    const inspected = good(run("inspect", input));
    assert.equal(inspected.assignments["a.raw.xmp"], "a.raw");
    assert.deepEqual(inspected.unresolved, []);
    const packed = good(
      run("pack", input, "--out", out, "--cap", "1MiB", "--reviewed"),
    );
    assert.equal(packed.parts, 1);
    const receipt = JSON.parse(
      await readFile(join(out, "receipt.json"), "utf8"),
    );
    assert.equal(good(run("check", join(out, "receipt.json"))).checked, 1);
    assert.equal(
      good(run("check", join(out, "receipt.json"), "--dir", out)).checked,
      1,
    );
    const archive = await readFile(join(out, receipt.archives[0].name));
    assert.equal(sha(archive), receipt.archives[0].sha256);
    const entries = readStoreZip(archive);
    assert.deepEqual(entries.map((f) => f.path).sort(), ["a.raw", "a.raw.xmp"]);
    for (const name of await readdir(input)) {
      assert.equal(sha(await readFile(join(input, name))), before[name].hash);
      const after = await stat(join(input, name));
      assert.equal(after.mtimeMs, before[name].stat.mtimeMs);
      assert.equal(after.mode, before[name].stat.mode);
    }
    const tampered = Buffer.from(archive);
    tampered[40] ^= 1;
    await writeFile(join(out, receipt.archives[0].name), tampered);
    bad(run("check", join(out, "receipt.json")));
  }));
test("pack refuses missing review, missing units, unknown flags, overwrite and output inside input", () =>
  fixture(async ({ root, input, out }) => {
    bad(run("pack", input, "--out", out, "--cap", "1MiB"));
    assert.ok(!(await readdir(root)).includes("output"));
    bad(run("pack", input, "--out", out, "--cap", "1000", "--reviewed"));
    bad(
      run(
        "pack",
        input,
        "--out",
        out,
        "--cap",
        "1MiB",
        "--reviewed",
        "--unknown",
      ),
    );
    bad(
      run(
        "pack",
        input,
        "--out",
        join(input, "parts"),
        "--cap",
        "1MiB",
        "--reviewed",
      ),
    );
    await mkdir(out);
    await writeFile(join(out, "keep.txt"), "keep");
    bad(run("pack", input, "--out", out, "--cap", "1MiB", "--reviewed"));
    assert.equal(await readFile(join(out, "keep.txt"), "utf8"), "keep");
  }));
test("ambiguous sidecars block until explicit grouping, singleton or exclusion", () =>
  fixture(async ({ root, input, out }) => {
    await writeFile(join(input, "a.xmp"), "ambiguous");
    await writeFile(join(input, "a_01.raw.xmp"), "version");
    const scanned = good(run("inspect", input));
    assert.deepEqual(scanned.unresolved, ["a.xmp", "a_01.raw.xmp"]);
    bad(run("pack", input, "--out", out, "--cap", "1MiB", "--reviewed"));
    assert.ok(!(await readdir(root)).includes("output"));
    const groups = join(root, "groups.json");
    await writeFile(
      groups,
      JSON.stringify({ "a.xmp": null, "a_01.raw.xmp": "a.raw" }),
    );
    good(
      run(
        "pack",
        input,
        "--out",
        out,
        "--cap",
        "1MiB",
        "--reviewed",
        "--groups",
        groups,
      ),
    );
    const receipt = JSON.parse(
      await readFile(join(out, "receipt.json"), "utf8"),
    );
    assert.deepEqual(receipt.excluded, ["a.xmp"]);
    assert.equal(
      receipt.files.find((f) => f.path === "a_01.raw.xmp").group,
      "a.raw",
    );
  }));
test("symlinks in input, input ancestors, output ancestors and receipt targets are refused", () =>
  fixture(async ({ root, input, out }) => {
    const linked = join(input, "alias");
    await symlink(join(input, "a.raw"), linked);
    bad(run("inspect", input));
    await rm(linked);
    const alias = join(root, "input-link");
    await symlink(input, alias);
    bad(run("inspect", alias));
    const parent = join(root, "target");
    await mkdir(parent);
    await symlink(parent, join(root, "output-link"));
    bad(
      run(
        "pack",
        input,
        "--out",
        join(root, "output-link", "parts"),
        "--cap",
        "1MiB",
        "--reviewed",
      ),
    );
    good(run("pack", input, "--out", out, "--cap", "1MiB", "--reviewed"));
    const receipt = JSON.parse(
      await readFile(join(out, "receipt.json"), "utf8"),
    );
    const archive = join(out, receipt.archives[0].name);
    await rm(archive);
    await symlink(join(input, "a.raw"), archive);
    bad(run("check", join(out, "receipt.json")));
  }));
test("receipt archive paths cannot escape its ZIP directory and invalid JSON is refused", () =>
  fixture(async ({ root, input, out }) => {
    good(run("pack", input, "--out", out, "--cap", "1MiB", "--reviewed"));
    const path = join(out, "receipt.json");
    const receipt = JSON.parse(await readFile(path, "utf8"));
    receipt.archives[0].name = "../input/a.raw";
    await writeFile(path, JSON.stringify(receipt));
    bad(run("check", path));
    await writeFile(path, "{");
    bad(run("check", path));
  }));
test("unsafe filenames are rejected before output creation", () =>
  fixture(async ({ root, input, out }) => {
    await writeFile(join(input, "A.RAW"), "case collision");
    bad(run("pack", input, "--out", out, "--cap", "1MiB", "--reviewed"));
    assert.ok(!(await readdir(root)).includes("output"));
  }));

test("directory enumeration refuses a 1001-file selection before any output is created", () =>
  fixture(async ({ root, input, out }) => {
    for (let index = 0; index < 999; index++)
      await writeFile(
        join(input, `extra-${String(index).padStart(4, "0")}.txt`),
        "",
      );
    const result = run(
      "pack",
      input,
      "--out",
      out,
      "--cap",
      "1MiB",
      "--reviewed",
    );
    bad(result);
    assert.match(result.stderr, /1000/);
    assert.ok(!(await readdir(root)).includes("output"));
  }));

test("receipt aggregate byte bound is enforced before opening any archive", () =>
  fixture(async ({ root, input, out }) => {
    const receipt = {
      format: "sidecar-pack-receipt",
      version: 1,
      capBytes: 67108864,
      archives: [1, 2, 3].map((i) => ({
        name: `part-${String(i).padStart(3, "0")}.zip`,
        size: 67108864,
        sha256: "0".repeat(64),
      })),
    };
    const path = join(root, "receipt.json");
    await writeFile(path, JSON.stringify(receipt));
    const result = run("check", path, "--dir", root);
    bad(result);
    assert.match(result.stderr, /bounded profile total/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }));
