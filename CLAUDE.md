# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # Dev server (app)
npx expo start --web    # Web version
npx serve landing -p 3000  # Static marketing landing page
npx serve admin -p 3001    # Admin dashboard (standalone HTML, Supabase login)
```

No tests. No linter. TypeScript via Expo transpilation only.

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
| `lib/pricing.ts` | Pricing engine: `priceFor()`, `formatCents()`, `depositCents()`, `surchargesFromGig()` |
| `lib/supabase.ts` | Supabase client + all DB type interfaces (Profile, Gig, Payment, etc.) |
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
| `components/AddressAutocomplete.tsx` | Nominatim address search |
| `components/VoiceScheduleInput.tsx` | Unused — voice recording modal (gutted; keyboard dictation used instead) |
| `components/primitives/` | Button, Card, Chip, Avatar, Tag, Stepper, Toggle, StarRow |

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
| `supabase/functions/stripe-webhook/` | Stripe webhook — verifies signature, updates `payments` + `gigs` server-side on `payment_intent.succeeded`. Requires `STRIPE_WEBHOOK_SECRET` secret + endpoint configured in Stripe dashboard. |
| `supabase/migrations/008_realtime_gigs.sql` | Enables Supabase Realtime on `gigs` and `gig_applications` tables |
| `supabase/migrations/009_gig_categories.sql` | Adds `gig_category`, `gig_title`, `gig_description` to gigs; `category_colors` jsonb to profiles |
| `supabase/functions/parse-schedule-voice/` | Unused — Whisper+Claude voice parser (replaced by keyboard dictation) |
| `landing/index.html` | Static marketing landing page (NOT served by Expo) |
| `admin/index.html` | Standalone admin dashboard — run with `npx serve admin -p 3001` |

## DB Tables & FK Order

Types in `lib/supabase.ts`. Delete order: notifications → reports → reviews → payments → gig_photos → gig_applications → mover_locations → gigs → mover_profiles → profiles.

## Key Business Logic

- **Pricing**: Base by home_size → crew/truck multipliers → surcharges (stairs $75/flight, heavy items $75-350 each, distance $1.25/mi over 15mi, long carry $50). Tax 8.25%.
- **Payment**: Customer pays 10% deposit via Stripe. Remaining 90% settled directly customer→mover.
- **Gig status flow**: `draft` → `posted` → `matched` → `in_progress` (deposit paid) → `completed`.
- **Gig wizard steps**: Always starts with `StepCategory`. Moving: dynamic by `home_size` ('item' skips crew, 'other' skips inventory+crew). Non-moving categories (cleaning, etc.): simplified flow — category → locations → schedule → contact → review.
- **Gig categories**: `gig_category` field on gigs ('moving' default). Only 'moving' is live; others shown as "Coming Soon" in `StepCategory`. To enable a category flip `available: false → true` in `StepCategory.tsx`.
- **Category colors**: Per-user swatch preferences in `profiles.category_colors` (jsonb). Mover home merges with `DEFAULT_CATEGORY_COLORS` fallback. Saved via mover settings.
- **NATO naming**: Mover home groups available gigs within 90 min of each other and badges them Alpha/Bravo/Charlie etc. Logic in `assignNatoNames()` in `app/(mover)/home.tsx`.
- **Mover verification**: `mover_profiles.status` must be 'approved'. Approve via admin dashboard or Supabase table editor.
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
- **Avatar upload**: `avatars/{userId}/avatar.{ext}` in Supabase Storage. RLS enforces `auth.uid()::text = storage.foldername(name)[1]`. Migration: `007_avatars_storage.sql`.
- **Resend SMTP**: Sender must be a verified domain (not Gmail). Port 465, username `resend`. Use `noreply@fastfixwork.com`. Duplicate email signups — Supabase silently succeeds without sending email; delete user from Auth → Users before re-testing.
- **Realtime home screens**: Both home screens subscribe to `gigs` table changes via Supabase Realtime (requires migration 008). Mover: new posted jobs appear live, accepted/completed jobs update. Customer: gig status updates live, `gig_applications` INSERT triggers a reload. Channels cleaned up on unmount.
- **Delete account**: `hooks/useAuth.ts` → `deleteAccount()` calls `delete-account` edge function then signs out. UI button in both customer and mover settings (underlined text below sign out).
- **Avatar upload**: Both customer and mover settings have photo picker (`expo-image-picker`). Uploads to `avatars/{userId}/avatar.{ext}`. Customer settings added this pattern in the same session as mover settings.

## Environment Variables (.env)

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY`
