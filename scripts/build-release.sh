#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
version="$(node -p "require('${project_dir}/package.json').version")"
sdk_dir="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-/home/lindsey-web-solutions/Android/Sdk}}"

required=(SECONDDECK_KEYSTORE_PATH SECONDDECK_KEYSTORE_PASSWORD SECONDDECK_KEY_PASSWORD)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required signing setting: ${name}" >&2
    exit 1
  fi
done

cd "$project_dir"
npm ci
npm test
npm run android:sync
ANDROID_HOME="$sdk_dir" ANDROID_SDK_ROOT="$sdk_dir" ./android/gradlew -p android clean assembleRelease
install -m 0644 android/app/build/outputs/apk/release/app-release.apk "public/downloads/seconddeck-v${version}.apk"
"$sdk_dir/build-tools/35.0.0/apksigner" verify --verbose --print-certs "public/downloads/seconddeck-v${version}.apk"
sha256sum "public/downloads/seconddeck-v${version}.apk" > "public/downloads/seconddeck-v${version}.apk.sha256"
