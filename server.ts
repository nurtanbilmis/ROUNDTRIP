import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Method allowlist
const ALLOWED_METHODS = new Set([
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

// In-memory rate limiting per client IP: max 120 requests per 10 seconds
const ipRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = ipRateLimits.get(ip);
  if (!record || now > record.resetAt) {
    ipRateLimits.set(ip, { count: 1, resetAt: now + 10_000 });
    return true;
  }
  if (record.count >= 120) {
    return false;
  }
  record.count += 1;
  return true;
}

// Clean up old rate limit records periodically
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRateLimits.entries()) {
    if (now > record.resetAt) {
      ipRateLimits.delete(ip);
    }
  }
}, 30_000).unref();

app.post('/api/rpc', express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.ip ||
    req.socket.remoteAddress ||
    'unknown';

  if (!checkRateLimit(clientIp)) {
    res.status(429).json({
      jsonrpc: '2.0',
      error: { code: -32029, message: 'Too many requests' },
      id: null,
    });
    return;
  }

  const body = req.body;
  if (!body) {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: null,
    });
    return;
  }

  // Support single request object or batch array
  if (Array.isArray(body)) {
    if (body.length === 0) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request: empty batch' },
        id: null,
      });
      return;
    }

    for (const item of body) {
      if (!item || typeof item !== 'object' || !ALLOWED_METHODS.has(item.method)) {
        res.status(403).json({
          jsonrpc: '2.0',
          error: { code: -32601, message: `Method not allowed: ${item?.method || 'unknown'}` },
          id: item?.id ?? null,
        });
        return;
      }
    }
  } else if (typeof body === 'object') {
    if (!ALLOWED_METHODS.has(body.method)) {
      res.status(403).json({
        jsonrpc: '2.0',
        error: { code: -32601, message: `Method not allowed: ${body.method || 'unknown'}` },
        id: body.id ?? null,
      });
      return;
    }
  } else {
    res.status(400).json({
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Invalid Request' },
      id: null,
    });
    return;
  }

  const tritonUrl = process.env.TRITON_RPC_URL;
  if (!tritonUrl) {
    res.status(503).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'RPC not configured' },
      id: Array.isArray(body) ? null : body?.id ?? null,
    });
    return;
  }

  try {
    const upstreamRes = await fetch(tritonUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data = await upstreamRes.text();
    res.status(upstreamRes.status).set('Content-Type', 'application/json').send(data);
  } catch {
    res.status(502).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal RPC forwarding error' },
      id: Array.isArray(body) ? null : body?.id ?? null,
    });
  }
});

// Vite app serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    // SPA fallback. Express 5 no longer accepts '*' as a path, so use a catch-all middleware.
    app.use((_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT} (dev: ${isDev})`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
