# SecondDeck GitHub catalog

Each directory contains a reviewed, declarative Deck manifest. The server reads
this directory at startup, rejects the entire release if a manifest is invalid,
and exposes source provenance with every catalog record.

To contribute from a Thor:

1. Create or generate a Deck inside SecondDeck.
2. Preview and install it locally.
3. Export the validated JSON file using Android's share sheet.
4. Submit it through the in-app review queue. A reviewer can add the approved
   manifest here in a pull request for inclusion in the immutable release
   catalog.

Catalog files cannot contain executable code. JSON and YAML manifests are
accepted, capped at 64 KiB, and must pass the same strict schema used for local
imports and server submissions.

An optional `metadata.json` may declare an SPDX-style license, homepage, icon,
Markdown README, up to four raster screenshots, and the base locale. Translated
copy lives in `locales/<locale>.json`; it may address only widget IDs from the
manifest. Package paths are confined to the Deck directory, assets are bounded
and type-checked, and unsafe SVG constructs are rejected before startup.
