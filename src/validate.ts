/**
 * URL scheme validation to avoid SSRF (only allow intended protocols).
 * Config comes from openclaw.json; validation prevents typos or misuse.
 */

/** Allowed WebSocket schemes. */
const WS_SCHEMES = new Set(["ws:", "wss:"]);
/** Allowed HTTP schemes for API. */
const HTTP_SCHEMES = new Set(["http:", "https:"]);

export function isAllowedWsUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return WS_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}

export function isAllowedHttpUrl(url: string): boolean {
  try {
    const u = new URL(url.trim());
    return HTTP_SCHEMES.has(u.protocol);
  } catch {
    return false;
  }
}
