# The Android app — what is actually shipped

The Nemo Aqua Store app on Google Play (`in.nemoaquastore.app`) is a **Kotlin WebView
wrapper**, not a Trusted Web Activity. This document exists because that is easy to get
wrong: the repository also contains `android-twa/`, which is a *plan* for rebuilding the app
as a TWA and has never produced a shipped build. Read the distinction below before touching
either.

| | Shipped app | `android-twa/` |
|---|---|---|
| Kind | Kotlin WebView wrapper | Bubblewrap TWA config |
| Project | `~/AndroidStudioProjects/NemoAquaStore` (local only, **not in this repo**) | this folder |
| Build file | `app/build.gradle.kts` (Kotlin DSL) | `app/build.gradle` (Groovy, generated) |
| Launcher | `.MainActivity` | `…androidbrowserhelper.trusted.LauncherActivity` |
| Play version code | 11 (`2.0.0`), Aug 2026 | `1` / `1.0.0-backup` placeholder — never shipped |
| Renders with | Android System WebView | Chrome |

Both are signed for the same package, and `/.well-known/assetlinks.json` carries the two
SHA-256 fingerprints either would need.

## Why the distinction bites

A WebView is not Chrome. It advertises itself with `; wv` and `Version/4.0` in the
User-Agent, and payment SDKs read that as "this page cannot hand off to another app" —
because in a naive wrapper it cannot. Razorpay Checkout responds by **silently removing UPI**
from the payment list, leaving only cards, netbanking and wallets. Nothing errors; the option
is simply absent, and only on the app.

That is worth restating because of how it presents: identical site, identical account,
identical Razorpay configuration, UPI visible in the phone's browser and in the installed
PWA, missing only in the app.

## The two changes that fix it

Both live in the local Android project, so they are recorded here — losing that Mac would
otherwise lose them silently.

**1. `MainActivity.configureWebView()` — stop advertising as a WebView.**

The wrapper appended its own token to the default UA, keeping the WebView markers:

```kotlin
userAgentString = "$userAgentString NemoAquaStoreAndroid/2.0"   // before
```

```kotlin
userAgentString = userAgentString                               // after
    .replace("; wv", "")
    .replace(Regex("""Version/\d+(\.\d+)*\s+"""), "") +
        " NemoAquaStoreAndroid/2.0"
```

This is honest rather than a spoof: `handleUrl()` in the same file already launches both
`intent://` URLs (via `Intent.parseUri(…, URI_INTENT_SCHEME)`) and any other scheme (via
`openExternal`, an `ACTION_VIEW` intent). The app genuinely can hand off to a UPI app; only
the advertisement said otherwise.

Nothing on the website reads this string — `nemoInApp` comes from `display-mode: standalone`
(`index.html:522`) — so the Nemo suffix is kept only to keep the app identifiable in logs.

**2. `AndroidManifest.xml` — make UPI apps visible.**

```xml
<intent>
    <action android:name="android.intent.action.VIEW" />
    <data android:scheme="upi" />
</intent>
```

Razorpay hands off to a chosen app with an explicit `package=` in the `intent://` URL. On
Android 11+, `startActivity` into a package the app cannot *see* throws
`ActivityNotFoundException` regardless of whether that app is installed. Without this entry
UPI appears and then fails at the hand-off with "No compatible app found" — a worse failure
than not offering it, because it happens mid-payment.

## If the app is ever migrated to a TWA

`android-twa/` holds the configuration for it and the asset links are already live, so the
groundwork exists. A TWA runs real Chrome, which removes this class of problem entirely — no
UA handling, no package-visibility declarations, every payment method behaving as it does in
the browser.

The cost is that `MainActivity` carries behaviour a TWA would need re-homed: the
`NemoAndroid` JavaScript bridge for native sharing and Google sign-in, WhatsApp Business
preference on `whatsapp:` links, and install-banner suppression. Verify each before
switching, and ship as the next version code with the **same upload key** — a different key
cannot update the existing Play listing.
