# Sidecar Pack

Keep reviewed original + XMP families together in independently extractable ZIP parts. Set a byte cap, resolve uncertain pairings, review the plan, and download the ZIPs with a separate SHA-256 receipt.

**A small, local-only tool for bounded photo handoffs.** It does not decode images, parse XMP/XML, upload files, compress, encrypt, or change originals. Accepted paths and file contents are preserved byte-for-byte. ZIP filesystem timestamps and permissions are deliberately fixed.

## Why this exists

Independent ZIP parts and First-Fit Decreasing packing already exist. This project combines a narrower workflow: explicitly reviewed sidecar families, a hard cap on **actual ZIP bytes**, refusal when an indivisible family cannot fit, and a separate reproducible receipt. There is no claim of algorithmic novelty, optimal packing, established user demand, or superiority to general archive tools. See [comparison and evidence](docs/comparison.md).

## Run locally

Node.js 22 or newer is required for the CLI. There are no runtime dependencies.

```sh
node src/cli.js --help
npm run serve
# Open http://127.0.0.1:4173/web/index.html
```

The browser uses local file selection and client-side processing. The local server binds only to 127.0.0.1. Serve from HTTP locally or HTTPS when hosting; Web Crypto support is required. Keep enough free memory: completed archives remain in memory until released.

## CLI example

```sh
node src/cli.js inspect ./photos
node src/cli.js pack ./photos --out ./new-parts --cap 25MiB --reviewed
node src/cli.js check ./new-parts/receipt.json
```

`inspect` prints suggestions and unresolved files. Exact appended `original.ext.xmp` names may be suggested only when their original is selected. The presence of matching names does not establish semantic correctness: review the entire selection.

Basename-only, numbered and orphan sidecars need an explicit decision. To resolve them, create a JSON map **outside the input directory**, for example:

```json
{
  "photo.xmp": "photo.CR2",
  "photo_01.CR2.xmp": "photo.CR2",
  "orphan.xmp": "orphan.xmp",
  "private-note.txt": null
}
```

```sh
node src/cli.js pack ./photos --out ./new-parts --cap 25MiB --reviewed --groups ./groups.json
```

A map entry selects a group anchor, a self-assigned singleton, or `null` for explicit exclusion. Anchors must be included and self-assigned. The CLI overlays this map on its unambiguous suggestions. `--reviewed` confirms review; it never overrides unresolved paths, unsafe names, or an oversize group. `--out` must not exist, its parent must exist, and it must be outside the input tree. All scanned regular files, including hidden files, count toward the selection limits.

## Exact scope and limits

- At most 1,000 selected files and 128 MiB of selected source bytes
- At most 64 MiB per ZIP part and 100 parts
- Maximum path length: 1,024 UTF-8 bytes; maximum component: 255 UTF-8 bytes
- B is bytes; MB is 1,000,000 B; MiB is 1,048,576 B
- STORE-only ZIP32; deterministic order, CRC32, UTF-8 filenames, fixed 1980-01-01 timestamps and regular-file 0644 attributes
- No extra fields, comments, data descriptors, directory entries, encryption, ZIP64 or compression
- Each ZIP is a complete archive; no binary reassembly is needed
- A family larger than the cap is refused. First-Fit Decreasing is deterministic and does not guarantee a minimum part count
- The cap excludes the receipt, transport/base64 overhead, email body and provider-specific size rules
- Filename checks are conservative, but cannot guarantee compatibility with every destination filesystem or extraction tool

The size equation for this restricted profile is:

```text
22 + sum(file_bytes + 76 + 2 * utf8_path_bytes)
```

The 22 bytes close each archive; each file has a 30-byte local header and 46-byte central header, and its name appears twice. The code checks emitted sizes against the plan. See [format](docs/format.md).

## Receipt verification

Each `receipt.json` records every included path, byte size, SHA-256, group and part, explicit exclusions, and every ZIP's byte size and SHA-256. The receipt is outside all ZIPs.

`check` hashes ZIP files and compares their sizes with the receipt. It **does not extract archives, rehash original files, or validate the receipt's source-file declarations**. Hashes show consistency with the supplied receipt, not the authenticity or trustworthiness of its sender. An attacker who replaces both ZIPs and receipt can create a matching set. Do not treat it as a signature.

## Verify the project

Python 3 and Info-ZIP `unzip` are needed for the independent-reader tests. Playwright is a development dependency only.

```sh
npm ci --ignore-scripts
npm run verify
npm run benchmark -- --out benchmark-local.json
npx playwright install --with-deps chromium
npm run test:browser
```

`npm run build` copies browser files and the shared core to `dist/`, preserving relative module paths. The entry point is `dist/web/index.html`; serve the **dist root**, not only its web subdirectory.

[Verification notes](docs/verification.md) distinguish executed checks from pending browser/remote CI checks. [Security and limitations](docs/security.md) describe data handling and the threat boundary. [Local benchmark](docs/benchmark-local.json) is a single synthetic measurement, not a browser-memory or throughput guarantee.
