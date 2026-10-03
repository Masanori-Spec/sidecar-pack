import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { buildArchives } from "../src/core.js";
import { own, bytesFor, sha } from "./helpers.js";

test("Python zipfile and system unzip independently read every part and preserve bytes", async () => {
  const temp = await mkdtemp(join(tmpdir(), "sidecar-readers-"));
  try {
    const files = [
      { path: "photos/a.raw", size: 511 },
      { path: "photos/a.raw.xmp", size: 23 },
      { path: "photos/b.raw", size: 500 },
      { path: "資料/三.raw", size: 71 },
      { path: "empty.txt", size: 0 },
    ];
    const assignments = own(files);
    assignments["photos/a.raw.xmp"] = "photos/a.raw";
    const result = await buildArchives({
      files,
      assignments,
      capBytes: 1000,
      readFile: (p) => bytesFor(p, files.find((f) => f.path === p).size),
    });
    const expected = Object.fromEntries(
      files.map((f) => [
        f.path,
        { size: f.size, sha256: sha(bytesFor(f.path, f.size)) },
      ]),
    );
    await writeFile(join(temp, "expected.json"), JSON.stringify(expected));
    for (const archive of result.archives)
      await writeFile(join(temp, archive.name), archive.bytes);
    const python = spawnSync(
      "python3",
      [
        "-c",
        `
import hashlib, json, pathlib, sys, zipfile
root=pathlib.Path(sys.argv[1]); expected=json.loads((root/'expected.json').read_text()); seen=[]; archives=[]
for path in sorted(root.glob('*.zip')):
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None
        assert z.comment == b''
        for info in z.infolist():
            data=z.read(info.filename); target=expected[info.filename]
            assert len(data)==target['size'] and hashlib.sha256(data).hexdigest()==target['sha256']
            assert info.compress_type==zipfile.ZIP_STORED and info.flag_bits==0x800
            assert info.extra==b'' and info.comment==b'' and info.date_time==(1980,1,1,0,0,0)
            seen.append(info.filename)
        archives.append({'name':path.name, 'size':path.stat().st_size, 'entries':len(z.infolist())})
assert sorted(seen)==sorted(expected) and len(seen)==len(set(seen))
print(json.dumps({'reader':'Python zipfile', 'files':len(seen), 'archives':archives}))
`,
        temp,
      ],
      { encoding: "utf8" },
    );
    assert.equal(python.status, 0, python.stderr || python.stdout);
    const report = JSON.parse(python.stdout);
    assert.equal(report.files, files.length);
    assert.equal(report.archives.length, result.archives.length);
    const extracted = join(temp, "extracted");
    await mkdir(extracted);
    for (const archive of result.archives) {
      const check = spawnSync("unzip", ["-t", join(temp, archive.name)], {
        encoding: "utf8",
      });
      assert.equal(check.status, 0, check.stderr || check.stdout);
      const extract = spawnSync(
        "unzip",
        ["-q", join(temp, archive.name), "-d", extracted],
        { encoding: "utf8", env: { ...process.env, LANG: "C.UTF-8" } },
      );
      assert.equal(extract.status, 0, extract.stderr || extract.stdout);
    }
    for (const file of files)
      assert.equal(
        sha(await readFile(join(extracted, file.path))),
        expected[file.path].sha256,
      );
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});
