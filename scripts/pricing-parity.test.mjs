#!/usr/bin/env node
// Pricing parity check: does create-quote-payment's server-side recompute produce
// the EXACT total the customer saw on the intake form (landing/intake.html)?
//
// A mismatch is a billing bug — the customer would be charged a different amount
// than was displayed. This runs the real intake calcQuote() (the "oracle") and the
// edge function's computeQuoteTotalCents() (the "subject"), feeding the subject via
// the same buildPayload column-mapping the intake uses, across many scenarios.
//
// No credentials, no network, no Stripe. Run: node scripts/pricing-parity.test.mjs

// ── Constants (identical in both implementations) ────────────────────────────
const BASE_PRICES = { 'Single item': 9375, 'Just a few items': 17500, 'Small move': 25000, 'Studio': 35000, '1 BR': 50000, '2 BR': 80000, '3 BR': 135000, '4+ BR / full house': 160000 };
const STAIRS_SURCHARGE = 5000, ELEVATOR_SURCHARGE = 4000, LONG_CARRY = 5000, TAX = 0.0825;
const HEAVY_PRICES = { 'Piano': 25000, 'Safe / gun safe': 15000, 'Pool table': 30000, 'Treadmill / Peloton': 7500, 'Big TV (65"+)': 7500, 'Aquarium': 7500, 'Artwork / mirror': 7500 };
const PREP_SURCHARGES = { 'Disassemble bed frame(s)': 5000, 'Take apart shelving': 2500 };
const DISTANCE_FREE_MILES = 15, DISTANCE_PER_MILE = 125, LONG_DISTANCE_MULTIPLIER = 1.5, LONG_DISTANCE_THRESHOLD = 50;
const STAGING_PCT = 0.30, PACKING_PCT = 0.35;
const HEAVY_COMMON_FEE = 7500, HEAVY_COMMON_ATTR = 'Heavy (250lb+)';
const heavyCommonFrom = (cAttrs) => Object.values(cAttrs || {}).reduce((s, a) => s + (Number(a?.[HEAVY_COMMON_ATTR]) || 0), 0) * HEAVY_COMMON_FEE;
const hasStairs = (lbl) => lbl === 'Stairs' || lbl === 'Both';
const hasElevator = (lbl) => lbl === 'Elevator' || lbl === 'Both';

function haversine(lat1, lng1, lat2, lng2) {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── ORACLE: intake calcQuote() ported verbatim from landing/intake.html ──────
function intakeCalc(s) {
  if (!BASE_PRICES[s.size]) return null;
  const base = BASE_PRICES[s.size];
  const flightsFrom = hasStairs(s.stairs_p) ? Math.max(1, s.flights_p || 1) : 0;
  const flightsTo = hasStairs(s.stairs_d) ? Math.max(1, s.flights_d || 1) : 0;
  const longCarry = (s.parking || '').includes('100+');
  const stairsCents = (flightsFrom + flightsTo) * STAIRS_SURCHARGE;
  const elevatorCents = ((hasElevator(s.stairs_p) ? 1 : 0) + (hasElevator(s.stairs_d) ? 1 : 0)) * ELEVATOR_SURCHARGE;
  const carryCents = longCarry ? LONG_CARRY : 0;
  const specialEntries = Object.entries(s.special || {}).filter(([k]) => k !== 'Nope — just regular stuff');
  const heavyCents = specialEntries.reduce((a, [k, q]) => a + (HEAVY_PRICES[k] || 7500) * q, 0);
  const miles = s.coords ? Math.round(haversine(...s.coords)) : null;
  const distanceCents = (miles && miles > DISTANCE_FREE_MILES) ? (miles - DISTANCE_FREE_MILES) * DISTANCE_PER_MILE : 0;
  const isLong = s.service === 'Long distance' || (miles != null && miles >= LONG_DISTANCE_THRESHOLD);
  const adjustedBase = base * (isLong ? LONG_DISTANCE_MULTIPLIER : 1);
  const stagingCents = s.staging ? Math.round(adjustedBase * STAGING_PCT) : 0;
  const needsPacking = s.boxed === 'Not yet' && s.packing !== false;
  const packingCents = needsPacking ? Math.round(adjustedBase * PACKING_PCT) : 0;
  const prepCents = (Array.isArray(s.prep) ? s.prep : []).reduce((a, p) => a + (PREP_SURCHARGES[p] || 0), 0);
  const heavyCommonCents = heavyCommonFrom(s.commonAttrs);
  const subtotal = Math.round(adjustedBase + stairsCents + elevatorCents + carryCents + heavyCents + distanceCents + stagingCents + packingCents + prepCents + heavyCommonCents);
  return subtotal + Math.round(subtotal * TAX);
}

// ── buildPayload mapping (scenario -> quote_requests row), per intake.html ────
function toRow(s) {
  const special_items = [];
  for (const [k, q] of Object.entries(s.special || {})) if (k !== 'Nope — just regular stuff') for (let i = 0; i < q; i++) special_items.push(k);
  return {
    items_size: s.size,
    service_type: s.service || null,
    stairs_pickup: s.stairs_p || null,
    stairs_dropoff: s.stairs_d || null,
    flights_pickup: hasStairs(s.stairs_p) ? Math.min(Math.max(1, s.flights_p || 1), 20) : null,
    flights_dropoff: hasStairs(s.stairs_d) ? Math.min(Math.max(1, s.flights_d || 1), 20) : null,
    parking: s.parking || null,
    special_items,
    staging: !!s.staging,
    packing_service: s.boxed === 'Not yet' ? (s.packing !== false) : false,
    prep_needed: Array.isArray(s.prep) ? s.prep : [],
    common_item_details: s.commonAttrs || {},
    answers: s.coords ? { addresses: { pickup: { lat: s.coords[0], lng: s.coords[1] }, dropoff: { lat: s.coords[2], lng: s.coords[3] } } } : {},
  };
}

// ── SUBJECT: computeQuoteTotalCents() ported verbatim from the edge function ──
function serverCalc(q) {
  if (!BASE_PRICES[q.items_size]) return null;
  const base = BASE_PRICES[q.items_size];
  const flightsFrom = hasStairs(q.stairs_pickup) ? Math.max(1, q.flights_pickup || 1) : 0;
  const flightsTo = hasStairs(q.stairs_dropoff) ? Math.max(1, q.flights_dropoff || 1) : 0;
  const stairsCents = (flightsFrom + flightsTo) * STAIRS_SURCHARGE;
  const elevatorCents = ((hasElevator(q.stairs_pickup) ? 1 : 0) + (hasElevator(q.stairs_dropoff) ? 1 : 0)) * ELEVATOR_SURCHARGE;
  const carryCents = (q.parking || '').includes('100+') ? LONG_CARRY : 0;
  const special = Array.isArray(q.special_items) ? q.special_items : [];
  const heavyCents = special.filter((k) => k && k !== 'Nope — just regular stuff').reduce((sgg, k) => sgg + (HEAVY_PRICES[k] || 7500), 0);
  const addr = q.answers?.addresses || {};
  const pu = addr.pickup, dr = addr.dropoff;
  let miles = null;
  if (pu?.lat != null && pu?.lng != null && dr?.lat != null && dr?.lng != null) miles = Math.round(haversine(pu.lat, pu.lng, dr.lat, dr.lng));
  const distanceCents = (miles && miles > DISTANCE_FREE_MILES) ? (miles - DISTANCE_FREE_MILES) * DISTANCE_PER_MILE : 0;
  const isLong = q.service_type === 'Long distance' || (miles != null && miles >= LONG_DISTANCE_THRESHOLD);
  const adjustedBase = base * (isLong ? LONG_DISTANCE_MULTIPLIER : 1);
  const stagingCents = q.staging ? Math.round(adjustedBase * STAGING_PCT) : 0;
  const packingCents = q.packing_service ? Math.round(adjustedBase * PACKING_PCT) : 0;
  const prepCents = (Array.isArray(q.prep_needed) ? q.prep_needed : []).reduce((a, p) => a + (PREP_SURCHARGES[p] || 0), 0);
  const heavyCommonCents = heavyCommonFrom(q.common_item_details);
  const subtotal = Math.round(adjustedBase + stairsCents + elevatorCents + carryCents + heavyCents + distanceCents + stagingCents + packingCents + prepCents + heavyCommonCents);
  return subtotal + Math.round(subtotal * TAX);
}

const AUS = [30.2649, -97.7470], HOU = [29.7604, -95.3698], RRK = [30.5083, -97.6789], NEAR = [30.2700, -97.7500];
const scenarios = [
  { name: 'Single item, nothing', size: 'Single item' },
  { name: 'Small move, nothing', size: 'Small move' },
  { name: 'Small move, stairs(1) + packing', size: 'Small move', stairs_p: 'Stairs', flights_p: 1, boxed: 'Not yet' },
  { name: 'Single item, stairs both + elevator', size: 'Single item', stairs_p: 'Stairs', flights_p: 1, stairs_d: 'Elevator' },
  { name: 'Studio, nothing', size: 'Studio' },
  { name: 'Just a few items', size: 'Just a few items' },
  { name: '4+ BR, nothing', size: '4+ BR / full house' },
  { name: '1 BR, stairs both ends (2+1 flights) + elevator at drop (Both)', size: '1 BR', stairs_p: 'Stairs', flights_p: 2, stairs_d: 'Both', flights_d: 1 },
  { name: '2 BR, elevator at pickup only', size: '2 BR', stairs_p: 'Elevator' },
  { name: '2 BR, elevator both ends', size: '2 BR', stairs_p: 'Elevator', stairs_d: 'Elevator' },
  { name: '2 BR, piano + 2 big TVs', size: '2 BR', special: { 'Piano': 1, 'Big TV (65"+)': 2 } },
  { name: '3 BR, 3 unknown specials (default $75)', size: '3 BR', special: { 'Couch': 3 } },
  { name: '1 BR, long carry', size: '1 BR', parking: '100+ ft from door' },
  { name: 'Studio, staging', size: 'Studio', staging: true },
  { name: '1 BR, packing (boxed=Not yet, default on)', size: '1 BR', boxed: 'Not yet' },
  { name: '1 BR, boxed=Not yet but packing declined', size: '1 BR', boxed: 'Not yet', packing: false },
  { name: '2 BR, manual long distance (no coords)', size: '2 BR', service: 'Long distance' },
  { name: '1 BR, AUS->HOU (~145mi auto long + distance)', size: '1 BR', coords: [...AUS, ...HOU] },
  { name: '1 BR, AUS->Round Rock (~17mi, distance only)', size: '1 BR', coords: [...AUS, ...RRK] },
  { name: '1 BR, AUS->near (<1mi, no distance)', size: '1 BR', coords: [...AUS, ...NEAR] },
  { name: 'KITCHEN SINK 4+BR long+stairs+special+staging+packing', size: '4+ BR / full house', coords: [...AUS, ...HOU], stairs_p: 'Stairs', flights_p: 3, stairs_d: 'Stairs', flights_d: 2, parking: '100+ ft', special: { 'Piano': 1, 'Hot tub?': 1 }, staging: true, boxed: 'Not yet' },
  { name: '1 BR, disassemble bed frame (+$50)', size: '1 BR', prep: ['Disassemble bed frame(s)'] },
  { name: '2 BR, bed frame + shelving disassembly (+$75)', size: '2 BR', prep: ['Disassemble bed frame(s)', 'Take apart shelving'] },
  { name: '1 BR, prep but only free options', size: '1 BR', prep: ['Wrap / pad furniture', 'Unmount TV'] },
  { name: '1 BR, 1 heavy common item (+$75)', size: '1 BR', commonAttrs: { 'Couch / sofa': { 'Heavy (250lb+)': 1 } } },
  { name: '2 BR, 3 heavy common items across 2 types (+$225)', size: '2 BR', commonAttrs: { 'Couch / sofa': { 'Heavy (250lb+)': 2 }, 'Dresser': { 'Heavy (250lb+)': 1 } } },
  { name: '1 BR, common attrs but none heavy (no charge)', size: '1 BR', commonAttrs: { 'Bed': { 'Needs disassembly': 1, 'Upstairs': 1 } } },
  { name: 'Studio, heavy common + stairs + packing stack', size: 'Studio', commonAttrs: { 'Washer / dryer': { 'Heavy (250lb+)': 2 } }, stairs_p: 'Stairs', flights_p: 1, boxed: 'Not yet' },
  { name: 'other / custom size (un-quotable)', size: 'other' },
];

let pass = 0, fail = 0;
console.log('\n=== Pricing parity: intake calcQuote() vs server computeQuoteTotalCents() ===\n');
for (const s of scenarios) {
  const expected = intakeCalc(s);
  const actual = serverCalc(toRow(s));
  const same = expected === actual;
  if (same) pass++; else fail++;
  const fmt = (c) => c == null ? 'null (manual quote)' : '$' + (c / 100).toFixed(2);
  console.log(`  ${same ? '✓' : '✗'} ${s.name}`);
  if (!same) console.log(`      intake=${fmt(expected)}  server=${fmt(actual)}`);
}
console.log(`\n=== ${pass} passed, ${fail} failed ===\n`);
process.exit(fail ? 1 : 0);
