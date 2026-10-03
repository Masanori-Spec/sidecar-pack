import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
const paths = [];
async function walk(dir) {
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) await walk(path);
    else if (/\.(m?js)$/.test(path)) paths.push(path);
  }
}
for (const dir of ["src", "web", "scripts", "test"]) await walk(dir);
for (const path of paths) {
  const run = spawnSync(process.execPath, ["--check", path], {
    stdio: "inherit",
  });
  if (run.status !== 0) process.exit(run.status || 1);
}
console.log(`Syntax checked ${paths.length} JavaScript modules.`);
