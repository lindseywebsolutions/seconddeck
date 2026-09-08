# Deck format v1

A Deck is a declarative JSON document interpreted by SecondDeck. It cannot
contain JavaScript, native libraries, shell commands, or another executable
payload. The server rejects unknown fields and publishes submissions only after
a verified Lindsey Web Solutions reviewer approves them.

See [`examples/ayn-thor-session.deck.json`](../examples/ayn-thor-session.deck.json)
for a complete example.

## Required identity and target fields

- `schemaVersion` is currently `1`.
- `version` is a positive integer. A revision must be newer than every prior
  submission by the same author with the same slug.
- `kind` is `deck`, `layout`, `widget-preset`, `theme`, or
  `compatibility-profile`.
- `slug`, `name`, and `description` identify the artifact.
- `target.packageNames` contains exact Android package names. SecondDeck never
  performs a substring match.
- `target.platforms` and `target.deviceProfiles` document compatibility.
- `layout.columns`, optional responsive `breakpoints`, and `widgets` describe
  the companion screen.

## Widgets

Version 1 accepts `map`, `guide`, `checklist`, `notes`, `timer`, `controls`,
`keyboard`, `trackpad`, `performance`, and `links`.

Maps are intentionally data-only: their `content` is an offline route or text
map, with an optional reviewed HTTP(S) source link. Notes and checklist state
stay on the device. Timers persist while stopped or running across companion
reopens. Performance widgets expose only read-only battery, thermal, available
memory, and display refresh-rate samples.

Controls, keyboard, and trackpad manifests are reserved for reference layouts
until a safe, explicit Android input permission design is physically validated.
They do not inject input into another application in format v1.

## Permissions and sources

Every runnable full Deck declares `external-display`. A `performance` widget also
declares `performance`; `keyboard` or `trackpad` declares `keyboard`; and every
widget with `sourceUrl` declares `network`. Each widget source must also appear
in the top-level `sources` allowlist. Only HTTP(S) sources pass validation.

These declarations are enforced by the server. They are not advisory metadata.
The Android/web runtime also requires the player to approve every declared
capability during installation and again for each update. That approval is
stored only on the device, bound to the Deck channel and exact version, and can
be revoked independently of the installed manifest. Missing, stale, or altered
grants prevent activation and automatic game matching.

## Portable files and reviewed updates

The Thor creator can validate and install a draft locally before submitting it.
The library accepts strict JSON and YAML files up to 64 KiB and exports a
canonical JSON manifest without author email, review state, timestamps, or
other server metadata. YAML aliases and duplicate keys are rejected.

## Git catalog packages

A reviewed Git catalog directory may add a strict `metadata.json`, a bounded
PNG, WebP, JPEG, or self-contained SVG icon, an optional Markdown README, up to
four raster screenshots, and `locales/<locale>.json` files. Package paths cannot
escape their Deck directory. Images are checked by file signature, SVG rejects
scripts, event handlers, embedded documents, external references, and CSS URLs,
and every file has an explicit size limit.

The base manifest is the default locale. Locale files may translate only the
Deck name, description, and the title/content of widget IDs already present in
that manifest. They cannot change targets, permissions, sources, layout, or AI
settings. The runtime selects an exact or language-compatible device locale and
keeps the validated base manifest as fallback. Package metadata is catalog-only
and is stripped from portable JSON exports.

The first submission creates a stable update channel. Later versions are stored
as immutable review records. The currently published revision remains visible
until a reviewer publishes the update; publishing it supersedes the prior
revision. Installed devices compare versions on that stable channel and offer
an explicit update instead of silently changing the active Deck.

## AI

`ai.enabled` allows optional authoring/session help but never gives AI access to
a running game, device telemetry, notes, or private device data. Provider
routing is derived from the verified session on the server and cannot be chosen
by a Deck.
