# Deck format v1

A Deck is a declarative JSON document interpreted by SecondDeck. It cannot
contain JavaScript, native libraries, shell commands, or another executable
payload. The server rejects unknown fields and publishes submissions only after
a verified Lindsey Web Solutions reviewer approves them.

See [`examples/ayn-thor-session.deck.json`](../examples/ayn-thor-session.deck.json)
for a complete example.

## Required identity and target fields

- `schemaVersion` is currently `1`.
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

## AI

`ai.enabled` allows optional authoring/session help but never gives AI access to
a running game, device telemetry, notes, or private device data. Provider
routing is derived from the verified session on the server and cannot be chosen
by a Deck.
