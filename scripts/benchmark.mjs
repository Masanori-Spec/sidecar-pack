import { performance } from "node:perf_hooks";
import { writeFile } from "node:fs/promises";
import os from "node:os";
import { buildArchives, LIMITS } from "../src/core.js";
const count = LIMITS.maxFiles,
  total = LIMITS.maxTotalBytes;
const each = Math.floor(total / count),
  remainder = total % count;
const files = Array.from({ length: count }, (_, i) => ({
  path: `fixture/photo-${String(i).padStart(4, "0")}.raw`,
  size: each + (i < remainder ? 1 : 0),
}));
const assignments = Object.fromEntries(files.map((f) => [f.path, f.path]));
const sizeByPath = new Map(files.map((f) => [f.path, f.size]));
const startRss = process.memoryUsage().rss,
  started = performance.now();
const result = await buildArchives({
  files,
  assignments,
  capBytes: LIMITS.maxPartBytes,
  readFile: (path) => new Uint8Array(sizeByPath.get(path)).fill(path.length),
});
const milliseconds = performance.now() - started;
const report = {
  benchmark: "Sidecar Pack bounded synthetic maximum selected input",
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  cpu: os.cpus()[0]?.model || "unknown",
  files: count,
  sourceBytes: total,
  capBytes: LIMITS.maxPartBytes,
  parts: result.archives.map(({ name, size }) => ({ name, size })),
  milliseconds: Math.round(milliseconds * 100) / 100,
  rssBeforeBytes: startRss,
  rssAfterBytes: process.memoryUsage().rss,
  processPeakRssBytes: process.resourceUsage().maxRSS * 1024,
  caveats: [
    "Single synthetic run, not a speed guarantee.",
    "All completed ZIPs are retained in memory; this is not a streaming implementation.",
    "Process peak RSS includes Node, source snapshots, archive storage and hash buffers.",
    "Original disk IO, browser memory and user downloads are not measured.",
  ],
};
if (result.archives.some((a) => a.size > LIMITS.maxPartBytes))
  throw new Error("Benchmark cap violation");
console.log(JSON.stringify(report, null, 2));
const i = process.argv.indexOf("--out");
if (i >= 0) {
  if (!process.argv[i + 1]) throw new Error("--out needs a path");
  await writeFile(process.argv[i + 1], JSON.stringify(report, null, 2) + "\n");
}
