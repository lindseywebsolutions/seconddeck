# Architecture and trust boundaries

## Components

- The Vite web client is bundled into both the hosted site and the Capacitor
  Android application.
- The Android `SecondDisplay` Capacitor plugin uses Android `DisplayManager`
  and a `Presentation` on compatible secondary displays. It accepts only a
  bounded declarative Deck payload and always loads the bundled companion page;
  callers cannot choose arbitrary local files.
- Opt-in Android Usage Access reads only recent foreground package events. The
  client performs an exact package-name match against locally installed Decks
  and may select a match, but never opens a secondary presentation without a
  user action. This is intentionally conservative until Thor arbitration is
  physically validated.
- The Express API owns email login, signed sessions, Deck validation/storage,
  corporate review/publishing, and server-side AI routing.
- A Longhorn PVC persists submitted Decks. Published Decks are seeded and can
  later move to a reviewed Git-backed catalog without changing the schema.
- Reviewed Decks are installed into device-local storage. The selected Deck is
  passed to the secondary display as data and renders offline; notes and
  checklist state stay on the device. A cached verified profile permits this
  installed library to remain available through a network interruption.
- The Android packaging step removes website-hosted APK artifacts from the
  WebView bundle before Capacitor sync, preventing older releases from being
  recursively embedded in each new APK.

## Runtime values

`SESSION_SECRET`, SMTP credentials, and Codex authentication are supplied only
through Vault-backed External Secrets. Non-secret settings are in the
Kubernetes ConfigMap. At pod startup, an init container copies the dedicated
read-only ChatGPT authentication secret into an ephemeral, writable Codex home.
The application receives no OpenAI API key; Codex can refresh its session in
that private in-pod directory, which is discarded when the pod is replaced.

## Security

- Email codes expire after ten minutes, have a request cooldown and a bounded
  attempt count, and are stored only as HMAC digests in process memory.
- Sessions assert `email_verified` and expire after 30 days.
- Deck schemas are strict and allow only known widget, permission, platform,
  device-profile, responsive-layout, artifact-kind, and HTTP(S) URL fields.
  Unknown executable fields are rejected. Only verified corporate accounts can
  publish or reject a community submission.
- Public users never reach Codex; company users never silently fall back to
  Ollama. Provider selection uses only the verified session email.
- The production pod runs as non-root with a read-only root filesystem, a
  default-deny network policy, and bounded CPU/memory/storage.

## Physical acceptance gate

An Android build and secondary-display API test do not prove AYN Thor behavior.
Before calling Thor support complete, install the signed APK on a real Thor and
verify display discovery, presentation placement, touch focus, game coexistence,
rotation, suspend/resume, and in-place Obtainium update.
