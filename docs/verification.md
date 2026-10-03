# Verification and evidence

## Checks executed locally on 2026-10-03

- Node.js v24.19.0 unit/integration suite: 28 tests passing at the final local integration checkpoint
- All 13 JavaScript modules pass syntax checks; source formatting and static build pass
- 14 sandbox-enabled browser cases collect successfully without launching Chromium
- 160 seeded planner cases assert unique inclusion, intact groups, actual modeled cap and input/assignment permutation invariance
- Explicit exact-fit and one-byte-too-small boundaries, zero-byte files, Unicode filenames, unsafe names, collisions, prefix conflicts, limits, review/anchor rules and inherited assignment refusal
- Independent bit-at-a-time CRC32 and a narrow ZIP record parser validate generated structure and bytes
- Python `zipfile` reads every member and validates CRC, SHA-256, STORE, flags, fixed timestamps and empty comments/extras
- System Info-ZIP `unzip` tests and extracts every generated part; extracted bytes and Japanese paths match fixtures
- CLI integration covers a 1,001-file selection bound, inspect/pack/check, original-file hash/mtime/mode preservation, corrupted ZIP refusal, unresolved files, explicit exclusions, symlink rejection, existing output, output-inside-input and malicious receipt paths
- Receipt checking rejects a forged aggregate of three 64 MiB archive records before any archive read
- Static HTTP smoke checks confirm root/module/style responses, MIME types, method refusal and encoded traversal refusal
- A Buffer-aliasing regression verifies source snapshots remain stable after a progress callback mutates the reader's original Buffer

The independent unzip reader exposed a UTF-8 interoperability issue with a DOS made-by header. A fixed Unix made-by value resolved it without changing the archive size. The regression remains in the test suite.

## Benchmark

[benchmark-local.json](benchmark-local.json) records one maximum-selected-input synthetic run: 1,000 files, 134,217,728 source bytes, and 67,108,864-byte part cap. It produced three parts, each within the cap. The initial run took 1,496.02 ms and recorded 389,079,040 bytes process peak RSS on the named local CPU/Node environment.

This is not a throughput guarantee, a browser-memory measurement, an original disk IO benchmark, or evidence of performance on all machines. JSON caveats and environment fields are part of the result. Re-run `npm run benchmark -- --out benchmark-local.json` to obtain a new measurement; do not overwrite the historical JSON silently when citing its figures.

## Browser and remote CI status

Local Chromium was deliberately not launched in this restricted environment. No sandbox-disabling fallback is allowed. Browser tests and responsive screenshots must be executed through the sandbox-enabled CI job before claiming browser verification. At document creation, remote CI and screenshot evidence are pending; a workflow file is not evidence of a successful run.

The browser suite covers review/grouping, ZIP/receipt downloads, exact caps, unsafe names, cancellation, stale results, read failures, URL cleanup, reset/reselection, folder-root parity, keyboard dialogs, back navigation and desktop/mobile screenshots. These are prepared cases, not executed browser evidence.

CI runs core tests, syntax checks, formatting and a static build on Node 22 and 24, plus a separate browser job. Browser tests are configured by the UI implementation. Record the exact tested commit and CI URL when publishing a verification claim.

The pinned `ubuntu-22.04` runner is in deprecation and retires on 2027-04-17 according to the [official runner-images notice](https://github.com/actions/runner-images/issues/14254). Migrate and revalidate a supported sandbox-capable runner before that date. Playwright's [`chromiumSandbox` launch option](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-chromium-sandbox) must remain enabled.

## Reproduce

```sh
npm ci --ignore-scripts
npm run verify
npm run benchmark
npx playwright install --with-deps chromium
npm run test:browser
```

The independent-reader test requires Python 3 and the `unzip` executable. It fails visibly if either reader is unavailable; it does not silently replace independent checks with the production implementation. Test extraction is limited to generated temporary fixtures, which are deleted after the test.
