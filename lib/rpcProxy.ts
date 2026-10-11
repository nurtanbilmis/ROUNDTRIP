/**
 * Solana JSON-RPC proxy logic, shared by the Express server (server.ts) and the
 * Vercel serverless function (api/rpc.ts).
 *
 * The browser calls our own /api/rpc route; this code forwards the request to the
 * private RPC provider using the server-side secret RPC_UPSTREAM_URL, so the paid
 * RPC URL never reaches the browser.
 */
import { createRateLimiter } from './rateLimit.js';

/** Only the methods the app actually uses. Anything else is rejected. */
export const ALLOWED_METHODS = new Set([
  'getBalance',
  'getTokenAccountsByOwner',
  'getAccountInfo',
  'getMultipleAccounts',
  'getLatestBlockhash',
  'getBlockHeight',
  'getSlot',
  'getEpochInfo',
  'sendTransaction',
  'simulateTransaction',
  'getSignatureStatuses',
  'getTransaction',
  'getMinimumBalanceForRentExemption',
  'getVersion',
  'getGenesisHash',
  'getFeeForMessage',
  'getRecentPrioritizationFees',
]);

// 120 requests per 10 seconds per IP (soft, per instance)
const checkRateLimit = createRateLimiter(120, 10_000);

export interface ProxyResult {
  status: number;
  /** JSON string to send back as the response body */
  body: string;
}

function rpcError(status: number, code: number, message: string, id: unknown = null): ProxyResult {
  return { status, body: JSON.stringify({ jsonrpc: '2.0', error: { code, message }, id }) };
}

/** Reads the upstream URL. TRITON_RPC_URL is accepted for existing deployments. */
export function getUpstreamUrl(env: Record<string, string | undefined>): string | undefined {
  return env.RPC_UPSTREAM_URL || env.TRITON_RPC_URL || undefined;
}

/**
 * The site address sent to the RPC provider as Origin/Referer.
 * Providers like Triton allow an endpoint by domain (a whitelist); a browser sends that
 * header itself, but a server call does not, so the provider would treat us as an unknown
 * cloud server. RPC_ORIGIN (e.g. https://roundtrip.grape.art) overrides; otherwise the
 * address of the site this request came in on is used.
 */
export function siteOrigin(env: Record<string, string | undefined>, requestUrl?: string | null): string | undefined {
  const explicit = env.RPC_ORIGIN?.trim();
  if (explicit) {
    try {
      return new URL(explicit).origin;
    } catch {
      // ignore a malformed override and fall back to the request
    }
  }
  if (!requestUrl) return undefined;
  try {
    return new URL(requestUrl).origin;
  } catch {
    return undefined;
  }
}

function upstreamHeaders(origin: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) {
    headers.Origin = origin;
    headers.Referer = origin + '/';
  }
  return headers;
}

/**
 * Validates and forwards one JSON-RPC request (object or batch array).
 * Never logs or returns the upstream URL.
 */
export async function handleRpcRequest(
  body: unknown,
  clientIp: string,
  upstreamUrl: string | undefined,
  origin?: string
): Promise<ProxyResult> {
  if (!checkRateLimit(clientIp)) {
    return rpcError(429, -32029, 'Too many requests');
  }

  if (!body || typeof body !== 'object') {
    return rpcError(400, -32600, 'Invalid Request');
  }

  const items: any[] = Array.isArray(body) ? body : [body];
  if (items.length === 0) {
    return rpcError(400, -32600, 'Invalid Request: empty batch');
  }
  for (const item of items) {
    if (!item || typeof item !== 'object' || !ALLOWED_METHODS.has(item.method)) {
      return rpcError(403, -32601, `Method not allowed: ${item?.method || 'unknown'}`, item?.id ?? null);
    }
  }

  const singleId = Array.isArray(body) ? null : (body as any).id ?? null;

  if (!upstreamUrl) {
    return rpcError(503, -32603, 'RPC not configured', singleId);
  }

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'POST',
      headers: upstreamHeaders(origin),
      body: JSON.stringify(body),
    });
    return { status: upstreamRes.status, body: await upstreamRes.text() };
  } catch {
    return rpcError(502, -32603, 'Internal RPC forwarding error', singleId);
  }
}

/** First address in X-Forwarded-For, else the fallback. */
export function clientIpFrom(forwardedFor: string | null | undefined, fallback?: string | null): string {
  return forwardedFor?.split(',')[0]?.trim() || fallback || 'unknown';
}

/**
 * Health check for GET /api/rpc and GET /api/jup: shows whether the routes are deployed and configured,
 * without revealing any secret. Open https://<your-site>/api/rpc in a browser.
 */
export function healthInfo(env: Record<string, string | undefined>): string {
  return JSON.stringify({
    ok: true,
    rpcUpstreamConfigured: Boolean(getUpstreamUrl(env)),
    jupiterKeyConfigured: Boolean(env.JUP_API_KEY),
    rpcOrigin: siteOrigin(env) ?? 'this site',
    publicRpcFallback: Boolean(env.VITE_PUBLIC_RPC_URL),
    note: 'Shows only whether each key is set; values are never shown.',
  });
}

/** Removes the secret upstream URL (and its path) from any text before it is shown. */
function redact(text: string, secret: string | undefined): string {
  if (!secret) return text;
  let out = text.split(secret).join('[upstream]');
  try {
    const u = new URL(secret);
    for (const part of [u.host, ...u.pathname.split('/'), ...u.searchParams.values()]) {
      if (part && part.length >= 6) out = out.split(part).join('[redacted]');
    }
  } catch {
    // not a URL: nothing more to strip
  }
  return out;
}

/**
 * Live self-test for GET /api/rpc?check=1: sends one real getSlot request upstream and
 * reports what came back, so a deploy can be verified from a browser. Never shows the URL.
 */
export async function upstreamCheck(env: Record<string, string | undefined>, origin?: string): Promise<string> {
  const upstream = getUpstreamUrl(env);
  if (!upstream) return JSON.stringify({ check: 'rpc', ok: false, problem: 'RPC_UPSTREAM_URL is not set' });

  let parsedOk = true;
  try {
    const u = new URL(upstream.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') parsedOk = false;
  } catch {
    parsedOk = false;
  }
  if (!parsedOk) {
    return JSON.stringify({ check: 'rpc', ok: false, problem: 'RPC_UPSTREAM_URL is not a valid http(s) URL. Check for spaces, quotes or a missing https://' });
  }
  if (upstream !== upstream.trim()) {
    return JSON.stringify({ check: 'rpc', ok: false, problem: 'RPC_UPSTREAM_URL has leading or trailing spaces' });
  }

  const started = Date.now();
  try {
    const res = await fetch(upstream, {
      method: 'POST',
      headers: upstreamHeaders(origin),
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
    });
    const text = await res.text();
    let slot: unknown = null;
    try {
      slot = JSON.parse(text)?.result ?? null;
    } catch {
      // not JSON
    }
    return JSON.stringify({
      check: 'rpc',
      ok: res.ok && typeof slot === 'number',
      upstreamStatus: res.status,
      sentOrigin: origin ?? null,
      slot,
      ms: Date.now() - started,
      upstreamSaid: typeof slot === 'number' ? undefined : redact(text, upstream).slice(0, 300),
    });
  } catch (err: any) {
    return JSON.stringify({ check: 'rpc', ok: false, problem: 'Could not reach the RPC', error: redact(String(err?.cause?.message || err?.message || err), upstream) });
  }
}
