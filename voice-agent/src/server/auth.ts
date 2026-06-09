import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getTenant, getTenantByApiKey, listTenants, Tenant } from '../db/index.js';

/**
 * Principal attached to each /api request:
 *  - admin: platform operator (ADMIN_TOKEN). Manages tenants + sees everything.
 *  - tenant: a reseller sub-account. Authenticates via api_key (programmatic) or a
 *    JWT issued by the dashboard login. Auto-scoped to its own data.
 */
export type Principal = { type: 'admin' } | { type: 'tenant'; tenant: Tenant };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      principal?: Principal;
    }
  }
}

export function signTenantToken(tenant: Tenant): string {
  return jwt.sign({ sub: tenant.id, email: tenant.email }, config.jwtSecret, { expiresIn: '7d' });
}

async function resolvePrincipal(bearer: string): Promise<Principal | null> {
  if (!bearer) return null;
  if (config.adminToken && bearer === config.adminToken) return { type: 'admin' };

  if (bearer.startsWith('ova_')) {
    const tenant = await getTenantByApiKey(bearer);
    return tenant && tenant.status !== 'canceled' ? { type: 'tenant', tenant } : null;
  }

  // Otherwise treat as a tenant JWT.
  try {
    const payload = jwt.verify(bearer, config.jwtSecret) as { sub: string };
    const tenant = await getTenant(payload.sub);
    return tenant && tenant.status !== 'canceled' ? { type: 'tenant', tenant } : null;
  } catch {
    return null;
  }
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  // Dev convenience: with no admin token and no tenants, run open as admin.
  if (!config.adminToken && (await listTenants()).length === 0) {
    req.principal = { type: 'admin' };
    return next();
  }

  const principal = await resolvePrincipal(bearer);
  if (!principal) return res.status(401).json({ error: 'unauthorized' });
  req.principal = principal;
  next();
}

export const isAdmin = (req: Request) => req.principal?.type === 'admin';

/** The tenant id a request is scoped to. Admins may override via ?tenantId; tenants can't. */
export function scopedTenantId(req: Request): string | undefined {
  if (req.principal?.type === 'tenant') return req.principal.tenant.id;
  return (req.query.tenantId as string) || undefined;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (isAdmin(req)) return next();
  res.status(403).json({ error: 'admin only' });
}
