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
| Play version code | 12 (`2.0.1`), Sep 2026 | `1` / `1.0.0-backup` placeholder — never shipped |
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

## Where the app actually is on Play

**Production has never been active.** Both released version codes sit on the *closed
testing* track only, so no ordinary Play user has ever installed this app — every customer
ordering today came through the website. Production is gated behind Google's closed-testing
requirement for personal developer accounts: at least 12 testers opted in continuously for
14 days, then an application.

| Version code | Name | Date | Track | Carries the UPI fixes |
|---|---|---|---|---|
| 11 | `2.0.0` | Aug 2026 | Closed testing | no |
| 12 | `2.0.1` | Sep 2026 | Closed testing | yes — **verified at checkout on a Play-signed install** |

That gap is the thing to notice: the two fixes below sat in the local working copy for a
release without ever being built into a bundle, because the version code was never bumped
off 11. UPI was fixed on the developer's own phone and broken for everyone else, and nothing
in the repository would have shown it — `versionCode` lives only on that Mac.

The production application has been refused twice with "Your app requires more testing to
access Google Play production". The third criterion reads *"14 more days starting from the
review date"*, so a refusal appears to restart the count rather than leave it standing —
applying early is not free, it costs another fortnight. Wait out the full window before
pressing **Apply for production**. Publishing further closed-testing releases during that
window is fine and resets nothing; it also gives the testers a reason to open the app, which
is what the requirement is really measuring.

### Installing a Play build over an Android Studio one

The update fails, and Play offers only its generic "check your connection" help. The cause is
signing: Play App Signing re-signs the uploaded bundle with the app signing key, while the
build installed from Android Studio carries the upload key, and Android refuses to update an
app whose signature does not match. Uninstall the developer build first, then install from the
testing link — it is a fresh install rather than an update, and every Play update after that
behaves normally. Uninstalling clears the WebView's data, so the customer is signed out and the
locally-stored tank profile is gone; orders, wallet and referral code live in Firebase and are
untouched.

## Building a release bundle

macOS ships no system Java, so Gradle stops with "Unable to locate a Java Runtime" until it
is pointed at the JDK inside Android Studio:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
./gradlew clean bundleRelease
```

The bundle lands at `app/build/outputs/bundle/release/app-release.aab`.

Use the Gradle task rather than *Build → Generate Signed App Bundle*. The menu dialog asks
for a keystore path and passwords of its own and ignores the `keystore.properties` signing
config the build file already defines — and that config is the one wired to the original
upload key. A different key cannot update the existing listing, and there is no way back
from that except a support request.

Two warnings are expected on every build and neither matters: `Unable to strip …
libdatastore_shared_counter.so` during the build, and Play's *no deobfuscation file* / *no
native debug symbols* notices on upload. The native library belongs to AndroidX, not to
this app.

### R8 is off on purpose

`buildTypes.release` sets `optimization { enable = false }`, so Play's bundle report shows
*App optimisation: Low*, *Obfuscation 3%* and *No R8 metadata included*. Those are advisory
performance scores, not policy checks; they have no bearing on review or on production
access.

The reason to leave R8 off is `AndroidShareBridge`. Its `@JavascriptInterface` methods are
never called from Kotlin — only from JavaScript, by name — so R8 reads them as dead code and
strips them. That breaks native sharing and Google sign-in **in release builds only**, which
is the worst shape for a bug: a debug run looks perfect. Turning R8 on later means writing
keep rules for that bridge and then re-testing sign-in, sharing and a real payment on a
device. Worth doing once the app is through its qualifying run; not worth doing during it.

## Pending for version code 13

Three changes agreed but not yet applied. They exist only here: the Android project is not in
this repository, so nothing else records them.

**1. Firebase Cloud Messaging — the app half of push.** The server half shipped in
`lib/push.mjs` and `api/cron-push.js` and is live; nothing can reach a phone until the app
holds an FCM token.

- `app/build.gradle.kts`: add `implementation("com.google.firebase:firebase-messaging")`
  under the existing auth line. No version — the BOM supplies it.
- `AndroidManifest.xml`: add `<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />`,
  and inside `<application>` a `<service android:name=".NemoMessagingService" android:exported="false">`
  with an intent filter for `com.google.firebase.MESSAGING_EVENT`.
- A `NemoMessagingService` that builds the notification itself. Messages are sent data-only
  precisely so that it always runs — see the reasoning in `lib/push.mjs`.
- `MainActivity`: request `POST_NOTIFICATIONS` at runtime on Android 13+, fetch the token, and
  hand it to the site with `webView.evaluateJavascript("window.__nemoPushToken('…')")`. That
  global is already deployed (`app.jsx`), and stores the token under the signed-in uid.

**2. Google sign-in throws `NoCredentialException` on the first attempt after a fresh
install.** Confirmed on 2.0.1: first tap failed, second succeeded. The name misleads — it is
not "no Google account on this phone", it is "Play services has not populated the account list
yet". A retry finds them:

```kotlin
private suspend fun getGoogleCredential(): GetCredentialResponse {
    return try {
        credentialManager.getCredential(this@MainActivity, googleCredentialRequest())
    } catch (notReady: NoCredentialException) {
        delay(700)
        credentialManager.getCredential(this@MainActivity, googleCredentialRequest())
    }
}
```

A customer who taps *Cancel* on the picker gets `GetCredentialCancellationException`, a
different type, so this can never re-prompt someone who dismissed it deliberately.

**3. Sign-in errors are shown to customers as Java class names.** `startNativeGoogleSignIn()`
builds its message as `"${e::class.java.simpleName}: " + e.message`, so a new customer's first
action in the app can produce "NoCredentialException: No credentials available". Log the
exception under a `NemoAuth` tag for diagnosis and show plain language instead. Nothing is lost
from Logcat; the customer stops reading stack-trace vocabulary.

Also open, lower priority: `android:usesCleartextTraffic="true"` is in the manifest and is not
needed — the app only ever loads `https://www.nemoaquastore.in`.

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
