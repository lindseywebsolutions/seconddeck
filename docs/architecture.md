# Architecture and trust boundaries

## Components

- The Vite web client is bundled into both the hosted site and the Capacitor
  Android application.
- The Android `SecondDisplay` Capacitor plugin uses Android `DisplayManager`
  and a `Presentation` on compatible secondary displays. It accepts only a
  bounded declarative Deck payload and always loads the bundled companion page;
  callers cannot choose arbitrary local files. A display listener dismisses the
  presentation if that display disappears or powers off, and the user can stop
  it explicitly from the primary UI.
- Opt-in Android Usage Access reads only recent foreground package events. The
  client performs an exact package-name match against locally installed Decks
  and may select a match, but never opens a secondary presentation without a
  user action. A local exact-package yield list lets the user identify apps that
  own both displays; a yielded app is never auto-selected and every presentation
  launch route refuses to compete for its lower screen. This is intentionally
  user-controlled until automatic Thor arbitration can be physically validated.
- The Express API owns email login, signed sessions, Deck validation/storage,
  corporate review/publishing, and server-side AI routing.
- A Longhorn PVC persists private submissions and reviewed community revisions.
  The bundled marketplace baseline comes from the public `catalog/` directory
  in GitHub. JSON and YAML files are bounded, parsed without aliases, strictly
  validated before the server starts, and returned with their repository, tag,
  and path. Curated records are never written to the PVC. Their slugs remain
  stable channel IDs, so repository updates replace matching installed
  revisions without duplicates. Publishing a server-reviewed update supersedes
  its prior public revision without hiding that prior revision during review.
- Reviewed Decks are installed into device-local storage. The selected Deck is
  passed to the secondary display as data and renders offline; notes and
  checklist state and timer state stay on the device. A narrowly scoped native
  bridge supplies read-only battery, thermal, memory, and refresh-rate samples
  to performance widgets; navigation away from the bundled companion page is
  blocked and HTTP(S) sources open externally. A cached verified profile permits
  this installed library to remain available through a network interruption.
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
  Required widget capabilities and the source allowlist are enforced, and
  unknown executable fields are rejected. Only verified corporate accounts can
  publish or reject a community submission.
- Portable JSON/YAML import is capped at 64 KiB, rejects YAML aliases and
  duplicate keys, and runs the same strict schema used by the server. Export
  includes only manifest fields and strips account and review metadata.
- Creator email addresses remain available to the creator and corporate review
  queue but are replaced with a neutral publisher label in the community
  catalog response.
- Catalog slugs are reserved against server submissions, and Git catalog records
  cannot be changed through the runtime review endpoint. Their source remains a
  normal repository review and release operation.
- Public users never reach Codex; company users never silently fall back to
  Ollama. Provider selection uses only the verified session email.
- AI Deck generation accepts only a bounded goal, exact Android package, and
  known device profile. Model output is untrusted: the server extracts a small
  strict proposal, owns targets, permissions, sources, IDs, and AI metadata,
  then applies the normal Deck validator. Drafts are previewed before an
  explicit local install and are never published automatically.
- The production pod runs as non-root with a read-only root filesystem, a
  default-deny network policy, and bounded CPU/memory/storage.

## Physical acceptance gate

An Android build and secondary-display API test do not prove AYN Thor behavior.
Before calling Thor support complete, install the signed APK on a real Thor and
verify display discovery, presentation placement, touch focus, game coexistence,
rotation, suspend/resume, per-package yield and restore, and in-place Obtainium
update.
