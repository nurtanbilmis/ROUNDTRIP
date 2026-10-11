/**
 * Vercel serverless function for /api/jup (Jupiter API proxy).
 * Same behaviour as the Express route in server.ts (see lib/jupProxy.ts).
 * Set JUP_API_KEY (Secret) in the Vercel project's Environment Variables.
 */
import { handleJupRequest, getJupApiKey, getJupBase } from '../lib/jupProxy.js';
import { clientIpFrom, healthInfo } from '../lib/rpcProxy.js';

const MAX_BODY_BYTES = 200_000;

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // Health check: /api/jup with no endpoint
  if (request.method === 'GET' && !url.searchParams.get('p')) {
    return new Response(healthInfo(process.env), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }

  let body: string | null = null;
  if (request.method === 'POST') {
    body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return new Response(JSON.stringify({ error: 'Request too large' }), {
        status: 413,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  const clientIp = clientIpFrom(request.headers.get('x-forwarded-for'), request.headers.get('x-real-ip'));
  const result = await handleJupRequest(request.method, url.search, body, clientIp, getJupApiKey(process.env), getJupBase(process.env));
  return new Response(result.body, { status: result.status, headers: result.headers });
}

export const GET = handle;
export const POST = handle;
