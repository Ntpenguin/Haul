/**
 * One-shot Stripe setup: creates the Product + a recurring base plan price + a metered
 * per-minute usage price, then prints the price IDs to drop into your .env.
 *
 *   STRIPE_SECRET_KEY=sk_... npm run stripe:setup
 *   # optional: BASE_PRICE_USD=99 METERED_PRICE_CENTS=15 PLAN_NAME="Pro"
 */
import Stripe from 'stripe';

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error('Set STRIPE_SECRET_KEY first.');
  process.exit(1);
}
const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' });

const PLAN_NAME = process.env.PLAN_NAME || 'OpenVoice Agent';
const BASE_USD = Number(process.env.BASE_PRICE_USD || 99);
const METERED_CENTS = Number(process.env.METERED_PRICE_CENTS || 15); // per call-minute

async function main() {
  const product = await stripe.products.create({
    name: PLAN_NAME,
    description: 'AI phone receptionist — base plan with included minutes + metered overage.',
  });
  console.log(`Product: ${product.id}`);

  const base = await stripe.prices.create({
    product: product.id,
    nickname: `${PLAN_NAME} base`,
    currency: 'usd',
    unit_amount: Math.round(BASE_USD * 100),
    recurring: { interval: 'month' },
  });

  const metered = await stripe.prices.create({
    product: product.id,
    nickname: `${PLAN_NAME} per-minute`,
    currency: 'usd',
    unit_amount: METERED_CENTS,
    recurring: { interval: 'month', usage_type: 'metered', aggregate_usage: 'sum' },
    billing_scheme: 'per_unit',
  });

  console.log('\nAdd these to your .env:\n');
  console.log(`STRIPE_PRICE_SUBSCRIPTION=${base.id}`);
  console.log(`STRIPE_PRICE_METERED=${metered.id}`);
  console.log(`\nBase: $${BASE_USD}/mo + $${(METERED_CENTS / 100).toFixed(2)}/min metered overage.`);
  console.log('Next: add a webhook endpoint at <PUBLIC_BASE_URL>/webhooks/stripe and set STRIPE_WEBHOOK_SECRET.');
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e.message || e);
    process.exit(1);
  });
