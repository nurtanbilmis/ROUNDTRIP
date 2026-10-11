import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { clientIpFrom, getUpstreamUrl, handleRpcRequest } from './lib/rpcProxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Local development: load server-side secrets from .env.local if present.
// On Vercel and other hosts, set environment variables in the host's settings instead.
try {
  process.loadEnvFile('.env.local');
} catch {
  // no .env.local: rely on the real environment
}

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Solana RPC proxy: the browser calls /api/rpc, we forward to the private RPC.
// Shared with the Vercel function in api/rpc.ts.
app.post('/api/rpc', express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
  const clientIp = clientIpFrom(req.headers['x-forwarded-for'] as string | undefined, req.ip || req.socket.remoteAddress);
  const result = await handleRpcRequest(req.body, clientIp, getUpstreamUrl(process.env));
  res.status(result.status).set('Content-Type', 'application/json').send(result.body);
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
