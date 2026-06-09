import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { getTenantByApiKey, listTenants, Tenant } from '../db/index.js';

/**
 * Principal attached to each /api request:
 *  - admin: platform operator (ADMIN_TOKEN). Sees/manages everything + tenants.
 *  - tenant: a reseller sub-account (its api_key). Auto-scoped to its own data.
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

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const bearer = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  // Dev convenience: with no admin token and no tenants, run open as admin.
  if (!config.adminToken && listTenants().length === 0) {
    req.principal = { type: 'admin' };
    return next();
  }

  if (config.adminToken && bearer === config.adminToken) {
    req.principal = { type: 'admin' };
    return next();
  }

  if (bearer) {
    const tenant = getTenantByApiKey(bearer);
    if (tenant && tenant.status === 'active') {
      req.principal = { type: 'tenant', tenant };
      return next();
    }
  }

  res.status(401).json({ error: 'unauthorized' });
}

export const isAdmin = (req: Request) => req.principal?.type === 'admin';

/** The tenant id a request is scoped to. Admins may override via ?tenantId; tenants can't. */
export function scopedTenantId(req: Request): string | undefined {
  if (req.principal?.type === 'tenant') return req.principal.tenant.id;
  return (req.query.tenantId as string) || undefined; // admin: optional filter
}

/** Guard for admin-only routes (tenant management). */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (isAdmin(req)) return next();
  res.status(403).json({ error: 'admin only' });
}
