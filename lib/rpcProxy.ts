/**
 * Solana JSON-RPC proxy logic, shared by the Express server (server.ts) and the
 * Vercel serverless function (api/rpc.ts).
 *
 * The browser calls our own /api/rpc route; this code forwards the request to the
 * private RPC provider using the server-side secret RPC_UPSTREAM_URL, so the paid
 * RPC URL never reaches the browser.
 */

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

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10_000;

// In-memory, per-instance rate limit. On serverless hosts each instance keeps its own
// counters, so this is a soft limit that stops casual abuse, not a hard guarantee.
const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();

  // Opportunistic cleanup so the map cannot grow without bound
  if (ipRateLimits.size > 10_000) {
    for (const [key, record] of ipRateLimits) {
      if (now > record.resetAt) ipRateLimits.delete(key);
    }
  }

  const record = ipRateLimits.get(ip);
  if (!record || now > record.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (record.count >= RATE_LIMIT_MAX) return false;
  record.count += 1;
  return true;
}

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
 * Validates and forwards one JSON-RPC request (object or batch array).
 * Never logs or returns the upstream URL.
 */
export async function handleRpcRequest(
  body: unknown,
  clientIp: string,
  upstreamUrl: string | undefined
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
      headers: { 'Content-Type': 'application/json' },
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
