import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Nexus access-token gate.
 *
 * The Nexus API is exposed to the public internet (Tailscale Funnel on :8443).
 * The ONLY thing standing between the internet and an agent console that can run
 * arbitrary code in Docker is this shared secret. It is issued to a browser ONLY
 * after the browser passed the dashboard's Google auth (hub GET /api/nexus-token
 * behind the raven_session cookie). No Google session -> no token -> 401 here.
 *
 * Transport of the token:
 *   - REST:            Authorization: Bearer <token>
 *   - WebSocket / SSE: ?token=<token>   (browsers cannot set headers on
 *                      EventSource or WebSocket, so it must ride the query string)
 *
 * The secret lives in the API's env (NEXUS_ACCESS_TOKEN), never in git.
 */

// Read the secret LAZILY at request time, not at module load. ES-module imports
// are hoisted and run before index.ts calls dotenv.config(), so reading
// process.env here at import time would see an empty value and fail closed
// (rejecting every request). A getter defers the read until after .env loaded.
function configuredToken(): string {
  return (process.env.NEXUS_ACCESS_TOKEN || '').trim();
}

let warnedMissing = false;
function warnIfMissing(): void {
  if (!warnedMissing && !configuredToken()) {
    warnedMissing = true;
    console.error(
      '[nexusAuth] NEXUS_ACCESS_TOKEN is not set — the API will reject ALL requests. ' +
        'Set it in the NEXUS root .env before exposing the API.'
    );
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

/** Pull the presented token from the Authorization header or the ?token= query. */
export function extractToken(req: Request): string | null {
  const authHeader = req.headers['authorization'];
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const t = authHeader.slice('Bearer '.length).trim();
    if (t) return t;
  }
  const q = (req.query && (req.query as Record<string, unknown>).token) as unknown;
  if (typeof q === 'string' && q) return q;
  return null;
}

/** Validate a raw token string (used by both the REST middleware and the WS gate). */
export function tokenValid(token: string | null | undefined): boolean {
  const configured = configuredToken();
  warnIfMissing();
  if (!configured) return false; // fail closed if misconfigured
  if (!token) return false;
  return timingSafeEqual(token, configured);
}

/** Validate a WebSocket upgrade URL's ?token= against the shared secret. */
export function wsTokenValid(requestUrl: string | undefined, port: string | number): boolean {
  try {
    const url = new URL(requestUrl || '', `http://localhost:${port}`);
    return tokenValid(url.searchParams.get('token'));
  } catch {
    return false;
  }
}

/** Express middleware: 401 unless a valid Nexus access token is presented. */
export function nexusAuth(req: Request, res: Response, next: NextFunction): void {
  if (tokenValid(extractToken(req))) {
    next();
    return;
  }
  res.status(401).json({
    error: 'unauthorized',
    message: 'Nexus access token required',
  });
}
