# Round Trip

**A non-custodial rebalancer for Solana token baskets, built on volatility harvesting.**

You group coins into baskets ("link-groups") with target weights. When prices move, a basket drifts from its targets. Round Trip shows the drift and builds the swaps that bring it back: it sells what went up and buys what went down. Over many round trips, the swings themselves become profit.

- **Non-custodial.** Every swap is built in your browser and signed by your own wallet. No contract, bot or server can move your funds.
- **Swaps route through [Jupiter](https://jup.ag)**, so you get the best available route on Solana.
- **Honest P&L.** Harvest is recorded from confirmed on-chain balance changes of Round Trip's own swaps, so airdrops and transfers don't distort it.

> Coin selection is the entire risk. A rebalancer keeps buying a coin that keeps falling. Pick coins you would hold through a full cycle. This is not financial advice.

## Features

- **Baskets** with equal or custom target weights. Rebalancing is advised once a coin drifts more than ±5 percentage points.
- **Presets** to start quickly: Steady, Majors, AI & Tech, High Beta.
- **Harvest ledger**: an append-only record of every rebalance swap, valued at current prices.
- **Market Intel**: prices, 24h changes, and quick swaps.
- **Backup**: export your baskets and harvest history to a file and import them in another browser (⚙️ Settings → Backup).
- **Wallet tools**: hide dust, convert small balances to SOL, close empty token accounts to reclaim rent.
- **Leaderboard** for community competitions: hidden between seasons, configured in `src/competition.ts`.

## How it works

```
Browser (React + Vite)
 ├─ Wallet adapter (Phantom, Solflare, Backpack, …) ── signs every transaction
 ├─ DexScreener API ── fallback prices and 24h changes
 ├─ /api/rpc ── our server route → private Solana RPC (URL kept server-side)
 └─ /api/jup ── our server route → Jupiter API (key kept server-side)
                 quotes, swap transactions, prices, token search
```

The app is mostly client-side. Two small server routes keep paid credentials out of the browser:

- **`/api/rpc`** forwards only the Solana RPC methods the app needs ([`lib/rpcProxy.ts`](lib/rpcProxy.ts)).
- **`/api/jup`** forwards only the Jupiter endpoints the app needs ([`lib/jupProxy.ts`](lib/jupProxy.ts)). Shared data is cached for all users: prices for 20 seconds, token search for 5 minutes, the verified-token list for 1 hour. Quotes and swaps are never cached.

Both are rate-limited per IP address. Open either route in a browser for a health check: it shows whether each key is set, never the values. The same logic runs two ways:

- [`server.ts`](server.ts): an Express server, for local development or any Node host
- [`api/rpc.ts`](api/rpc.ts) and [`api/jup.ts`](api/jup.ts): Vercel serverless functions

Baskets and the harvest ledger are stored in the browser (`localStorage`), per wallet address. Settings → Backup exports them to a JSON file (format documented in [`src/backup.ts`](src/backup.ts)) and imports them again, skipping duplicates.

## Run it locally

Requirements: Node.js 20 or newer.

```bash
git clone https://github.com/nurtanbilmis/ROUNDTRIP.git round-trip
cd round-trip
npm install
cp .env.example .env.local   # then fill in the values
npm run dev                  # http://localhost:3000
```

### Environment variables

| Variable | Where it's used | Required | Notes |
| --- | --- | --- | --- |
| `RPC_UPSTREAM_URL` | Server only | Yes, for `/api/rpc` | Private Solana RPC URL including its token (Triton, Helius, QuickNode, …). Never prefix with `VITE_`. `TRITON_RPC_URL` is accepted too. |
| `JUP_API_KEY` | Server only | Recommended | Key from [portal.jup.ag](https://portal.jup.ag). Never prefix with `VITE_`. Without a key Jupiter is heavily rate-limited. |
| `RPC_ORIGIN` | Server only | No | Site address sent to the RPC provider as `Origin`, for providers that whitelist by domain. Defaults to the address the site is served on. |
| `VITE_PUBLIC_RPC_URL` | Browser (public) | No, fallback only | Makes the browser call the RPC directly instead of `/api/rpc`. Use only if the provider refuses server-side calls. The URL becomes visible to every visitor, so lock it to your domain. Requires a redeploy. |

Without `RPC_UPSTREAM_URL`, `/api/rpc` answers "RPC not configured". You can still use the app by entering your own RPC URL under ⚙️ Settings → Custom RPC.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Express server with Vite dev middleware, at port 3000 |
| `npm run build` | Production build into `dist/` |
| `npm start` | Serves `dist/` and `/api/rpc` with Express (run `npm run build` first) |
| `npm run lint` | TypeScript type check |

## Deploy

### Vercel (recommended)

1. Import the repository in Vercel (**Add New → Project**). The Vite preset is detected automatically; `vercel.json` sets the rest.
2. Under **Settings → Environment Variables**, add `RPC_UPSTREAM_URL` and `JUP_API_KEY`, marked **Sensitive**, with **both Production and Preview** ticked. If Preview is left out, pull-request previews show an empty wallet.
3. Deploy, then add your domain under **Settings → Domains**.
4. Check the deploy: open `https://<your-domain>/api/rpc?check=1` and `https://<your-domain>/api/jup?check=1`. Both should say `"ok": true`. Secrets are never shown.

Environment variables only reach deployments made *after* they are saved. After adding or changing one, redeploy.

#### RPC providers that block server calls

Some RPC endpoints (Triton, for example) are set up for browsers and refuse calls from cloud servers. `/api/rpc?check=1` then reports `upstreamStatus: 403` and *"Your IP or provider is blocked from this endpoint"*. A domain whitelist alone doesn't fix this. Either:

- **Recommended:** ask the provider to allow server-side (backend) calls for the endpoint. The RPC URL then stays private.
- **Fallback:** set `VITE_PUBLIC_RPC_URL` to the endpoint, whitelist your domain with the provider, and redeploy. The browser then calls the RPC directly and the URL is visible to visitors.

### Any Node host

Run `npm run build`, then `npm start`, with the same environment variables. `PORT` sets the port (default 3000).

## Project structure

```
api/rpc.ts, api/jup.ts  Vercel functions for /api/rpc and /api/jup
lib/rpcProxy.ts         RPC proxy logic (allowlist, rate limit, forwarding, health check)
lib/jupProxy.ts         Jupiter proxy logic (allowlist, key, shared cache)
server.ts               Express server (dev + Node hosting)
src/App.tsx             Dashboard, baskets, settings
src/components/         Views: AllocationView (basket + rebalance), PriceView (Market Intel), LeaderboardView, modals
src/components/WalletProvider.tsx   Wallet connection, balances, swap signing
src/jupiter.ts          Jupiter (via /api/jup) + DexScreener API calls
src/rpc.ts              Solana connection helper (default = /api/rpc)
src/presets.ts          Basket presets
src/competition.ts      Leaderboard competition config
```

## Running a competition

The Leaderboard tab is hidden for now. Its code stays in place for the next season. To start a season, follow the checklist at the top of [`src/competition.ts`](src/competition.ts): turn the tab on, set the entrants' wallets, the start value (USD value of 0.5 SOL at kickoff), and the start and end dates. Then open a pull request.

## Support

Round Trip charges 0% platform fees. If it helps you, you can send a tip to the creator at **`bestchain.sol`** (any Solana wallet that supports .sol names). The address is set in [`src/components/SupportCreator.tsx`](src/components/SupportCreator.tsx).

## Contributing

Pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md); please don't open a public issue for it.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
