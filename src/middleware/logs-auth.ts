import { createHash, timingSafeEqual } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

/**
 * Timing-safe string comparison. Hashing both inputs to a fixed-length
 * digest first avoids leaking length information via `timingSafeEqual`'s
 * requirement that both buffers be the same length (a naive `Buffer.from`
 * comparison would short-circuit on length mismatch before ever reaching
 * `timingSafeEqual`, itself a timing side-channel).
 */
function safeCompare(a: string, b: string): boolean {
  const aHash = createHash('sha256').update(a).digest();
  const bHash = createHash('sha256').update(b).digest();
  return timingSafeEqual(aHash, bHash);
}

function extractToken(req: Request): string | undefined {
  const authHeader = req.header('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length);
  }

  const queryToken = req.query['token'];
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }

  return undefined;
}

/**
 * Guards `/logs` behind a shared secret (`LOGS_ACCESS_TOKEN`). The token can
 * be supplied as `Authorization: Bearer <token>` or as a `?token=` query
 * string param (so the page is still viewable directly in a browser).
 * Failures return a generic 401 without indicating whether the token was
 * missing or simply wrong.
 */
export function logsAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);

  if (!token || !safeCompare(token, env.LOGS_ACCESS_TOKEN)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
