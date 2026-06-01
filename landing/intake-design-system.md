# Fast Fix Work — Intake Form Design System

Use this file as context when editing or extending `landing/intake.html`.

---

## Brand

- **Company**: Fast Fix Work (FFW) — moving & labor, Austin TX
- **Logo mark**: "FFX" text in white on amber square, 38×38px, border-radius 11px
- **Tagline**: Moving & Labor · Austin, TX
- **Phone**: 512-777-1628

---

## Color Tokens

```css
--amber:      #C98B3F   /* primary accent — buttons, highlights, progress */
--amber-deep: #8B5E2B   /* amber shadows, dark text on amber */
--amber-soft: #F5EDE0   /* amber tint — chip selected bg, info banners */
--amber-mid:  #E8C48A   /* progress bar gradient end */
--ink:        #1A1714   /* primary text, borders */
--ink2:       #534C44   /* secondary text */
--ink3:       #8B8379   /* labels, meta, placeholders */
--ink4:       #B8B0A4   /* disabled, faint */
--bg:         #FAF7F2   /* page background (warm off-white) */
--card:       #FFFFFF   /* card background */
--surface:    #F2EEE7   /* subtle fill — skip button, stepper done state */
--line:       rgba(26,23,20,0.08)   /* dividers */
--line2:      rgba(26,23,20,0.18)   /* borders, stronger dividers */
--success:    #4A8066   /* confirmation green */
--radius:     18px      /* default card border-radius */
--shadow:     5px 5px 0 var(--ink)  /* brutalist offset shadow on cards */
```

---

## Typography

- **Body / UI**: `Inter` (Google Font) — weights 400, 500, 600, 700
- **Display / headings**: `Fraunces` (Google Font) — optical sizes 9–144, weights 400–800
- **Base size**: 16px (prevents iOS zoom on inputs)
- **Line height**: 1.5 body, 1.05 large display titles

### Type Scale

| Role | Font | Size | Weight |
|------|------|------|--------|
| Question title (`.qtitle`) | Fraunces | 34px (26px mobile) | 700 |
| Progress % | Fraunces | 22px | — |
| Confirm title | Fraunces | 40px (32px mobile) | 700 |
| Submit button | Fraunces | 16–18px | 700 |
| Continue button | Fraunces | 18px | 700 |
| Body / chips | Inter | 14–15px | 400–600 |
| Labels / meta | Inter | 10–13px | 600–700 |
| Field inputs | Inter | 15–16px | 400 |

---

## Background

Warm off-white `#FAF7F2` with a subtle dot grid:
```css
background-image: radial-gradient(rgba(26,23,20,0.045) 1px, transparent 1px);
background-size: 22px 22px;
```

---

## Cards

- White background, `border-radius: 18px`
- Border: `1.5px solid var(--line2)`
- **Brutalist offset shadow**: `5px 5px 0 var(--ink)` (desktop), `4px 4px 0 var(--line2)` (mobile)
- Stacked deck effect: 2 background cards peek behind the front card (rotated, lower opacity)
- Slide animation on advance: `cubic-bezier(0.16, 1, 0.3, 1)` spring easing, 0.32s

---

## Chips (Selection Buttons)

- Border: `1.5px solid var(--line2)`, border-radius `999px`
- Background: `var(--card)`, hover: `var(--amber-soft)`
- **Selected state**: `background: var(--amber-soft)`, `border-color: var(--amber)`, `box-shadow: 2px 2px 0 var(--amber)`
- Checkbox dot inside each chip (13×13px square, border-radius 3px)
- Selected checkbox: filled amber with white checkmark
- Active press: `transform: scale(0.97)`
- Staggered entrance animation: `chipIn` keyframe, 40ms delay per nth-child
- Column chips (single choice): `flex-direction: column`, min-height 44–48px
- Grid chips (time slots): `grid-template-columns: 1fr 1fr`

---

## Buttons

### Primary Continue (mobile fixed bottom bar)
- Height 56px, `border-radius: 16px`
- Background `var(--amber)`, color `#fff`
- Shadow: `0 4px 0 var(--amber-deep)` (3D press effect)
- Font: Fraunces 18px 700
- Active: `scale(0.97) translateY(2px)`, shadow reduces to `0 1px 0`
- Ripple effect on tap

### Round Nav Button (desktop)
- 52×52px circle, border `1.5px solid var(--line2)`
- Brutalist shadow: `3px 3px 0 var(--line2)`
- Primary variant: amber fill, `3px 3px 0 var(--amber-deep)`
- Large variant (next): 62×62px

### Submit / Finish Button
- `border-radius: 12px`, padding `12px 22px`
- Fraunces font, amber bg, `3px 3px 0 var(--amber-deep)` shadow
- Hover: `translate(-1px, -1px)`, shadow expands

### Skip Button
- `background: var(--surface)`, border `1.5px solid var(--line2)`, `border-radius: 8px`
- Min-height 44px

---

## Form Inputs

- Height 50px (mobile), border `1.5px solid var(--line2)`, `border-radius: 10px`
- Background `var(--bg)`, font-size 16px (prevents iOS zoom)
- Focus: `border-color: var(--amber)`, amber glow `box-shadow: 0 0 0 3px rgba(201,139,63,0.18)`, `translateY(-1px)`
- Labels: 11px, Inter 700, uppercase, `letter-spacing: 0.06em`, color `var(--ink3)`
- Textareas: `min-height: 80px`, `resize: vertical`

---

## Progress Bar

- Height 16px, `border-radius: 999px`, border `1.5px solid var(--line2)`
- Fill: amber → amber-mid gradient with animated diagonal stripes
- Transition: `width 0.35s cubic-bezier(.4,1.4,.5,1)` (springy)
- Notch markers: clickable, turn white when done
- Floating pin label above current position

---

## Phase Stepper

- Pill-shaped step buttons: border `1.5px solid var(--ink)`, `border-radius: 999px`
- Current: amber fill `var(--amber)`, white text
- Done: `var(--surface)` fill, filled dot
- Mobile: horizontal scroll, no wrapping

---

## Mobile Layout

- `min-height: 100dvh` (not 100vh — handles browser chrome)
- `overscroll-behavior: contain` — no pull-to-refresh
- `touch-action: manipulation` — removes 300ms tap delay
- Shell padding: `14px 14px 100px` (bottom for fixed nav bar)
- Card: `position: relative`, `height: auto`, `min-height: 380px`
- Background deck cards hidden on mobile
- **Fixed bottom nav bar**: `position: fixed; bottom: 0; left: 0; right: 0`
  - Back circle (52px) + full-width Continue button
  - `padding-bottom: calc(12px + env(safe-area-inset-bottom))` for iPhone safe area
  - White background, top border + shadow: `0 -6px 24px rgba(26,23,20,0.07)`

---

## Animations

All use `cubic-bezier(0.16, 1, 0.3, 1)` spring easing unless noted.

| Name | Trigger | Duration |
|------|---------|----------|
| `slideR` / `slideL` | Card advance/back | 0.32s |
| `chipIn` | Chip entrance (staggered) | 0.22s |
| `confirmIn` | Confirmation screen | 0.5s |
| `iconPop` | Confirmation checkmark | 0.6s |
| `stripeShift` | Progress bar stripes | 1.4s linear loop |
| `rippleOut` | Continue button tap | 0.5s linear |

Respects `prefers-reduced-motion: reduce` — all animations disabled.

---

## Confirmation Screen

- Centered, full-height flex column
- Icon: 80×80px circle, `var(--amber-soft)` bg, amber border, 36px emoji
- Title: Fraunces 40px
- Staggered entrance: title → sub → phone, each 0.1s later
- Phone number: 22px, `var(--amber-deep)`, bold

---

## Tone & Language

- Conversational, first-person ("What are we helping with?", "Where are we picking up?")
- Short questions — no corporate language
- Helper text is brief and reassuring
- "Skip" not "Skip this question"
- Error messages are direct: "Please enter your first and last name."

---

## Key Architecture Notes

- Standalone HTML — no build step, no framework
- Supabase REST API via raw `fetch` (anon key, INSERT only via RLS)
- Submit pattern: POST form data first → show confirmation immediately → upload photos in parallel background → PATCH record with URLs
- All fetch calls use `keepalive: true` (prevents iOS Safari throttling)
- Photo files stored in `S.photoFiles['photos']`, uploaded to `quote-photos` Supabase Storage bucket
- Security: CSP meta tag, honeypot field, client-side rate limit, server-side RLS rate limit, HTML stripping, enum allowlisting
