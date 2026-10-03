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

Local Chromium was deliberately not launched in the restricted local environment. No sandbox-disabling fallback was used.

The [first published CI run](https://github.com/Masanori-Spec/sidecar-pack/actions/runs/37138926725) completed successfully on 2026-10-03 for commit `987c960156f76b779a590f7588b5ae3e98d82c45`:

- Node 22 and Node 24: all 28 unit/integration tests, syntax checks, formatting, static build, and synthetic benchmark passed
- Chromium 141 / Playwright 1.56.0: all 14 browser cases passed in 10.9 seconds, with `chromiumSandbox: true`
- Browser cases cover review/grouping, ZIP/receipt downloads, exact caps, unsafe names, cancellation, stale results, read failures, URL cleanup, reset/reselection, folder-root parity, keyboard dialogs, back navigation and desktop/mobile layouts
- Downloaded `browser-evidence` artifact SHA-256: `4a7b3db26abb9501a6b1f96e29012de1f13e087342174f8e205e2fed1a292936`
- All four retained screenshots were visually inspected: Japanese desktop initial/completed states and Japanese/English mobile initial/completed states. Labels, controls, generated ZIP/receipt links and narrow-screen flow were readable without overlap or horizontal clipping in these captures

Screenshots in [screenshots/](screenshots/) were copied byte-for-byte from that artifact. They use the synthetic demo, not real photographs or user data. The subsequent documentation/screenshot commit does not change application code, tests, or workflow. Each publication commit still triggers the full workflow; inspect the latest run for that commit rather than assuming an earlier run applies.

Automated Chromium checks and selected screenshots are not evidence for every browser, device, assistive technology, memory limit, or real-world photo workflow. This is bounded implementation evidence, not a claim of universal compatibility.

GitHub reported maintenance warnings that the v4 action releases target deprecated Node 20 and are being run on Node 24. The jobs succeeded; upgrade the actions and revalidate in a maintenance update.

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
