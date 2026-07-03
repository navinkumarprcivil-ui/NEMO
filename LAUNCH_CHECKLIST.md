# 🚀 Nemo Aqua Store — Pre-Launch Audit & Checklist

_Status: ready to publish once the ✅ "Must do" items below are done._

---

## ⚡ Performance (done in this build)
- **Render-blocking fixed:** React scripts now use `defer`, so the splash + logo paint **instantly** instead of waiting 2–3s for React to download. (This was the real cause of the slow logo.)
- **Compile-once, then cache:** the app compiles in the browser only on the *first* visit and caches the result. Repeat visits load instantly and skip the ~3 MB Babel download entirely.
- **Logo:** 1.36 MB → **197 KB**; `app.jsx` is UTF-8 (365 KB, was 705 KB).
- **Service worker** serves the app shell from cache immediately (stale-while-revalidate), updates in the background.
- _For genuinely instant FIRST loads, a local precompile build step is the only further gain — optional, ask if you want the recipe._

## 📧 Customer emails (EmailJS — set keys in Settings to enable)
The app now emails the customer on: **order placed** (with a bill summary + care-guide reminder), **payment confirmed**, **shipped** (with tracking), and **delivered** — but only if they ticked "Notify me" at checkout. Requires EmailJS Service/Template/Public keys in Admin → Settings. Your EmailJS template should use these variables: `to_email, to_name, email_subject, email_headline, order_no, order_status, order_items, order_subtotal, order_shipping, order_total, payment_status, tracking_number, ship_name, ship_phone, ship_address, care_reminder, store_name, store_whatsapp`.
- **Net effect:** first load ~1–2s (one-time), every later load is near-instant.

> The only thing faster would be a desktop "build step" (precompiling on your computer). The in-browser caching above gets you ~95% of that benefit with zero tooling.

---

## ✅ MUST DO before you share with customers
1. **Publish the updated rules** (`database.rules.json`, new UID `cI2HmMt6FdR7fO7uUnugH85GeZt2`) in Firebase, and make sure you sign in to admin with **that** Google account.
2. **Activate FormSubmit for `nemoaquastore@gmail.com`** — place one test order (or trigger one email); FormSubmit sends a one-time confirmation link to that inbox. Click it once. **Until you do, order alerts AND your admin OTP codes won't arrive.**
3. **Fill in Settings:** WhatsApp number, UPI ID / Razorpay link (so customers can pay), Store contact, and the **About & Policies** text (Shipping, Returns/DOA, Acclimatization) — customers and payment apps expect these.
4. **End-to-end test on the live domain, on a real phone:**
   - Sign in with Google → add to cart → checkout → upload a payment screenshot → confirm.
   - In admin: see the order, verify payment, send a WhatsApp update, print the bill.
   - Test on **both** an Android phone (Chrome) and an iPhone (Safari).
5. **Set your real logo inside the app:** Admin → Settings → Store Logo → upload (this is the in-app logo; the optimized file powers the splash + install icon).

---

## 🟡 Recommended soon after launch
- **Download a backup** (Settings → Data & Backup) now, and once a month. Keep the file in Google Drive / email.
- **Customer confirmation emails** (optional): set up free EmailJS keys in Settings so buyers get an automatic email.
- **Watch Firebase usage** (Console → Realtime Database): you're free up to 1 GB stored / 10 GB-month traffic.
- **A privacy note:** you collect name/phone/address — add a short privacy line to your policies.

---

## 💡 Ideas to grow / improve further
- **Dedicated share image:** the WhatsApp/Insta preview currently uses your logo. A 1200×630 banner image would look more polished (send me one and I'll wire it in).
- **Keep product photos small:** upload ~1000px images. Photos are the main thing that grows your storage. (Bigger upgrade later: host photos on Firebase Storage instead of inside the database.)
- **Analytics:** turn on a simple visitor counter (Plausible/Google Analytics) to see what customers browse.
- **Low-stock alerts** for you, and **"notify me when back in stock"** for customers (the app already has the building blocks).
- **Reviews moderation** + (security) loyalty points are currently trusted from the customer's browser — fine for now; needs a backend to be tamper-proof if points ever equal real money.
- **Find-on-Google (SEO):** the store is an app-style site, great for sharing by link. If you want Google search to list individual products, that's a larger change — ask me if/when you want it.

---

## 🔒 Security recap (already in place)
- Catalog/settings writes locked to your Google admin UID.
- Orders are private per customer.
- WhatsApp number + password changes require your Google account **and** an emailed OTP.
- Stock can only be decremented by customers (no tampering up); requests no longer overwrite each other.
