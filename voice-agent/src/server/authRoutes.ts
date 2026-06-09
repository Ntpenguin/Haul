import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { createTenant, getTenantByEmail } from '../db/index.js';
import { signTenantToken } from './auth.js';
import { logger } from '../logger.js';

const log = logger('auth-routes');

/** Public, unauthenticated routes: tenant self-serve signup + login. */
export const authRouter = Router();

const Signup = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});

authRouter.post('/signup', async (req, res) => {
  const parsed = Signup.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input', detail: parsed.error.flatten().fieldErrors });
  const { name, email, password } = parsed.data;

  if (await getTenantByEmail(email)) return res.status(409).json({ error: 'email already registered' });

  const password_hash = await bcrypt.hash(password, 12);
  // New tenants start active on a small trial limit; gate real usage behind Stripe
  // by setting their plan/limit, or flip status to 'suspended' until checkout completes.
  const tenant = await createTenant({ name, email, password_hash });
  log.info(`tenant signup ${email} (${tenant.id})`);

  const token = signTenantToken(tenant);
  res.status(201).json({ token, tenant: publicTenant(tenant) });
});

const Login = z.object({ email: z.string().email(), password: z.string().min(1) });

authRouter.post('/login', async (req, res) => {
  const parsed = Login.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'invalid input' });
  const { email, password } = parsed.data;

  const tenant = await getTenantByEmail(email);
  if (!tenant || !tenant.password_hash || !(await bcrypt.compare(password, tenant.password_hash))) {
    return res.status(401).json({ error: 'invalid credentials' });
  }
  const token = signTenantToken(tenant);
  res.json({ token, tenant: publicTenant(tenant) });
});

/** Never leak password_hash / api_key over login responses. */
function publicTenant(t: any) {
  return {
    id: t.id,
    name: t.name,
    email: t.email,
    status: t.status,
    plan: t.plan,
    monthly_minute_limit: t.monthly_minute_limit,
    api_key: t.api_key,
  };
}
