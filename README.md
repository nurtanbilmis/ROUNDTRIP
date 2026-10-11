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
- **Wallet tools**: hide dust, convert small balances to SOL, close empty token accounts to reclaim rent.
- **Leaderboard** for community competitions (configured in `src/competition.ts`).

## How it works

```
Browser (React + Vite)
 ├─ Wallet adapter (Phantom, Solflare, Backpack, …) ── signs every transaction
 ├─ Jupiter API ── quotes, swap transactions, prices, token search
 ├─ DexScreener API ── fallback prices and 24h changes
 └─ /api/rpc ── our own server route
                 └─ forwards allowed Solana RPC methods to a private RPC (URL kept server-side)
```

The app is mostly client-side. The one server piece is `/api/rpc`: it keeps the paid RPC URL out of the browser. It only allows the RPC methods the app needs, and rate-limits each IP address. The logic lives in [`lib/rpcProxy.ts`](lib/rpcProxy.ts) and runs two ways:

- [`server.ts`](server.ts): an Express server, for local development or any Node host
- [`api/rpc.ts`](api/rpc.ts): a Vercel serverless function

Baskets and the harvest ledger are stored in the browser (`localStorage`), per wallet address.

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
| `VITE_JUP_API_KEY` | Browser | Recommended | Key from [portal.jup.ag](https://portal.jup.ag). Bundled into the browser code, so it is public. Without a key Jupiter is heavily rate-limited. |

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
2. Under **Settings → Environment Variables**, add `RPC_UPSTREAM_URL` and `VITE_JUP_API_KEY`.
3. Deploy. Each pull request gets its own preview URL.

### Any Node host

Run `npm run build`, then `npm start`, with the same environment variables. `PORT` sets the port (default 3000).

## Project structure

```
api/rpc.ts              Vercel function for /api/rpc
lib/rpcProxy.ts         RPC proxy logic (allowlist, rate limit, forwarding)
server.ts               Express server (dev + Node hosting)
src/App.tsx             Dashboard, baskets, settings
src/components/         Views: AllocationView (basket + rebalance), PriceView (Market Intel), LeaderboardView, modals
src/components/WalletProvider.tsx   Wallet connection, balances, swap signing
src/jupiter.ts          Jupiter + DexScreener API calls
src/rpc.ts              Solana connection helper (default = /api/rpc)
src/presets.ts          Basket presets
src/competition.ts      Leaderboard competition config
```

## Contributing

Pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md). To report a security issue, see [SECURITY.md](SECURITY.md); please don't open a public issue for it.

## License

[Apache License 2.0](LICENSE). See [NOTICE](NOTICE).
