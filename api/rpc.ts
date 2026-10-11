/**
 * Vercel serverless function for /api/rpc.
 * Same behaviour as the Express route in server.ts (see lib/rpcProxy.ts).
 * Set RPC_UPSTREAM_URL in the Vercel project's Environment Variables.
 */
import { clientIpFrom, getUpstreamUrl, handleRpcRequest, healthInfo } from '../lib/rpcProxy.js';

const MAX_BODY_BYTES = 1_000_000;

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return new Response(
      JSON.stringify({ jsonrpc: '2.0', error: { code: -32600, message: 'Request too large' }, id: null }),
      { status: 413, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: unknown = null;
  try {
    body = JSON.parse(raw);
  } catch {
    // handleRpcRequest answers invalid bodies with a JSON-RPC error
  }

  const clientIp = clientIpFrom(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip'));
  const result = await handleRpcRequest(body, clientIp, getUpstreamUrl(process.env));

  return new Response(result.body, {
    status: result.status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

export function GET(): Response {
  return new Response(healthInfo(process.env), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
