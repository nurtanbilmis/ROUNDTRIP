import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { clientIpFrom, getUpstreamUrl, handleRpcRequest, healthInfo, upstreamCheck } from './lib/rpcProxy.js';
import { getJupApiKey, getJupBase, handleJupRequest, jupiterCheck } from './lib/jupProxy.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Solana RPC proxy: the browser calls /api/rpc, we forward to the private RPC.
// Shared with the Vercel function in api/rpc.ts.
app.post('/api/rpc', express.json({ limit: '1mb' }), async (req: Request, res: Response) => {
  const clientIp = clientIpFrom(req.headers['x-forwarded-for'] as string | undefined, req.ip || req.socket.remoteAddress);
  const result = await handleRpcRequest(req.body, clientIp, getUpstreamUrl(process.env));
  res.status(result.status).set('Content-Type', 'application/json').send(result.body);
});

app.get('/api/rpc', async (req: Request, res: Response) => {
  const body = req.query.check ? await upstreamCheck(process.env) : healthInfo(process.env);
  res.set('Content-Type', 'application/json').set('Cache-Control', 'no-store').send(body);
});

// Jupiter API proxy: the browser calls /api/jup?p=<endpoint>, we add the private key.
// Shared with the Vercel function in api/jup.ts.
app.all('/api/jup', express.text({ type: '*/*', limit: '200kb' }), async (req: Request, res: Response) => {
  const search = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
  if (req.method === 'GET' && !new URLSearchParams(search).get('p')) {
    const check = new URLSearchParams(search).get('check');
    res.set('Content-Type', 'application/json').set('Cache-Control', 'no-store').send(check ? await jupiterCheck(process.env) : healthInfo(process.env));
    return;
  }
  const clientIp = clientIpFrom(req.headers['x-forwarded-for'] as string | undefined, req.ip || req.socket.remoteAddress);
  const body = typeof req.body === 'string' ? req.body : null;
  const result = await handleJupRequest(req.method, search, body, clientIp, getJupApiKey(process.env), getJupBase(process.env));
  res.status(result.status).set(result.headers).send(result.body);
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
