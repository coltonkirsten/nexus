/**
 * Nexus access token — issued by the raven-hub ONLY to a browser that already
 * passed the dashboard's Google auth (same-origin GET /raven/api/nexus-token,
 * authed by the raven_session cookie). The Nexus API is publicly reachable via
 * Tailscale Funnel and returns 401 without this token, so fetching it here is
 * what makes "public API" actually mean "gated by the dashboard's Google login".
 *
 * The token is threaded onto every Nexus API call:
 *   - REST:            Authorization: Bearer <token>   (axios interceptors)
 *   - WebSocket / SSE: ?token=<token>                  (query param — browsers
 *                      cannot set headers on EventSource/WebSocket)
 */

import type { AxiosInstance } from 'axios';

let cachedToken: string | null = null;

// Local-dev escape hatch: when the SPA runs outside the hub (e.g. `npm run dev`
// at localhost:5173) there is no same-origin hub to mint a token. Set
// VITE_NEXUS_TOKEN in dashboard/.env to talk to a token-gated API in dev.
const DEV_TOKEN: string = ((import.meta.env.VITE_NEXUS_TOKEN as string) || '').trim();

/**
 * Resolve the hub token endpoint relative to the SPA's base path. In production
 * BASE_URL is '/raven/nexus/', so '../api/nexus-token' resolves to
 * '/raven/api/nexus-token' on the same origin (coltonkirsten.com). Behind any
 * other prefix it still resolves correctly.
 */
function hubTokenUrl(): string {
  const base = import.meta.env.BASE_URL || '/';
  return new URL('../api/nexus-token', window.location.origin + base).toString();
}

/**
 * Fetch + cache the token once at app boot (call before the first API request).
 * Never throws: on failure the token stays null and API calls will 401, which
 * the UI surfaces as "not authenticated" rather than crashing.
 */
export async function initNexusToken(): Promise<void> {
  if (DEV_TOKEN) {
    cachedToken = DEV_TOKEN;
    return;
  }
  try {
    const res = await fetch(hubTokenUrl(), { credentials: 'include' });
    if (res.ok) {
      const data = (await res.json()) as { token?: string };
      cachedToken = data.token || null;
    } else {
      cachedToken = null;
    }
  } catch {
    cachedToken = null;
  }
}

/** The cached token (sync). Available after initNexusToken() resolves. */
export function getNexusToken(): string | null {
  return cachedToken;
}

/** Authorization header object for REST/fetch (empty when no token yet). */
export function authHeaders(): Record<string, string> {
  return cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {};
}

/** Append ?token= to a URL for transports that can't carry headers (WS, SSE, <img>). */
export function withToken(url: string): string {
  if (!cachedToken) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}token=${encodeURIComponent(cachedToken)}`;
}

/**
 * Attach a request interceptor to an axios instance that injects the Nexus
 * access token as a Bearer header on every request. Handles both AxiosHeaders
 * (v1) and plain-object header shapes.
 */
export function attachTokenInterceptor(instance: AxiosInstance): void {
  instance.interceptors.request.use((config) => {
    if (cachedToken) {
      const h = config.headers as unknown as { set?: (k: string, v: string) => void };
      if (h && typeof h.set === 'function') {
        h.set('Authorization', `Bearer ${cachedToken}`);
      } else {
        (config as { headers: Record<string, string> }).headers = {
          ...((config.headers as unknown as Record<string, string>) || {}),
          Authorization: `Bearer ${cachedToken}`,
        };
      }
    }
    return config;
  });
}
