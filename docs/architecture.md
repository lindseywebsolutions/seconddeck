# Architecture and trust boundaries

## Components

- The Vite web client is bundled into both the hosted site and the Capacitor
  Android application.
- The Android `SecondDisplay` Capacitor plugin uses Android `DisplayManager`
  and a `Presentation` on compatible secondary displays.
- The Express API owns email login, signed sessions, Deck validation/storage,
  and server-side AI routing.
- A Longhorn PVC persists submitted Decks. Published Decks are seeded and can
  later move to a reviewed Git-backed catalog without changing the schema.

## Runtime values

`SESSION_SECRET`, SMTP credentials, and Codex authentication are supplied only
through Vault-backed External Secrets. Non-secret settings are in the
Kubernetes ConfigMap. The Codex authentication file is mounted read-only at
`/app/.codex/auth.json`.

## Security

- Email codes expire after ten minutes, have a request cooldown and a bounded
  attempt count, and are stored only as HMAC digests in process memory.
- Sessions assert `email_verified` and expire after 30 days.
- Deck schemas are strict and allow only known widget, permission, platform,
  and HTTP(S) URL fields. Unknown executable fields are rejected.
- Public users never reach Codex; company users never silently fall back to
  Ollama. Provider selection uses only the verified session email.
- The production pod runs as non-root with a read-only root filesystem, a
  default-deny network policy, and bounded CPU/memory/storage.

## Physical acceptance gate

An Android build and secondary-display API test do not prove AYN Thor behavior.
Before calling Thor support complete, install the signed APK on a real Thor and
verify display discovery, presentation placement, touch focus, game coexistence,
rotation, suspend/resume, and in-place Obtainium update.
