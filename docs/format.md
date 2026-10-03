# Deterministic ZIP and receipt profile

## Source and review model

Inputs are bounded file metadata and opaque bytes. Files are not interpreted as images or XML. `inspectFiles` validates metadata and conservatively suggests only exact appended sidecars whose selected source has an extension. It cannot discover missing sidecars that were never selected, identify the meaning of XMP contents, infer ownership, or certify editing compatibility across applications.

`makePlan` requires an own assignment for every input. A string identifies an included, self-assigned group anchor; `null` excludes an entry. Missing or undefined assignments fail. Grouping does not rename or merge files. The CLI supplies suggestions first and applies an explicit review map over them. The browser requires a reviewed plan before writing.

## Packing

For a path encoded in UTF-8, each file consumes source length + 76 + twice its encoded path length. Every archive additionally consumes 22 bytes. A group's entire contribution must fit a single part. Groups sort by descending contribution and then anchor path using JavaScript string ordering. Each is placed in the first existing part with sufficient remaining capacity; otherwise a new part is opened. Files within a part sort by path.

This is First-Fit Decreasing over indivisible reviewed groups, with ZIP header overhead included. It is deterministic for the same paths, assignments, bytes and cap. It is not an exact bin-packing optimizer and does not promise minimum parts.

## Byte profile

The output is ZIP32 STORE, with little-endian fields, UTF-8 flag 0x0800, CRC32 per file, fixed DOS timestamp 1980-01-01 00:00:00, made-by value 0x0314 (Unix/version 2.0), and regular-file 0644 external attributes. ZIPs contain no explicit directories, extras, comments, data descriptors, encryption or ZIP64 records. Source modification times and source filesystem permissions are not retained. Embedded metadata within an input's bytes is retained because contents are copied without decoding.

The [PKWARE APPNOTE specification](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT), sections 4.3.7, 4.3.12 and 4.3.16, defines the record structures used for this narrow profile. This document describes this implementation rather than reproducing the specification.

The archive builder snapshots reader-returned bytes before hashing, including Node Buffer inputs. It checks actual archive size equals the plan and does not exceed the cap. Original content and path ordering determine reproducibility; selection order does not.

## Receipt

The JSON object has `format: "sidecar-pack-receipt"`, `version: 1`, a profile label, packing label, byte cap, limits, `files`, `excluded`, `archives`, and a warning notice. File records include `path`, `size`, `sha256`, `group`, and `part`. Archive records include `name`, `size`, and `sha256`. The serialized receipt is deterministic and is not stored inside any ZIP.

CLI `check` validates the receipt envelope and archive record safety, then compares ZIP sizes and SHA-256. It does not extract, inspect ZIP structures, validate per-file claims, compare original source files, or authenticate the receipt. Independent test readers inspect structure and payloads during development; they are not called by `check`.
