# Deployment Guide — Fast Fix Work (App Store + Google Play)

Status legend: ✅ done in code · 🟡 needs your action · ⚠️ verify/risk

## 1. Build tooling (EAS)

- ✅ `eas.json` created with `development`, `preview`, `production` build profiles and a `production` submit profile.
- ✅ `app.json` has `ios.buildNumber`, `android.versionCode`, and `ios.config.usesNonExemptEncryption: false` (skips the export-compliance prompt on every TestFlight upload).
- 🟡 Install + log in: `npm i -g eas-cli` then `eas login`.
- 🟡 Run `eas init` in the repo to create the Expo project and write `extra.eas.projectId` into `app.json`. (Not committed yet because it requires your Expo account.)
- 🟡 Fill the placeholders in `eas.json` → `submit.production`:
  - iOS: `appleId`, `ascAppId` (App Store Connect app ID), `appleTeamId`.
  - Android: place the Play service-account JSON at `./play-service-account.json` (it is git-ignored via `*.json`? NO — add it to `.gitignore`, see §7).

### Build/submit commands (added to package.json)
```
npm run build:prod        # eas build --profile production --platform all
npm run submit:ios        # eas submit --profile production --platform ios
npm run submit:android    # eas submit --profile production --platform android
```

## 2. Accounts & credentials — 🟡 all require you

| Item | Where | Notes |
|------|-------|-------|
| Apple Developer Program | developer.apple.com | $99/yr. Needed for bundle id `com.fastfixwork.app`, signing, TestFlight, App Store. |
| Google Play Console | play.google.com/console | $25 one-time. Needed for package `com.fastfixwork.app`. |
| Expo / EAS account | expo.dev | Free tier OK for builds. |
| iOS signing | `eas build` manages it | Let EAS create the distribution cert + provisioning profile, or upload your own. |
| Android keystore | `eas build` manages it | EAS generates + stores the upload keystore. Back it up. |
| Play service account | Google Cloud → Play Console | JSON key for `eas submit` to Android. |

## 3. Payments (Stripe) — ✅ code complete, 🟡 go-live steps

**Model: customer pays 100% upfront in-app → platform keeps a 15% service fee → worker is paid out after the job via Stripe Connect.**

- ✅ `create-payment-intent` charges the **full** `quoted_price_cents` (server-authoritative — client sends only `gig_id`). Intent metadata carries `total_price_cents`, `platform_fee_cents`, `mover_payout_cents`.
- ✅ Website intake (`create-quote-payment`) also charges the full price; the signature-verified `stripe-webhook` marks the lead paid and converts it into a marketplace gig (`customer_id: null`, `payout_status: 'unpaid'`, payout amounts stamped).
- ✅ **Stripe Connect payouts (Express accounts):**
  - `connect-onboard` — creates/reuses the mover's Express account, returns a hosted onboarding link.
  - `connect-status` — syncs `charges_enabled` / `payouts_enabled` / `stripe_onboarding_complete` into `mover_profiles`.
  - `transfer-to-mover` — pays out `mover_payout_cents` to the mover's connected account once the gig is `completed` + `paid_at` set; idempotent (`idempotencyKey: payout_<gig_id>`, guarded by `payout_status`).
  - `stripe-webhook` handles `account.updated` to keep mover payout flags current, and stamps app gigs with `paid_at` + payout amounts on `payment_intent.succeeded`.
- ✅ Mover UI: `app/(mover)/earnings.tsx` shows payout-setup state (Connect bank / finish setup / refresh) and a per-job **Cash out** button; logic in `hooks/usePayouts.ts`.
- ⚠️ Apple guideline 3.1.3(e)/3.1.5: Stripe is allowed here because moving is a **real-world service** consumed outside the app (NOT digital content). Do not add "buy credits"/digital goods or Apple will require IAP.
- 🟡 **Enable Stripe Connect** in the Stripe dashboard (Connect → Express, US, `transfers` capability). Set platform branding for the onboarding flow.
- 🟡 Set Connect onboarding return/refresh deep links as secrets: `CONNECT_RETURN_URL`, `CONNECT_REFRESH_URL` (else they fall back to fastfixwork.com).
- 🟡 Confirm Stripe **live mode**: live `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` in production env; `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` in Supabase secrets.
- 🟡 Add `account.updated` to the Stripe webhook endpoint events (plus existing `payment_intent.succeeded` / `payment_intent.payment_failed`).
- 🟡 Run the new migrations: `032_payouts_and_lead_linkage.sql`, `033_progress_step.sql`, `034_admin_assign_and_matched_read.sql`.
- 🟡 **Seed your admin account** (required for the admin "Assign mover" action on lead-sourced gigs). In Supabase → Auth → Users, copy your admin login's user UUID, then run once:
  `INSERT INTO admins (user_id) VALUES ('<your-auth-user-uuid>');`
  Without this, `assign_mover_to_gig` raises `Not authorized` and paid website-lead gigs (customer_id NULL) can never have a mover assigned.
- 🟡 Re-deploy edge functions:
  `npx supabase functions deploy create-payment-intent create-quote-payment stripe-webhook connect-onboard connect-status transfer-to-mover`
  (webhook + payment intents use `--no-verify-jwt`; connect-status/onboard/transfer require the user JWT, so deploy those **without** `--no-verify-jwt`).

## 4. Permissions & privacy

- ✅ iOS usage strings present (camera, photo library, location when-in-use + always).
- ✅ Android permissions declared (camera, fine/coarse/background location, foreground-service + foreground-service-location for Android 14+, post-notifications).
- ✅ **Background location wired**: tapping "I'm on my way" now requests background permission and starts `Location.startLocationUpdatesAsync(LOCATION_TASK, ...)` with an Android foreground service; `stopTracking` stops it. (Previously the background mode was declared but never used — an automatic Apple rejection.)
- ⚠️ **App Review note for background location (paste into App Store Connect → App Review notes):**
  > Movers (service providers) optionally enable live location sharing while en route to and during a customer's scheduled move so the customer can see their arrival in real time. Location is shared only for an active, accepted job, only after the mover taps "I'm on my way," and stops when the job ends. Customers never share background location.
- 🟡 Test background location on a real **development/EAS build** (it cannot run in Expo Go and is not testable from this machine). Verify the foreground-service notification shows on Android and the blue bar shows on iOS.
- 🟡 **Privacy policy + support URLs must be publicly reachable.** The app ships in-app `privacy-policy.tsx` and `terms.tsx`, but the stores require hosted URLs. Host them at e.g. `https://fastfixwork.com/privacy` and `https://fastfixwork.com/terms`.
- 🟡 **Apple Privacy "Nutrition Labels"** and **Google Play "Data safety"** form: declare collection of Location, Photos, Contact info (name/email/phone), and that data is used for app functionality. Match what the code actually collects.

## 5. Account deletion — ✅ required by both stores

- ✅ In-app account deletion exists: `hooks/useAuth.ts → deleteAccount()` calls the `delete-account` edge function, available from both customer and mover settings. (Apple 5.1.1(v) requires in-app deletion; Google requires an in-app + web deletion path.)
- 🟡 Provide a **web** account-deletion route too (Google now expects a URL), e.g. a page on fastfixwork.com.

## 6. Store listing assets — 🟡 all require you

- App icon ✅ (`assets/icon.png`, `adaptive-icon.png`) — confirm 1024×1024 with no alpha for iOS.
- 🟡 Screenshots: iPhone 6.7" + 6.5" (and iPad only if you enable tablet — currently `supportsTablet: false`), Android phone + 7"/10" tablet.
- 🟡 Feature graphic (Play, 1024×500), short + full description, keywords, category (Business/Lifestyle), content rating questionnaire (Play) / age rating (Apple).
- 🟡 Support URL, marketing URL, contact email (use `communication@fastfixwork.com`).

## 7. Security / pre-flight — ✅ mostly, 🟡 a couple

- ✅ `.env` is **not** tracked in git (only `.env.example`). Confirmed.
- ✅ Edge functions: signature-verified webhook, auth + ownership checks, server-side pricing, CORS restricted to `https://fastfixwork.com` (mobile native calls are unaffected — CORS is browser-only).
- 🟡 Add `play-service-account.json` and `*.p8`/`*.p12`/`*.jks` to `.gitignore` before placing them (the gitignore already lists `*.jks *.p8 *.p12 *.key`; add the Play JSON explicitly so it is never committed).
- 🟡 Rotate any Stripe **test** keys if test mode auto-rotation is on; confirm live keys for production.
- 🟡 Run `npm run typecheck` and `npm run doctor` (`expo-doctor`) and resolve any SDK 54 dependency warnings before building.

## 8. Dependency health (`npx expo-doctor`)

- ✅ Installed missing peer dependency `expo-font@~14.0.12` (required by `@expo/vector-icons`; without it the app can crash outside Expo Go) and removed a stray `expo-font@55.0.7` that was incompatible with SDK 54.
- 🟡 **Stripe version mismatch — your decision (NOT auto-changed):** `@stripe/stripe-react-native` is `0.65.1`, but Expo SDK 54 officially pairs with `0.50.3`. I did not change it because downgrading a payments module is risky and may have been intentional. Either:
  - keep `0.65.1` and verify the payment sheet works in a real EAS build, or
  - run `npx expo install @stripe/stripe-react-native` to pin the SDK-recommended `0.50.3`, then re-test payments.
- 🟡 Patch lags (low risk): `expo` 54.0.34 → 54.0.35, `expo-router` 6.0.23 → 6.0.24. Run `npx expo install --check` to align.
- ✅ No `metro.config.js` at root — the doctor's "custom metro config" warning is spurious here.
- 🟡 `npm audit` reports 14 moderate vulnerabilities (transitive). Review with `npm audit` but avoid `--force` (breaking) before a build.

## 9. Suggested order

1. `eas login` → `eas init` (writes projectId) → fill `eas.json` submit placeholders.
2. Run migrations `032`/`033`, enable Stripe Connect (Express), deploy all 6 edge functions, add `account.updated` to the webhook, and confirm live Stripe keys/secrets + `CONNECT_RETURN_URL`/`CONNECT_REFRESH_URL`.
3. `npm run typecheck && npm run doctor`.
4. `npm run build:dev` → install on a device → test payments + background location end-to-end.
5. `npm run build:prod`.
6. Create the App Store Connect + Play Console listings (assets, privacy forms, App Review note from §4).
7. `npm run submit:ios` / `npm run submit:android`.
8. Submit for review.
