# SecondDeck

SecondDeck is an open-source, local-first Android companion platform for dual
screen handhelds. It is built first for the AYN Thor while keeping the Deck
format portable to foldables, tablets, and external displays.

The top screen stays the game. The other screen can show safe, declarative
guides, notes, checklists, timers, controls, and performance panels. Community
Decks are data packages and cannot ship executable native plugins.

## Install on an AYN Thor

1. Open `https://seconddeck.lws-workspace.com` and tap **Add to Obtainium**.
   The full-config deep link forces the pre-install source name to `SecondDeck`
   and tracks signed releases from
   `https://github.com/LindseyWebSolutions/seconddeck`. Obtainium reads the
   embedded dual-screen launcher logo after the first install; it does not
   support custom icons for uninstalled source-only entries.
2. Or open that URL on the Thor and choose **Download APK**.
3. Install the APK, launch SecondDeck, and sign in with the one-time code sent
   to your email.

The first release is signed with a persistent SecondDeck release key. Future
updates must use the same key so Android and Obtainium can upgrade in place.

## Authentication and AI boundary

Every Deck, creator, and assistant API requires a passwordless email login.
The server verifies the one-time code and derives the AI lane from the signed
session; the client cannot choose or spoof it.

- Verified `@lindseywebsolutions.com` accounts use Codex CLI in an ephemeral,
  read-only sandbox.
- Every other verified email account uses the private in-cluster Ollama model.
- There is no cross-provider fallback. A failed provider request fails closed.

## Development

```bash
npm ci
npm test
npm run build
npm run android:debug
```

Runtime configuration is documented in [`docs/architecture.md`](docs/architecture.md).
Community authors can use the enforced [`Deck format v1`](docs/deck-format.md)
and the checked example in [`examples/ayn-thor-session.deck.json`](examples/ayn-thor-session.deck.json).
Kubernetes uses External Secrets backed by Vault; never commit credentials or a
signing keystore.

## Status

Version 0.13.0 includes the public homepage, authenticated GitHub-backed community library,
Thor-friendly creator and corporate review queue, strict schema validation,
localized catalog packages with validated icons and README provenance, local
Deck installation/selection, a manifest-driven offline companion runtime,
text maps, persistent timers, read-only device telemetry, explicit companion
stop controls, versioned reviewed updates, strict JSON/YAML portability,
on-device draft preview/install, validated AI-assisted Deck generation and AI
routing, startup-validated JSON/YAML catalog provenance, opt-in exact-package game detection,
local exact-package display yield controls, native
secondary-display presentation, Vault-backed ChatGPT authentication for the
corporate Codex lane, an on-device physical acceptance workflow, Kubernetes
manifests, Obtainium-compatible APK hosting, and device-local capability
approval that is rechecked for every Deck revision and can be revoked without
removing the Deck. Reviewed package screenshots now appear as real runtime art
on catalog cards and in a responsive preview gallery, with a clear offline
fallback while installed Decks remain fully local. Keyboard widgets connect through a user-enabled Android
input method to the focused upper-app text field, with bounded text and a fixed
key allowlist. Trackpad widgets use a separately approved Android Accessibility
service on Android 11 or newer; it cannot retrieve window content and sends
bounded taps and swipes only while an exact Deck target package is active.
The Android package identifies itself as SecondDeck and includes the dual-screen
mark for legacy and adaptive launchers; Obtainium displays it after installation.
Automatic device-specific display arbitration remains a physical AYN Thor
acceptance gate. SecondDeck never launches automatically and now lets users mark
an app as owning both screens so every companion launch route yields to it.
The authenticated **Device check** page runs a local lower-screen test and
exports a privacy-safe report for the remaining Thor-only checks.

## License

MIT
