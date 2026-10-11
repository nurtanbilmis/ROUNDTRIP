/**
 * Jupiter API proxy, shared by the Express server (server.ts) and the Vercel
 * function (api/jup.ts).
 *
 * The browser calls /api/jup?p=<endpoint>&<params>; this code adds the private
 * JUP_API_KEY and forwards to Jupiter, so the key never reaches the browser.
 *
 * Read-only endpoints are cached so all users share one upstream request:
 * - in memory on this instance (works on any Node host), and
 * - on the CDN via Cache-Control s-maxage (Vercel caches by full URL).
 */
import { createRateLimiter } from './rateLimit.js';

const DEFAULT_JUP_BASE = 'https://api.jup.ag';

interface EndpointRule {
  method: 'GET' | 'POST';
  /** Seconds the response may be shared between users; 0 = never cache */
  cacheSeconds: number;
}

/** Only the Jupiter endpoints the app uses. */
export const JUP_ENDPOINTS: Record<string, EndpointRule> = {
  'price/v3': { method: 'GET', cacheSeconds: 20 },
  'tokens/v2/tag': { method: 'GET', cacheSeconds: 3600 },
  'tokens/v2/search': { method: 'GET', cacheSeconds: 300 },
  'swap/v1/quote': { method: 'GET', cacheSeconds: 0 },
  'swap/v1/swap': { method: 'POST', cacheSeconds: 0 },
};

// Quotes and swaps are per user and never cached, so they get the tighter budget.
const allow = createRateLimiter(90, 10_000);

const memoryCache = new Map<string, { expiresAt: number; status: number; body: string }>();
const MAX_CACHE_ENTRIES = 500;

export interface JupProxyResult {
  status: number;
  body: string;
  headers: Record<string, string>;
}

function jsonError(status: number, message: string): JupProxyResult {
  return {
    status,
    body: JSON.stringify({ error: message }),
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  };
}

export function getJupApiKey(env: Record<string, string | undefined>): string | undefined {
  return env.JUP_API_KEY || undefined;
}

/** Upstream base URL. JUP_API_BASE_URL can override it (tests, self-hosted mirrors). */
export function getJupBase(env: Record<string, string | undefined>): string {
  return (env.JUP_API_BASE_URL || DEFAULT_JUP_BASE).replace(/\/$/, '');
}

/**
 * @param method   HTTP method of the incoming request
 * @param search   the incoming query string, e.g. "?p=price/v3&ids=a,b"
 * @param body     raw request body (POST only)
 */
export async function handleJupRequest(
  method: string,
  search: string,
  body: string | null,
  clientIp: string,
  apiKey: string | undefined,
  base: string = DEFAULT_JUP_BASE
): Promise<JupProxyResult> {
  const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const endpoint = params.get('p') || '';
  params.delete('p');

  const rule = JUP_ENDPOINTS[endpoint];
  if (!rule) return jsonError(404, `Unknown Jupiter endpoint: ${endpoint || '(none)'}`);
  if (method !== rule.method) return jsonError(405, `Use ${rule.method} for ${endpoint}`);

  const upstreamUrl = `${base}/${endpoint}${params.toString() ? `?${params.toString()}` : ''}`;
  const cacheHeaders: Record<string, string> =
    rule.cacheSeconds > 0
      ? { 'Cache-Control': `public, max-age=0, s-maxage=${rule.cacheSeconds}, stale-while-revalidate=${rule.cacheSeconds * 2}` }
      : { 'Cache-Control': 'no-store' };

  // Serve shared read-only data from memory first: no upstream call, no rate-limit cost
  if (rule.cacheSeconds > 0) {
    const hit = memoryCache.get(upstreamUrl);
    if (hit && hit.expiresAt > Date.now()) {
      return { status: hit.status, body: hit.body, headers: { 'Content-Type': 'application/json', ...cacheHeaders } };
    }
  }

  if (!allow(clientIp)) return jsonError(429, 'Too many requests');

  const headers: Record<string, string> = {};
  if (apiKey) headers['x-api-key'] = apiKey;
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers,
      body: method === 'POST' ? body ?? '' : undefined,
    });
    const text = await upstream.text();

    if (upstream.ok && rule.cacheSeconds > 0) {
      if (memoryCache.size >= MAX_CACHE_ENTRIES) {
        const now = Date.now();
        for (const [k, v] of memoryCache) if (v.expiresAt <= now) memoryCache.delete(k);
        if (memoryCache.size >= MAX_CACHE_ENTRIES) memoryCache.clear();
      }
      memoryCache.set(upstreamUrl, { expiresAt: Date.now() + rule.cacheSeconds * 1000, status: upstream.status, body: text });
    }

    return {
      status: upstream.status,
      body: text,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'application/json',
        // Never let a CDN keep an error response
        ...(upstream.ok ? cacheHeaders : { 'Cache-Control': 'no-store' }),
      },
    };
  } catch {
    return jsonError(502, 'Jupiter request failed');
  }
}

/**
 * Live self-test for GET /api/jup?check=1: fetches the SOL price through Jupiter with the
 * configured key and reports the outcome. Never shows the key.
 */
export async function jupiterCheck(env: Record<string, string | undefined>): Promise<string> {
  const key = getJupApiKey(env);
  const SOL = 'So11111111111111111111111111111111111111112';
  const started = Date.now();
  try {
    const res = await fetch(`${getJupBase(env)}/price/v3?ids=${SOL}`, { headers: key ? { 'x-api-key': key } : {} });
    const text = await res.text();
    let price: unknown = null;
    try {
      price = JSON.parse(text)?.[SOL]?.usdPrice ?? null;
    } catch {
      // not JSON
    }
    const safe = key ? text.split(key).join('[key]') : text;
    return JSON.stringify({
      check: 'jupiter',
      ok: res.ok && price != null,
      keyConfigured: Boolean(key),
      upstreamStatus: res.status,
      solPriceUsd: price,
      ms: Date.now() - started,
      upstreamSaid: price != null ? undefined : safe.slice(0, 300),
    });
  } catch (err: any) {
    return JSON.stringify({ check: 'jupiter', ok: false, keyConfigured: Boolean(key), problem: 'Could not reach Jupiter', error: String(err?.message || err) });
  }
}
