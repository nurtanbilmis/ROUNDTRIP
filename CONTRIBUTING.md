# Contributing to Round Trip

Thanks for helping out. Round Trip moves real funds, so changes are reviewed with care.

## Workflow

1. Fork the repository (or create a branch if you have write access).
2. Name branches by type: `fix/…`, `feat/…`, `chore/…`, `docs/…`.
3. Keep each pull request focused on one change.
4. Before opening a PR, run:
   ```bash
   npm run lint
   npm run build
   ```
   CI runs the same checks on every pull request.
5. In the PR description, explain **why** the change is needed and **how you tested it**, ideally with a real wallet on the preview deployment.

## Things to be careful with

- **Prices.** A missing price means "unknown", never `$0`. Never size a swap or record a harvest with a price that isn't known.
- **Balances.** Commit balance results only when every read (SOL, SPL, Token-2022) succeeded.
- **Harvest ledger.** Use confirmed on-chain balance deltas, not quote projections. Read SOL legs from native lamports.
- **Token decimals.** Read them on-chain; never assume 9.
- **Secrets.** Never commit `.env*` files or put an RPC URL with a token in client code. Only `VITE_` variables reach the browser, and they are public.
- **Transactions.** Every transaction must be built in the browser and signed by the user's wallet. Don't add anything that moves funds without an explicit signature.

## Code style

- TypeScript and React function components.
- Match the formatting of the surrounding code.
- Comment the *why* behind non-obvious logic, especially around money.

## Questions

Open a GitHub issue, or ask in the GRAPE DAO Discord.
