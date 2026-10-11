# Security Policy

Round Trip builds and signs Solana transactions in users' browsers. We take reports seriously.

## Reporting a vulnerability

**Please don't open a public issue.** Report privately instead:

- Use GitHub's **Security → Report a vulnerability** on this repository (private advisory), or
- contact the maintainers directly in the GRAPE DAO Discord and ask for a private channel.

Please include what you found, how to reproduce it, and the impact you expect. We aim to acknowledge reports within 3 days.

## Scope

In scope:

- Anything that could make a user sign a transaction they didn't intend, or that sends funds to the wrong place
- Leaking secrets, such as the RPC URL behind `/api/rpc` or the Jupiter key behind `/api/jup`
- Abuse of `/api/rpc` or `/api/jup` beyond their allowlists or rate limits
- Wrong values that could lead users to wrong trades (for example, prices or balances shown as $0)

Out of scope: bugs in third-party services (Jupiter, DexScreener, RPC providers, wallets). Please report those to them directly.

## Design notes

- The app is non-custodial: every transaction is signed by the user's wallet.
- The private RPC URL and the Jupiter key are server-side only. `VITE_` variables are bundled into the browser and are public by design, so no secret may use that prefix.
