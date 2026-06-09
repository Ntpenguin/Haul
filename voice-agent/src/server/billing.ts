import Stripe from 'stripe';
import { config } from '../config.js';
import { logger } from '../logger.js';
import {
  Tenant,
  getTenantByStripeCustomer,
  updateTenant,
  listTenants,
  unbilledCalls,
  markBilled,
} from '../db/index.js';

const log = logger('billing');

export const stripe = config.stripe.enabled
  ? new Stripe(config.stripe.secretKey, { apiVersion: '2025-02-24.acacia' })
  : null;

/** Create (or reuse) a Stripe customer and a Checkout subscription session for a tenant. */
export async function createCheckoutSession(tenant: Tenant): Promise<string | null> {
  if (!stripe || !config.stripe.priceSubscription) return null;

  let customerId = tenant.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: tenant.email ?? undefined,
      name: tenant.name,
      metadata: { tenant_id: tenant.id },
    });
    customerId = customer.id;
    await updateTenant(tenant.id, { stripe_customer_id: customerId });
  }

  const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
    { price: config.stripe.priceSubscription, quantity: 1 },
  ];
  // Metered per-minute overage price (optional).
  if (config.stripe.priceMetered) lineItems.push({ price: config.stripe.priceMetered });

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: lineItems,
    success_url: `${config.publicBaseUrl}/?billing=success`,
    cancel_url: `${config.publicBaseUrl}/?billing=cancel`,
    metadata: { tenant_id: tenant.id },
  });
  return session.url;
}

/** Stripe webhook → keep tenant.status in sync with subscription/payment state. */
export async function handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
  if (!stripe) return;
  const event = stripe.webhooks.constructEvent(rawBody, signature, config.stripe.webhookSecret);
  log.info(`stripe event ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as Stripe.Checkout.Session;
      const tenantId = s.metadata?.tenant_id;
      if (tenantId) await updateTenant(tenantId, { status: 'active', stripe_subscription_id: s.subscription as string });
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      const tenant = await getTenantByStripeCustomer(sub.customer as string);
      if (!tenant) break;
      const status =
        sub.status === 'active' || sub.status === 'trialing'
          ? 'active'
          : sub.status === 'past_due' || sub.status === 'unpaid'
            ? 'past_due'
            : 'canceled';
      await updateTenant(tenant.id, { status, stripe_subscription_id: sub.id });
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const tenant = await getTenantByStripeCustomer(inv.customer as string);
      if (tenant) await updateTenant(tenant.id, { status: 'past_due' });
      break;
    }
  }
}

/**
 * Report unbilled call minutes to Stripe metered billing for every tenant.
 * Call on an interval (see index.ts). No-ops unless a metered price is configured.
 */
export async function reportUsageToStripe(): Promise<void> {
  if (!stripe || !config.stripe.priceMetered) return;
  for (const tenant of await listTenants()) {
    if (!tenant.stripe_subscription_id) continue;
    const calls = await unbilledCalls(tenant.id);
    const seconds = calls.reduce((s, c: any) => s + (c.duration_sec || 0), 0);
    if (seconds <= 0) {
      if (calls.length) await markBilled(calls.map((c: any) => c.id));
      continue;
    }
    try {
      const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
      const item = sub.items.data.find((i) => i.price.id === config.stripe.priceMetered);
      if (!item) continue;
      const minutes = Math.ceil(seconds / 60);
      await stripe.subscriptionItems.createUsageRecord(item.id, {
        quantity: minutes,
        timestamp: Math.floor(Date.now() / 1000),
        action: 'increment',
      });
      await markBilled(calls.map((c: any) => c.id));
      log.info(`reported ${minutes} min usage for tenant ${tenant.id}`);
    } catch (e) {
      log.error(`usage report failed for tenant ${tenant.id}`, e);
    }
  }
}
