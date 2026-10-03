# Security, privacy and failure boundaries

## Local data handling

The core and CLI have no network calls or runtime third-party dependencies. Files are opaque byte arrays; there is no image decoder, XML parser, script evaluation or archive extraction in the application. The browser uses selected local files and client-side generation. ZIPs and receipts are unencrypted. A receipt exposes accepted filenames, grouping and content hashes, so review it before sharing it.

This tool does not delete or modify input files. The CLI refuses symlinks, non-regular input files, symlink path components, output within the input tree, and an existing output directory. Hidden regular files are included in scanning; inspect the selection before acknowledging review. An exclusions map placed inside the selected input would itself be selected, so store it elsewhere.

## Path policy

Absolute paths, traversal and dot components, empty components, backslashes, Unicode control/format characters (including zero-width joiners), line separators, Windows reserved devices/characters, trailing dots/spaces, case/NFC-equivalent collisions and file/directory prefix conflicts are rejected. Accepted names are retained rather than sanitized or normalized. Conservative comparison may reject names that a particular filesystem could otherwise support. The 1,024-byte full-path and 255-byte component bounds are not a guarantee for all extraction roots, destination encodings or filesystem APIs.

The CLI receipt checker restricts archive names to numbered part ZIPs and refuses duplicate records or symlink targets. It never uses source-file paths from the receipt to read or write files, and never extracts an archive.

## Resource and filesystem boundary

Input size/count and archive size/count are bounded. Receipt checking validates the aggregate archive-byte bound before opening any ZIP, preventing a forged list from expanding the read workload beyond the profile. The CLI additionally bounds directory traversal and JSON reads. Content lengths and file metadata are rechecked while reading. Source bytes are snapshotted before hashes and ZIP construction. Output creation happens only after all reads and builds succeed; files use exclusive creation.

This is not a sandbox for a hostile OS or a directory tree being actively changed by an attacker. Path-component checks and later opens are separate filesystem operations; they do not constitute a general race-free filesystem capability mechanism. Use a stable source directory and a trusted output parent. If disk writing fails, a partial new output directory can remain; the original input remains untouched. Check for the complete receipt and successfully run `check` before sharing.

All completed archives are retained in memory. Peak memory can materially exceed source bytes; the documented 128 MiB input bound is not a 128 MiB RAM promise. STORE does not make already compressed photos smaller. Browser file handles, buffers, hash snapshots and downloads can add further memory. No encrypted archive or secure deletion is provided.

## Hashes and authenticity

CRC32 detects ordinary ZIP corruption. SHA-256 establishes consistency with the supplied receipt. Neither establishes the receipt's origin. An attacker who can replace archives and receipt can produce a mutually consistent replacement. Protect or separately authenticate the receipt when origin matters. `check` does not prove source-file correspondence or validate every declaration in the receipt.

## Development and browser tests

Playwright is a pinned development dependency. Chromium tests must keep the browser sandbox enabled. Do not work around launch restrictions using `--no-sandbox` or disabling host security settings. Browser tests are delegated to a supported CI runner when the local environment restricts Chromium. See [verification](verification.md) for actual evidence status.
