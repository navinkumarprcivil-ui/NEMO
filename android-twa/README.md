# Nemo Aqua Store — Android / Play Store TWA backup

> **This is a plan, not the shipped app.** The app on Google Play is a Kotlin **WebView
> wrapper** built from a local Android Studio project, not a TWA — its launcher is
> `.MainActivity`, and the config here has never produced a release (it still carries the
> `versionCode: 1` / `1.0.0-backup` placeholder, while Play is on 11). Read
> `../docs/ANDROID.md` before assuming otherwise; the difference changes how payments behave.

This folder is the **configuration needed to rebuild the Android app as a Trusted Web Activity
(TWA)**, should that migration be made.

## App identity — do not change

- App: **Nemo Aqua Store**
- Google Play package: `in.nemoaquastore.app`
- TWA host: `www.nemoaquastore.in`
- Web manifest: `https://www.nemoaquastore.in/manifest.webmanifest`
- Digital Asset Links: `/.well-known/assetlinks.json` in the main Nemo repository
- Android target for new Play updates: **API 36**

Changing the package name creates a different Android app and cannot update the existing Play listing.

## What is deliberately NOT stored in GitHub

Never commit any of these:

- the existing Google Play **upload keystore** (`.jks` / `.keystore`)
- keystore password
- key password
- Play service-account JSON
- generated `.aab` or `.apk` files
- local Android SDK paths / `local.properties`

The `.gitignore` in this folder blocks these common secret/output files.

The upload keystore must be backed up separately in a secure offline location. If the original upload key is lost, use Google Play Console's upload-key reset process; do not generate a different key and expect it to upload normally.

## Why generated Android files are not committed

Bubblewrap regenerates the Gradle Android project from `twa-manifest.json`. Those generated files are intentionally ignored so GitHub stores the small, reviewable configuration instead of stale generated output.

This backup pins `@bubblewrap/cli` to `1.25.0`.

## One-time setup on your computer

Requirements:

1. Node.js installed.
2. JDK 17 available to Bubblewrap.
3. Android SDK / command-line tools available to Bubblewrap.
4. Your **existing** Nemo Aqua Store upload keystore available locally.

From the repository root:

```bash
cd android-twa
npm install
npm run doctor
npm run validate
```

## Before every Play Console update

### 1. Check the latest versionCode

In Play Console, open the existing Nemo Aqua Store app and note the highest version code already uploaded.

The new bundle's version code must be **higher** than every previous one.

Set the new version:

```bash
npm run set-version -- 12 1.2.0
```

The example above means:

- `versionCode = 12`
- `versionName = 1.2.0`

Use your real next values; do not blindly use the example.

The committed manifest intentionally starts at versionCode `1` with a `backup` version name. The release build refuses to use that placeholder.

### 2. Make the original upload key available locally

Recommended local location:

```text
android-twa/secrets/upload-key.jks
```

That entire `secrets/` directory is ignored by Git.

Find the alias of the **existing** upload key. Do not guess it and do not create a replacement just because the alias is unknown.

### 3. Set the signing alias

PowerShell example:

```powershell
$env:NEMO_UPLOAD_KEY_ALIAS="YOUR_EXISTING_KEY_ALIAS"
```

If the keystore is somewhere else:

```powershell
$env:NEMO_UPLOAD_KEY_PATH="C:\secure\path\nemo-upload-key.jks"
```

Bubblewrap can prompt interactively for the keystore/key passwords. For non-interactive use, Bubblewrap also recognizes `BUBBLEWRAP_KEYSTORE_PASSWORD` and `BUBBLEWRAP_KEY_PASSWORD`; do not write those values into any repository file.

### 4. Regenerate and inspect the wrapper

```bash
npm run sync
```

This does two things:

1. regenerates the Android project from `twa-manifest.json` without changing the version;
2. enforces `compileSdkVersion 36` and `targetSdkVersion 36` in the generated Gradle project.

### 5. Build the signed Play bundle

```bash
npm run build
```

The build script refuses to continue when:

- the package ID or host changed;
- the placeholder version is still present;
- the existing upload keystore is missing;
- `NEMO_UPLOAD_KEY_ALIAS` is not supplied;
- the generated project is not targeting API 36.

Successful output:

```text
android-twa/app-release-bundle.aab
```

This file is intentionally ignored by Git.

## Upload to Play Console

Use the **existing Nemo Aqua Store app**, not a new Play Console app:

1. Play Console → Nemo Aqua Store.
2. Test and release → Closed testing.
3. Open the existing test track.
4. Create a new release.
5. Upload `app-release-bundle.aab`.
6. Add release notes.
7. Review and roll out to the closed-testing track.

## Files that must stay aligned on the website

The Android wrapper depends on these files already stored at the repository root:

- `manifest.webmanifest`
- `.well-known/assetlinks.json`
- launcher/maskable icons under `assets/`

The Play package in the web manifest and Digital Asset Links must continue to match `in.nemoaquastore.app`.

## Safe backup checklist

GitHub should contain:

- `android-twa/twa-manifest.json`
- `android-twa/package.json`
- `android-twa/scripts/`
- `android-twa/.gitignore`
- this README
- root `manifest.webmanifest`
- root `.well-known/assetlinks.json`
- the referenced icon assets

Keep separately/offline:

- existing upload keystore
- keystore password
- key password
- the exact upload-key alias

With the GitHub files plus the original upload key, the Android wrapper can be reconstructed and a future `.aab` can be produced without keeping generated Android project files in source control.
