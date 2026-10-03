# Existing work, differentiation and open questions

Primary sources rechecked on 2026-10-03. These are scoped descriptions of documented behavior, not exhaustive feature audits or market validation.

## Existing archive products

- [PartZip](https://github.com/kur5e/PartZip) already creates independent archives, supports incremental workflows, manifests, ZIP/7z, encryption and templates. Its README's limitations state that an individual file larger than its split-size receives its own part with a warning. Sidecar Pack instead refuses a reviewed indivisible group when its exact STORE archive footprint exceeds the cap. PartZip covers much broader and larger archival workflows.
- [AbaoSplitZip](https://abaodisk.com/) already provides independently extractable volumes and First-Fit Decreasing. Its documentation describes target sizes as approximate to retain complete files and offers compression and encryption. Sidecar Pack uses no compression and includes known header costs in its hard actual-byte cap. FFD and independent parts are existing techniques.

## Why review sidecars explicitly

- [digiKam metadata settings](https://docs.digikam.org/en/setup_application/metadata_settings.html#sidecars-settings) document both appended `filename.ext.xmp` and commercial-compatible `filename.xmp` conventions. A filename-only tool cannot safely assume every basename variant maps to a particular selected original.
- [darktable sidecar documentation](https://docs.darktable.org/usermanual/development/en/overview/sidecar-files/sidecar/) describes duplicate versions represented by numbered sidecar filenames. This project deliberately leaves those variants for the user to assign, retain singly, or exclude. It does not inspect editing history or claim cross-editor restoration compatibility.

## Narrow hypothesis to test

For small photo handoffs, it may be useful to review original/sidecar families before creating byte-limited standalone archives. The implementation is a working prototype of that hypothesis. There are no customer interviews, conversion results, willingness-to-pay evidence, or measurements of real-world sidecar pairing errors in this repository.

Useful evaluation criteria for future voluntary testing:

1. Can a participant identify every ambiguous file before packing, including an intentional wrong pairing?
2. Does the strict-cap refusal help them choose a workable cap or smaller group without silently losing files?
3. Do their own extraction tools preserve accepted filenames and payload bytes on their actual destination OS?
4. Is the review effort justified compared with their current archive and sharing workflow?

The project does not claim novelty, patentability, a minimum-part algorithm, a replacement for a DAM/editor, or a proven business opportunity. No customer contact or private dataset is needed to reproduce the supplied fixtures.
