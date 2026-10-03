import { cp, mkdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
await rm(`${root}/dist`, { recursive: true, force: true });
await mkdir(`${root}/dist`, { recursive: true });
await cp(`${root}/web`, `${root}/dist/web`, { recursive: true });
await mkdir(`${root}/dist/src`, { recursive: true });
await cp(`${root}/src/core.js`, `${root}/dist/src/core.js`);
console.log(
  "Built dist/web/index.html (same relative module paths; no bundler or runtime dependencies).",
);
