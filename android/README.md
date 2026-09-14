# Kayzen on Google Play — Trusted Web Activity

Kayzen ships to Android as a **Trusted Web Activity**: a thin native shell that
opens `https://kayzen.app` in a Chrome Custom Tab with the browser UI removed.
There is no WebView fork of the app and no second codebase — what Play installs
is the PWA, verified as first-party by Digital Asset Links.

The whole arrangement rests on one file matching one certificate. Everything
below is in service of that.

---

## 1. Prerequisites

```bash
npm install -g @bubblewrap/cli   # Bubblewrap CLI
java -version                    # JDK 17
```

Bubblewrap downloads its own Android SDK and JDK on first run
(`~/.bubblewrap/`). On CI they are cached — see
`.github/workflows/android.yml`.

## 2. The signing key

```bash
keytool -genkeypair \
  -alias kayzen \
  -keystore android/kayzen.keystore \
  -keyalg RSA -keysize 4096 -validity 10000 \
  -storetype PKCS12
```

The keystore is **not** committed (`.gitignore` covers `*.keystore`). Losing it
means losing the ability to update the app under the same package name, so it
belongs in a password manager or a secrets vault, backed up twice.

For CI, store it base64-encoded:

```bash
base64 -w0 android/kayzen.keystore    # → secret ANDROID_KEYSTORE_BASE64
```

## 3. Digital Asset Links — the part that actually matters

Chrome removes the URL bar only if `https://kayzen.app/.well-known/assetlinks.json`
names this app's package **and** the SHA-256 fingerprint of the certificate that
signed the installed build. Get it wrong and the app still runs — it just runs
with a browser address bar across the top, which is the single most common
reason a TWA submission is rejected or feels "wrong" to users.

Two fingerprints are normally required, and forgetting the second is the classic
failure:

| Key                  | Where it comes from                  | Signs                 |
| -------------------- | ------------------------------------ | --------------------- |
| Upload key           | `android/kayzen.keystore`            | the AAB you upload    |
| Play App Signing key | Play Console → Setup → App integrity | the APK users install |

Read the upload key's fingerprint:

```bash
keytool -list -v -keystore android/kayzen.keystore -alias kayzen \
  | grep 'SHA256:' | awk '{print $2}'
```

Then set both, comma-separated, on the web deployment:

```
ANDROID_PACKAGE_NAME=app.kayzen.twa
ANDROID_SHA256_CERT_FINGERPRINTS=AA:BB:…:FF,11:22:…:99
```

The running app serves the document from those variables
(`src/app/api/assetlinks/route.ts`, rewritten to `/.well-known/assetlinks.json`
in `next.config.ts`). For a static artifact instead:

```bash
npm run assetlinks:generate      # writes public/.well-known/assetlinks.json
```

Verify after deploying — before building the app:

```bash
curl -sS https://kayzen.app/.well-known/assetlinks.json | jq
```

Google's own checker: <https://developers.google.com/digital-asset-links/tools/generator>

## 4. Build the Android artifact

```bash
# First time only — regenerates the Gradle project from twa-manifest.json
bubblewrap init --manifest="https://kayzen.app/manifest.json" --directory=android/twa

# Every build after that
npm run twa:build                # bubblewrap build --directory=android/twa
```

Outputs land in `android/twa/`:

- `app-release-bundle.aab` — upload this to Play,
- `app-release-signed.apk` — for sideloading and manual testing.

`twa-manifest.json` in this directory is the source of truth for the shell's
identity (package id, colours, launcher name, shortcuts). Edit it here, then
`bubblewrap update` to regenerate the Gradle project.

## 5. Verify on a device

```bash
adb install -r android/twa/app-release-signed.apk
adb shell am start -n app.kayzen.twa/LauncherActivity
```

Check, in order:

1. **No URL bar.** If one appears, asset links failed — re-read step 3. The
   reason is in `adb logcat | grep -i "digital asset\|origin verification"`.
2. **Status bar matches the theme.** `themeColor` in `twa-manifest.json` and the
   `theme-color` meta tag the app updates on theme change.
3. **Haptics.** Tick a task off: the completion buzz is
   `navigator.vibrate([15, 50, 15])` reaching Android's vibrator service.
4. **WebOTP.** Sign in with a real number; the SMS ends with
   `@kayzen.app #123456` and the code should fill itself.
5. **Offline.** Enable airplane mode, add a task, re-enable: the outbox replays
   it (Background Sync, `public/sw.js`).

## 6. Play Console checklist

- Target API level meets the current Play requirement (Bubblewrap sets it).
- Store listing icon: `public/icons/play-store-512.png` (no alpha channel — Play
  rejects transparency on the listing icon).
- Data safety form: Kayzen collects a phone number for authentication; declare
  it as collected, encrypted in transit, and not shared.
- Privacy policy URL must be live before review.

## Changing the domain

Everything above assumes `kayzen.app`. To use another origin, change:

- `host`, `iconUrl`, `maskableIconUrl`, `webManifestUrl`, `fullScopeUrl` in
  `twa-manifest.json`,
- `NEXT_PUBLIC_APP_URL` on the web deployment (it also drives the WebOTP binding
  line in the SMS body — a mismatch silently disables auto-fill),
- the asset links fingerprints, which are per-keystore, not per-domain.
