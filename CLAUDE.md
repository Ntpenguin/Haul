# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # Dev server (app) — Expo Go, no native modules (no Stripe/bg-location)
npx expo start --dev-client  # Dev server for an installed EAS dev build (full native modules)
npx expo start --web    # Web version
npx serve landing -p 3000  # Static marketing landing page
npx serve admin -p 3001    # Admin dashboard (standalone HTML, Supabase login)
```

No tests. No linter. TypeScript via Expo transpilation only.

## EAS Builds & Device Testing

- **Expo Go can't run Stripe payments or background location** (native modules). Use an EAS **dev build** (`eas build --profile development --platform android`) installed on a device/emulator, then `npx expo start --dev-client`.
- **expo-splash-screen MUST be installed** (`expo-splash-screen` in package.json). SDK 54 prebuild generates `MainApplication.kt` calling `expo.modules.splashscreen.SplashScreenManager`; if the package is missing the dev build crashes on launch with `ClassNotFoundException: ...SplashScreenManager` (`MainApplication.onCreate`). app.json uses the legacy top-level `splash` key.
- **EAS env vars**: `.env` is gitignored so EAS Build won't upload it. `eas.json` build profiles set `"environment": development|preview|production`; push the app's PUBLIC vars to EAS server-side via `eas env:push --environment <env> --path <file>`. `eas env:push` REJECTS empty values — push a trimmed file with only the 3 used vars (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`); `EXPO_PUBLIC_MAPBOX_TOKEN`/`EXPO_PUBLIC_SENTRY_DSN` are empty (unused). NEVER push `STRIPE_SECRET_KEY` to the app build.
- **Isolated app TEST-MODE Stripe** (test payments without touching live): dev EAS env overrides `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`→pk_test + adds `EXPO_PUBLIC_STRIPE_MODE=test`. `hooks/usePayments.ts` then calls `create-payment-intent-test` (reads secret `STRIPE_SECRET_KEY_TEST`) instead of live `create-payment-intent`; `stripe-webhook-test` (reads `STRIPE_SECRET_KEY_TEST` + `STRIPE_WEBHOOK_SECRET_TEST`, app-gig path only) completes the chain. pk/sk must be from the SAME Stripe account (live account is `..._51TYF63DzksslYekx...` — NOT the old `51TYF6FDqX9Woayua` test keys). Test card `4242 4242 4242 4242`. Revert dev to live: delete the 2 dev env vars + rebuild.
- **Windows = no iOS Simulator** (needs macOS); real-device/App Store iOS needs a paid Apple Dev acct. Test on the free Android dev build first.
- **Android emulator (Windows)**: Android Studio SDK at `C:\Users\USER\AppData\Local\Android\Sdk`; set `ANDROID_HOME`/`ANDROID_SDK_ROOT` (env vars apply only to NEW terminals). adb at `<SDK>\platform-tools\adb.exe`. Install a built APK: `eas build:run -p android --latest`.
- **Port 8081 gotcha**: a Docker `smarketer_pro_searxng` container (8081→8080) can occupy Metro's default 8081, forcing Metro to 8082 and breaking emulator auto-connect. Free it with `docker stop smarketer_pro_searxng` (restart later with `docker start`). Manual connect if needed: `adb reverse tcp:<port> tcp:<port>` then `adb shell am start -a android.intent.action.VIEW -d "exp+fast-fix-work://expo-development-client/?url=http%3A%2F%2Flocalhost%3A<port>" com.fastfixwork.app`.

## Project

**Fast Fix Work (FFW)** — two-sided gig marketplace for moving/labor in Austin, TX. Customers post gigs, movers apply. React Native + Expo SDK 54 + Supabase.

## Conventions — FOLLOW THESE

- **Prices**: Always in cents. Never use floats for money. Use `formatCents()` from `lib/pricing.ts`.
- **Icons**: Ionicons only (`@expo/vector-icons`). App logo is "FFX" text, not an icon.
- **Colors**: Always from `lib/theme.ts`. Never hardcode hex values inline. Use `colors.sage` for supporting green accents. Exception: category colors are user-customizable hex values stored in `profiles.category_colors` (jsonb) — defaults defined in `StepCategory.tsx` and `app/(mover)/home.tsx`.
- **State**: Zustand only. Two stores: `stores/auth.ts`, `stores/gigDraft.ts`. No React context.
- **Names**: Always split into first/last. Auto-capitalize via `properCase()` from `lib/nameFormat.ts`. Stored as combined `full_name` in DB.
- **Components**: Reuse primitives from `components/primitives/` (Button, Card, Chip, Avatar, Tag, Stepper, Toggle, StarRow).
- **Styling**: Inline styles (no StyleSheet.create). Use `colors`, `radii`, `spacing`, `shadows` from theme.
- **Navigation**: expo-router v6 file-based. Use `router.push()` / `router.replace()`. Role-based: `profile.role === 'mover'` → `/(mover)/`, else `/(customer)/`.
- **DB queries**: Use `supabase` client from `lib/supabase.ts`. All types defined there.
- **Platform splits**: Use `.web.ts` / `.native.ts` suffixes (see `lib/stripe-native`).
- **RLS gotcha**: Setting a FK column to `null` via direct update will be silently blocked if the RLS policy uses that column. Use a `SECURITY DEFINER` RPC instead (see `withdraw_from_gig`).

## File Map

### Core
| File | Purpose |
|------|---------|
| `app/_layout.tsx` | Root layout, StripeProvider, auth listener, push notification registration + tap handler, background location task import |
| `app/index.tsx` | Auth redirect → customer or mover home |
| `lib/theme.ts` | Design tokens: colors (amber accent, sage green), spacing, radii, shadows |
| `lib/pricing.ts` | Pricing engine: `priceFor()`, `formatCents()`, `surchargesFromGig()`, `estimatedDurationHours()` (size + drive time). Kept in parity with intake `calcQuote` + `create-quote-payment`. |
| `lib/difficulty.ts` | Move difficulty 1–5 (`difficultyFor`/`difficultyLabel`). Mirror of `compute_gig_difficulty` SQL (migration 042) for app display. |
| `lib/supabase.ts` | Supabase client + all DB type interfaces (Profile, Gig, Payment, Business, FleetVehicle, etc.) |
| `lib/config.ts` | App config: service area, platform fee, photo constraints |
| `lib/stripe.ts` | Stripe constants, deposit/remainder calculations |
| `lib/nameFormat.ts` | `properCase()` for name auto-capitalization |
| `lib/notifications.ts` | Push notifications: `registerPushToken()`, `sendToUser()` via Expo Push API |
| `lib/locationTask.ts` | Background location TaskManager task (`LOCATION_TASK`). Must be imported at app root. |
| `stores/auth.ts` | Auth state (session, profile) |
| `stores/gigDraft.ts` | Gig wizard draft state (all fields including specialty item details) |

### Auth (`app/(auth)/`)
| File | Purpose |
|------|---------|
| `welcome.tsx` | Landing screen with hero + sign in/up buttons |
| `phone.tsx` | Sign in (email/password) |
| `verify.tsx` | Sign up (email/password) → redirects to verify-otp |
| `verify-otp.tsx` | 6-digit OTP email verification (paste support, resend with 60s countdown) |
| `mover-signup.tsx` | 10-step mover onboarding wizard → redirects to verify-otp after bio |

### Customer (`app/(customer)/`)
| File | Purpose |
|------|---------|
| `home.tsx` | Dashboard: hero card, active/previous jobs, "Your crew". Pull-to-refresh + focus-refresh. |
| `gig/new.tsx` | Gig creation wizard controller (dynamic steps by `gig_category` + `home_size`; non-moving skips inventory/crew) |
| `gig/[id].tsx` | Gig detail: status, map, live mover location, applications, payment, reviews |
| `gig/chat.tsx` | Chat with matched mover |
| `settings.tsx` | Profile settings + reviews received |
| `worker/[id].tsx` | Worker profile view with report button |

### Mover (`app/(mover)/`)
| File | Purpose |
|------|---------|
| `home.tsx` | Dashboard: online toggle, available/active/completed jobs (gated by admin approval). Pull-to-refresh + focus-refresh + Supabase Realtime feed. Color-coded job cards by `gig_category`. NATO call-signs (Alpha/Bravo/…) for gigs within 90 min of each other. |
| `gig/[id].tsx` | Gig detail: apply, counter offer, waive surcharges, checklist, street view, "I'm on my way" live tracking, mark complete, withdraw |
| `gig/chat.tsx` | Chat with customer |
| `settings.tsx` | Profile settings + reviews received + category color customization (swatch picker → saves to `profiles.category_colors`) |
| `earnings.tsx` | Earnings overview |

### Wizard Steps (`components/wizard/`)
| File | Purpose |
|------|---------|
| `StepCategory.tsx` | Job category picker (Moving active; Cleaning, Junk Removal, Landscaping, Organizing, Can-to-Curb, Towing grayed out "Coming Soon") |
| `StepLocations.tsx` | From/to address with Nominatim autocomplete |
| `StepSize.tsx` | Move size selector + specialty item details (type, dimensions, condition, weight, handling) |
| `StepInventory.tsx` | Room counters, heavy items, photos (simplified for single items) |
| `StepCrew.tsx` | Crew size + truck size |
| `StepExtras.tsx` | Stairs, elevator, long carry, pickup/dropoff notes |
| `StepSchedule.tsx` | Anytime or full calendar date picker + hour grid (6AM–9PM) + job title/description TextInputs (supports keyboard dictation mic) |
| `StepContact.tsx` | First/last name (auto-capitalized), phone, email, notes |
| `StepReview.tsx` | Summary before posting |

### Shared Components
| File | Purpose |
|------|---------|
| `components/StaticMap.tsx` | Leaflet map via WebView, Esri satellite tiles, OSRM route. Accepts optional `moverLat`/`moverLng` — updates live marker via `injectJavaScript` without reload. |
| `components/ChatScreen.tsx` | Chat UI, locked until deposit paid (checks gig status + payments table) |
| `components/AddressAutocomplete.tsx` | Nominatim address search || `components/primitives/` | Button, Card, Chip, Avatar, Tag, Stepper, Toggle, StarRow |

### Hooks
| File | Purpose |
|------|---------|
| `hooks/useAuth.ts` | Auth operations: signUp, signIn, signOut, deleteAccount |
| `hooks/useGigs.ts` | Gig CRUD: create, fetch, apply (notifies customer), accept (notifies mover) |
| `hooks/useMessages.ts` | Real-time chat via Supabase Realtime |
| `hooks/usePayments.ts` | Stripe payment flow |
| `hooks/useUploadPhoto.ts` | Photo upload to Supabase Storage |

### Backend / Static
| Path | Purpose |
|------|---------|
| `supabase/migrations/001_initial_schema.sql` | Full DB schema + RLS policies |
| `supabase/migrations/002_reports.sql` | `reports` table for user flagging |
| `supabase/migrations/003_review_triggers.sql` | Auto-update `profiles.rating` + `total_gigs` on review insert / gig complete |
| `supabase/migrations/004_withdraw_rpc.sql` | `withdraw_from_gig(p_gig_id)` — SECURITY DEFINER RPC to bypass RLS when nulling mover_id |
| `supabase/migrations/005_mover_locations.sql` | `mover_locations` table + realtime enabled for live tracking |
| `supabase/migrations/006_push_tokens.sql` | Adds `push_token` column to profiles |
| `supabase/migrations/007_avatars_storage.sql` | Creates `avatars` storage bucket + RLS policies |
| `supabase/functions/create-payment-intent/` | Stripe payment intent edge function |
| `supabase/functions/delete-account/` | Deletes auth user via service role (called from `hooks/useAuth.ts`) |
| `supabase/functions/notify-mover-approved/` | DB webhook → sends Expo push notification when mover status → 'approved' |
| `supabase/functions/register-mover/` | Service-role mover signup (anon, `--no-verify-jwt`) — backs BOTH the public `landing/worker-signup.html` form AND the admin "+ Add worker" modal. Creates the auth user (`auth.admin.createUser`, email auto-confirmed) + writes `profiles` (role=mover) + `mover_profiles` (status `pending`); rolls back the auth user on failure; per-IP rate-limited; selfie optional |
| `supabase/functions/stripe-webhook/` | Stripe webhook — verifies signature, updates `payments` + `gigs` server-side on `payment_intent.succeeded`. Requires `STRIPE_WEBHOOK_SECRET` secret + endpoint configured in Stripe dashboard. |
| `supabase/migrations/008_realtime_gigs.sql` | Enables Supabase Realtime on `gigs` and `gig_applications` tables |
| `supabase/migrations/009_gig_categories.sql` | Adds `gig_category`, `gig_title`, `gig_description` to gigs; `category_colors` jsonb to profiles || `landing/index.html` | Static marketing landing page (NOT served by Expo) |
| `supabase/migrations/010–057` | Incremental. Notables: quote_requests/leads (017–038), payouts/Connect (032), admin RPCs + `is_admin()` (034), RLS hardening (039/040), rate limiter (041), **difficulty + duration + skill gate (042)**, **businesses + fleet (043/044)**, **surcharges (045)**, admin-insert-gigs (046), **referral program (047, payout_handle 051)**, **B2B intake jobs (048; special_items 050; booked-slot union 052; payment 053)**, **Single-item difficulty (049)**, crew roster + payout ledger (054) + crew↔gig assignment (055) — **both repointed to movers in 057**, **`quote_requests.partial_load` + re-declares `save_quote_lead` (056 — partial-load tier RETIRED 2026-06-12, column remains but is no longer priced)**, **crew unified onto `mover_profiles` (worker_payouts/job_crew FKs → profiles) + `mover_profiles.deleted_at` soft-delete (057)**. Forward-only; run manually in the SQL editor; use named `$func$` quoting. |
| `supabase/functions/create-quote-payment/` | Web-intake PaymentIntent — **recomputes price server-side** (mirrors intake `calcQuote`) + per-IP rate limit + referral $25 credit |
| `supabase/functions/create-surcharge/` | Admin-initiated extra charge → Stripe Checkout link + Resend email (admin-gated; deploy WITHOUT `--no-verify-jwt`). Resolves customer email from profiles / quote_requests / business_jobs |
| `supabase/functions/submit-business-job/` | B2B intake decision engine (anon, `--no-verify-jwt`) — recommended price (multi-stop distance + access + special items) + est duration + duration-aware calendar-conflict check → accept/counter/pending. Auto-accept bills via `_shared/bizbill.ts` |
| `supabase/functions/bill-business-job/` | Accept a business job → UNPAID gig + Stripe Checkout pay-link + email. Called by admin "Book" + internally. Auth = JWT `role==='service_role'` OR `is_admin()`. Shares `_shared/bizbill.ts` |
| `supabase/functions/_shared/bizbill.ts` | `billBusinessJob(svc, stripe, resendKey, jobId)` — single billing impl imported by submit-business-job + bill-business-job (edge-fn→edge-fn HTTP calls are unreliable; share a module instead) |
| `supabase/functions/{connect-onboard,connect-status,transfer-to-mover}/` | Stripe Connect Express payouts |
| `landing/business.html` | **B2B intake form** (name/phone/email/photos/up-to-4 stops/access/special-items checklist + offer + live recommended price) → `submit-business-job` |
| `landing/worker-signup.html` | **Public mover signup form** (same questions as `mover-signup.tsx` minus license/insurance; selfie optional; creates a real login) → `register-mover`. Linked from the landing footer ("Become a worker"). Lands as a `pending` mover in the admin Workers tab |
| `landing/{privacy,terms,delete-account,surcharge-paid}.html` | Hosted legal + account-deletion + payment-success pages → SiteGround `public_html/` |
| `admin/index.html` | Standalone admin dashboard (`npx serve admin -p 3001`). **Deployed to SiteGround `public_html/admin-panel/` via manual upload.** |

## DB Tables & FK Order

Types in `lib/supabase.ts`. Delete order: notifications → reports → reviews → payments → gig_photos → gig_applications → mover_locations → gigs → mover_profiles → profiles.

## Key Business Logic

- **Pricing**: Base by home_size (**Single item $93.75**, Just a few items $175, Small move $250, Studio $350, 1BR $500, 2BR $800, 3BR $1,350, 4+BR $1,600) → crew/truck multipliers → surcharges (stairs $50/flight, elevator $40/location, heavy items $75-350 each, distance $1.25/mi over 15mi, long carry $50, **prep disassembly add-ons: bed frame $50 / shelving $25** (flat, from the consumer `prep_needed` options — `PREP_SURCHARGES`), **heavy common-item flag $75 each** (`common_item_details` counts of `'Heavy (250lb+)'` — `HEAVY_COMMON_FEE`, added 2026-06-12)) → **% add-ons on adjusted base: home staging +30%, packing service +35%**. Tax 8.25%. The **partial-load tier was retired 2026-06-12** (Small move covers it; `quote_requests.partial_load` column remains but is never priced). create-quote-payment `select` must include `prep_needed` AND `common_item_details`. NOTE: `formatCents`/`fmtMoney` display rounds to whole dollars, so Single item shows ~$94 though it charges $93.75.
- **PARITY (critical)**: the consumer pricing must stay identical across `lib/pricing.ts`, intake `calcQuote` (`landing/intake.html`), `create-quote-payment` (server-authoritative; never trusts client `estimated_price_cents`), and the admin `calcLeadQuote`. This includes the packing % (35), staging % (30), and the heavy common-item fee ($75). Guarded by `scripts/pricing-parity.test.mjs`. The **B2B pricing** (`landing/business.html` calc ↔ `submit-business-job`) is a SEPARATE parallel set that must also stay in sync (base + multi-stop distance + access flats + special items). Difficulty: `lib/difficulty.ts` ↔ `compute_gig_difficulty` SQL. NOTE `home_size` has two vocabularies — app `'2br'` vs intake `'2 BR'` — DB functions handle both.
- **Surcharges (admin-initiated, post-booking)**: when an on-site job exceeds its quote, the admin bills extra from the gig modal (Gigs tab). `create-surcharge` edge fn (admin-gated via `is_admin()`) creates a Stripe **Checkout link** (no stored card), emails it via Resend, and records a `surcharges` row (migration 045). The `stripe-webhook` flips the row to `paid` on `payment_intent.succeeded` where `metadata.type === 'surcharge'` (checked first, early-returns). Success page: `landing/surcharge-paid.html`.
- **B2B intake (business jobs, no account)**: `landing/business.html` → `submit-business-job` (anon). A business enters items + up to 4 stops + an offered price; the server computes a recommended price + duration + checks the calendar (duration-aware, no double-booking) and decides: **accept** (offer ≥ 80% of recommended), **counter** (offer too low → counter at recommended, or slot taken → counter an open start), or **pending** (estimated > 4 hrs). Stored in `business_jobs` (migration 048; admin-only RLS). Reviewed in the admin **Business Jobs** tab (counter / book / complete). On accept (auto OR manual), the business is **billed**: `billBusinessJob` (`_shared/bizbill.ts`) creates an **UNPAID gig** (`paid_at` null) + a Stripe Checkout pay-link emailed to the business; `stripe-webhook` (`metadata.type==='business_job'`) marks it paid + stamps the gig. `get_booked_slots` (migration 052) now unions booked business jobs so both forms respect them.
- **Referral program (individuals)**: admin creates a code in the **Referrals** tab (name/email/phone/**Venmo-Zelle payout handle**) → QR → `intake.html?ref=CODE`. Referred customer gets a one-time **$25 credit** — claimed two ways: scanning the QR / opening the `?ref=` link (`captureRef()`), **or typing the code into the review-step "Have a referral code?" field** (`renderRefEntry()`/`applyRefCode()` in `intake.html`, added 2026-06-05). Both routes set `S.referralCode` and resolve via the same `referral_lookup` RPC (dedupe by email/phone/name + self-referral block; applied server-side in `create-quote-payment` so display==charge; mover payout grossed up so the **platform** absorbs the credit). Referrer gets **$20 cash after the move completes** — tracked in `referrals` (migrations 047/051); a gig→completed trigger flips the reward to `owed`; admin pays out manually and marks paid. NO automated referrer payout.
- **Difficulty (1–5)**: `gigs.difficulty` stamped by a BEFORE INSERT/UPDATE trigger (`compute_gig_difficulty`, migration 042) from size + stairs + specialty items + long-distance + staging + packing → Easy/Light/Moderate/Heavy/Expert. Shown in wizard review, gig detail, admin.
- **Mover skill gate (admin-assign only)**: `mover_profiles.max_difficulty` (auto-seeded from years_experience; admin override in dashboard). `assign_mover_to_gig` refuses a mover below the gig's difficulty. Customer-accept + mover feed are intentionally NOT gated.
- **Estimated duration**: `gigs.estimated_duration_hours` = size labor hours + one-way drive (`distance ÷ 45 mph`), set by the same trigger / `estimatedDurationHours()`.
- **Businesses + fleet** (admin-managed orgs): `businesses` table; worker→employer via nullable `mover_profiles.business_id`; `fleet_vehicles` (each optionally `assigned_mover_id`). Admin-only RLS (043); movers read their own business/fleet via migration 044. All businesses are created from the admin Business tab. Mover profile shows employer + assigned vehicle.
- **Payment**: Customer pays **100% upfront** via Stripe. Platform keeps a **15% service fee** (`PLATFORM_FEE_PERCENT` in `lib/pricing.ts`). The worker's share (`mover_payout_cents`) is paid out **after the job** via Stripe Connect (Express accounts) — `connect-onboard`/`connect-status`/`transfer-to-mover` edge functions; mover UI in `earnings.tsx` (+ `hooks/usePayouts.ts`).
- **Gig status flow**: `draft` → `posted` → `matched` → `in_progress` (paid in full) → `completed`. Payout: `payout_status` `unpaid` → `pending` → `paid` (after `transfer-to-mover`).
- **Leads vs gigs**: Website intake leads and in-app gig wizards autosave partial progress (`quote_requests.progress_step` / `gigs.draft_step`). Admin **Leads** tab shows only **abandoned** attempts (web `incomplete` + app `draft`) with the step they stopped on; **paid** leads convert to marketplace gigs (`stripe-webhook`) and appear under Gigs/Calendar. Leads are **soft-deleted** (`quote_requests.deleted_at`), shown in a Deleted tab.
- **Gig wizard steps**: Always starts with `StepCategory`. Moving: dynamic by `home_size` ('item' skips crew, 'other' skips inventory+crew). Non-moving categories (cleaning, etc.): simplified flow — category → locations → schedule → contact → review.
- **Gig categories**: `gig_category` field on gigs ('moving' default). Only 'moving' is live; others shown as "Coming Soon" in `StepCategory`. To enable a category flip `available: false → true` in `StepCategory.tsx`.
- **Category colors**: Per-user swatch preferences in `profiles.category_colors` (jsonb). Mover home merges with `DEFAULT_CATEGORY_COLORS` fallback. Saved via mover settings.
- **NATO naming**: Mover home groups available gigs within 90 min of each other and badges them Alpha/Bravo/Charlie etc. Logic in `assignNatoNames()` in `app/(mover)/home.tsx`.
- **Mover verification**: `mover_profiles.status` must be 'approved'. Approve via admin dashboard or Supabase table editor.
- **Worker onboarding & management**: movers self-register at `landing/worker-signup.html` (or admin "+ Add worker"); both POST to `register-mover` which creates a real login + a `pending` mover. There is ONE worker concept = the app movers (`mover_profiles`, shown in the admin **Workers** tab). The loginless `workers` table (054) is retired. **Delete worker = soft-delete** (`mover_profiles.deleted_at`, set via UPDATE under the "Admin can update mover profiles" policy) — hard delete is blocked by the RESTRICT FKs on `gigs.mover_id`/`reviews.mover_id`. Workers tab has Active/Deleted sub-tabs + Restore. `activeMovers()` (excludes soft-deleted) feeds the Crew & pay roster, gig-modal crew picker, and Schedule.
- **Chat lock**: Messaging blocked until deposit confirmed. Checks gig status (in_progress/completed = paid) then falls back to payments table.
- **Mover checklist**: Per-item sub-checklist (wrapped, padded, assembled, disassembled, waived, junk removed) for in_progress jobs.
- **Live tracking**: Mover taps "I'm on my way" → `watchPositionAsync` (foreground, works in Expo Go) → upserts to `mover_locations` → customer map updates via Supabase Realtime without WebView reload. Store subscription in a `useRef<LocationSubscription>` and call `.remove()` to stop.
- **Push notifications**: Sent client-side via Expo Push API (`lib/notifications.ts`). Triggers: mover applies → customer notified; customer accepts → mover notified; job complete → customer notified. Tap navigates to gig detail. Mover approval notification via `notify-mover-approved` edge function triggered by DB webhook.
- **Reviews**: Both sides review after `completed`. DB trigger recalculates `profiles.rating` (avg, 1 decimal) and increments `total_gigs` automatically.
- **Withdraw**: Mover withdrawal uses `withdraw_from_gig` RPC (not direct update) because setting `mover_id = null` violates the RLS USING clause.
- **Street view**: Mover gig detail only. Deep links to Google Maps (`maps.google.com/?layer=c&cbll=lat,lng`) for pickup and dropoff.
- **OTP flow**: After sign-up, user lands on `verify-otp.tsx`. Supabase email template must use `{{ .Token }}` not `{{ .ConfirmationURL }}`. Do NOT wrap template in `<!DOCTYPE html>`. No emojis in template body (Supabase silently drops emails with emoji). `verifyOtp` tries both `type: 'signup'` and `type: 'email'` to handle both resend paths.
- **Background location**: `startLocationUpdatesAsync` requires EAS build and background entitlement — crashes in Expo Go. Use `watchPositionAsync` for foreground tracking instead.
- **isPaid check**: Check `payment.status === 'captured'/'authorized'` OR `gig.status === 'in_progress'/'completed'` — payment record may lag.
- **Photo upload (SDK 54)**: `useUploadPhoto` gets the uri via `expo-image-manipulator` `renderAsync().saveAsync()`, and imports `uploadAsync`/`FileSystemUploadType` from `expo-file-system/legacy` (the classic API moved there in SDK 54).
- **Avatar upload**: `avatars/{userId}/avatar.{ext}` in Supabase Storage. RLS enforces `auth.uid()::text = storage.foldername(name)[1]`. Migration: `007_avatars_storage.sql`.
- **Resend SMTP**: Sender must be a verified domain (not Gmail). Port 465, username `resend`. Use `noreply@fastfixwork.com`. Duplicate email signups — Supabase silently succeeds without sending email; delete user from Auth → Users before re-testing.
- **Realtime home screens**: Both home screens subscribe to `gigs` table changes via Supabase Realtime (requires migration 008). Mover: new posted jobs appear live, accepted/completed jobs update. Customer: gig status updates live, `gig_applications` INSERT triggers a reload. Channels cleaned up on unmount.
- **Delete account**: `hooks/useAuth.ts` → `deleteAccount()` calls `delete-account` edge function then signs out. UI button in both customer and mover settings (underlined text below sign out).
- **Avatar upload**: Both customer and mover settings have photo picker (`expo-image-picker`). Uploads to `avatars/{userId}/avatar.{ext}`. Customer settings added this pattern in the same session as mover settings.

## Animation & Interaction Patterns

- **Press feedback**: Wrap tappable cards in an `AnimatedJobCard`-style component using `Animated.spring` (scale 0.96–0.97 on pressIn, bounce back on pressOut with `bounciness: 8`). Use `activeOpacity={1}` on the `TouchableOpacity` wrapper.
- **Staggered list entrance**: `Animated.spring({ toValue: 1, speed: 14, bounciness: 5, delay: index * 55 })` on opacity (0→1) + translateY (16→0). Wrap each list item in a dedicated animated component.
- **Loading skeletons**: Use `GigCardSkeleton` from `components/primitives` instead of `ActivityIndicator` for list loading states. Render 2–3 skeletons.
- **Animated imports**: When adding spring animations, add `Animated` and `useRef` to imports; remove `ActivityIndicator` if replaced.
- **Admin dashboard animations**: CSS-only via `@keyframes` (modalIn, cardIn, sheetIn) + `cubic-bezier(0.16,1,0.3,1)` spring easing. Stagger via inline `style="animation: cardIn 0.36s ... Nms both"`.

## Intake Form (landing/intake.html)

- **Mobile nav bar**: `.mob-nav-row` is a fixed bottom bar rendered as static HTML in `.shell` (not inside the card template). Bound once via `initMobNav()` at boot. State (disabled, label) synced in `renderCard()` by querying `#mob-back-btn` / `#mob-continue-btn`.
- **No auto-advance**: Single-chip selection (`bind === 'single'`) only highlights — does NOT auto-navigate. User presses Continue.
- **Photo quick button**: Triggers a persistent hidden `<input id="photo-quick-input">` outside the card. Files go into `S.photoFiles['photos']` without navigating away.
- **iOS submit pattern**: Submit form data first with `photo_urls: []` → show confirmation immediately → upload photos in parallel background with `Promise.allSettled` → PATCH record with URLs. Use `keepalive: true` on all fetch calls to prevent iOS Safari from throttling pending requests when page state changes.

## Admin Dashboard (admin/index.html)

- **Sidebar active state**: The `pages` array in `showPage()` must exactly match sidebar `<a>` HTML order. Current order: `['overview','users','movers','businesses','gigs','applications','photos','leads','calendar','referrals','bizjobs','pricing','crew','schedule']` (the `movers` page is labeled "Workers" in the sidebar). Mismatch causes wrong tab to highlight.
- **Tabs**: **Referrals** (codes + QR + Venmo/Zelle payout + owed-payout table + **printable flyer**: `referralFlyer(id)` opens the full branded one-page flyer (FFX wordmark, Thumbtack rating, differentiators, phone-checkpoint mockup + testimonial) in a new tab, auto-filling 3 blanks — referrer **name** (`.fillname`), their **QR** (`.qrbox`), their **code** (`.code`) — then Print/Save-as-PDF. Archivo/Archivo-Black load from Google Fonts (see CSP). Template mirrors `Downloads/flyer.html`), **Business Jobs** (B2B intake review: counter / book→bills / complete; click a row for the detail modal), **Pricing** (read-only rate reference), **Crew & pay** (`renderCrew()` — manual payout ledger for the SAME workers as the Workers tab (app movers via `activeMovers()`, since migration 057; no "add a worker" form here — they come from signup/Workers tab). Log a payout per mover per job (gig dropdown auto-fills `mover_payout_cents`), mark paid; `worker_payouts.worker_id` = a mover's `profiles.id`), **Schedule** (`renderSchedule()` — scheduled gigs grouped by day with assigned crew + double-booking ⚠ via `workerConflict()`; click a row → gig modal). **Add gig** button on the Gigs tab manually inserts a gig (migration 046 INSERT policy).
- **Gig modal job planning + crew** (added 2026-06-07): `jobPlanningSection()` (read-only — difficulty/duration/crew/truck/access + prep & handling flags from the linked lead's `common_item_details`/`prep_needed` or biz `special_items`, plus a derived `gearChecklist()` "gear to bring") and `gigCrewSection()` (assign/remove crew via `job_crew`, migration 055; roster = `activeMovers()`, `worker_id` = a mover's `profiles.id` since 057; shows N/crew_size + ⚠ if a worker is double-booked). Crew can be assigned/removed from BOTH the gig modal (`gigCrewSection`) and inline on each Schedule row (`sched-pick-<gigId>` picker + ✕). `assignCrew`/`removeCrew` are context-aware — they refresh the Schedule when `currentPage==='schedule'`, else re-open the gig modal.
- **Gig modal**: shows operational fields once + a full **Customer details** section for gigs linked to a paid lead (`quote_request_id`) or business job — built from shared `leadCustomerRows()`; move details are NOT duplicated for linked gigs (`isLinked`). `openLeadModal` uses the same helper.
- **Login**: "Remember me" checkbox → custom `authStore` swaps localStorage (persist) vs sessionStorage (clear on close) + prefills saved email.
- **Business tab**: `+ Create business` → `businesses`; per-business modal manages the worker roster (`mover_profiles.business_id`) + fleet (`fleet_vehicles`, assign to a worker). Vehicle entry = Type/Make `<select>` (`VEHICLE_MAKES` catalog) + Model `<datalist>` + Other fallback.
- **Mover modal**: skill-level (`max_difficulty`) dropdown + editable skills chips (× on each chip removes; "Add a skill" box → `addMoverSkill`/`removeMoverSkill`); **🗑 Delete worker** (soft → `deleteMover`) / **↩ Restore** (`restoreMover`); Approve/Suspend. The Workers tab itself has Active/Deleted sub-tabs (`moverTab`) + "+ Add worker" (`showAddMoverModal` → `register-mover`). gig modal shows difficulty + est. duration; assign errors surface in the existing `alert`.
- **CSP**: `img-src` must allow `https://api.qrserver.com` (referral QR images) — else they render as broken icons. `style-src`/`font-src` allow `https://fonts.googleapis.com` / `https://fonts.gstatic.com` so the branded referral flyer's Archivo fonts load in the popup it opens.
- **XSS / deploy**: never build an `onclick` from user-controlled data — use `data-*` + a delegated listener. Admin is standalone HTML uploaded to SiteGround manually; before upload validate inline JS by extracting `<script>` blocks and running `node --check`. Deploy edge functions with `SUPABASE_ACCESS_TOKEN=sbp_… npx supabase functions deploy <fn> [--no-verify-jwt] --project-ref joiukvttuamaanrgzfrz`.

## Environment Variables (.env)

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
