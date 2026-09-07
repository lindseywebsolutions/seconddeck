# SecondDeck

SecondDeck is an open-source, local-first Android companion platform for dual
screen handhelds. It is built first for the AYN Thor while keeping the Deck
format portable to foldables, tablets, and external displays.

The top screen stays the game. The other screen can show safe, declarative
guides, notes, checklists, timers, controls, and performance panels. Community
Decks are data packages and cannot ship executable native plugins.

## Install on an AYN Thor

1. Open `https://seconddeck.lws-workspace.com` and tap **Add to Obtainium**.
   The full-config deep link preserves the `SecondDeck` name and tracks signed
   releases from `https://github.com/LindseyWebSolutions/seconddeck`.
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
Kubernetes uses External Secrets backed by Vault; never commit credentials or a
signing keystore.

## Status

Version 0.1.1 is an installable foundation: public homepage, authenticated Deck
library and Thor-friendly creator, strict schema validation, AI routing, native
secondary-display detection/presentation, Kubernetes manifests, and
Obtainium-compatible APK hosting. Automatic game detection and deeper device
profiles remain roadmap work because they require physical AYN Thor validation.

## License

MIT
