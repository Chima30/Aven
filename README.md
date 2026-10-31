# AVEN

**A personal finance companion that remembers what you decided — and learns from it.**

AVEN tracks your accounts, spending, budgets and savings goals (online and offline), explains
where your money is going with deterministic, checkable numbers, and makes recommendations
you can accept, decline or change. Every decision is stored as encrypted long-term memory on
**Walrus (Mainnet)** through the official MemWal SDK, and the next recommendation is shaped by
what AVEN **recalls from Walrus** — so declining a 10% cut makes the next suggestion gentler,
setting your own amount makes that your target, and declining twice makes AVEN stop asking.
You can also add public **Sui Mainnet** wallets, read through **Tatum**, and record on-chain
transactions in AVEN only when you confirm them.

> **Status: Stages 1–4 implemented, Stage 5–7 hardening, tests and docs done.** Live Walrus
> and Tatum integrations are built and tested against the official MemWal mock and mocked
> Sui responses. **Live Mainnet verification is a step you run with your own credentials**
> (see [docs/WALRUS_SETUP.md](docs/WALRUS_SETUP.md) and [docs/TATUM_SETUP.md](docs/TATUM_SETUP.md));
> until you do, no Mainnet memory has been written by this code.

## What works today

| Area               | What you can do                                                                                                            |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Money              | Accounts, income, expenses, transfers, categories, monthly budgets, savings goals; offline entry with exactly-once sync    |
| Intelligence       | Spending vs. usual and vs. budget, recurring payments and subscriptions, income pattern, savings rate, goal pace           |
| Recommendations    | Explained suggestions (cut a category, add a budget, save more, review a subscription, fund a goal); accept/decline/change |
| Walrus Memory      | Opt-in, per-user encrypted memory on Walrus Mainnet; see, read back, forget; learning from recalled outcomes               |
| Sui wallets        | Read-only balances and recent sent transactions via Tatum gRPC; confirmed import with duplicate detection                  |
| Privacy & security | RLS everywhere, consent with disclosures, pause memory, export, account deletion with an honest external-cleanup record    |

## Stack

| Layer          | Technology                                                                          |
| -------------- | ----------------------------------------------------------------------------------- |
| App            | Next.js 16 (App Router), React 19, TypeScript (strict)                              |
| Data & auth    | Supabase: PostgreSQL, Auth, Row Level Security                                      |
| Long-term mem. | Walrus Mainnet via `@mysten-incubation/memwal` 0.1.12 and the hosted MemWal relayer |
| Sui            | `@mysten/sui` 2.38 gRPC client → Tatum Sui Mainnet gateway (JSON-RPC as fallback)   |
| Intelligence   | Deterministic TypeScript (no AI model, no outside data)                             |
| Offline        | PWA service worker + IndexedDB outbox                                               |
| Tests          | Vitest (unit, database/RLS, optional live), Playwright (end-to-end)                 |
| Hosting / CI   | Vercel, GitHub Actions                                                              |

## Getting it running

1. **Supabase** — run the database setup, or the Stage 3 and Stage 4 upgrades → [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
2. **GitHub** — commit with GitHub Desktop → [docs/GITHUB_UPLOAD.md](docs/GITHUB_UPLOAD.md)
3. **Vercel** — add the environment variables → [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
4. **Walrus Memory** (optional, needed for learning) → [docs/WALRUS_SETUP.md](docs/WALRUS_SETUP.md)
5. **Tatum** (optional, needed for Sui wallets) → [docs/TATUM_SETUP.md](docs/TATUM_SETUP.md)

## Documentation

| Document                                                                  | What's in it                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                                   | How the app is structured and why                            |
| [MEMORY.md](docs/MEMORY.md)                                               | Walrus Memory design: format, namespaces, consent, deletion  |
| [INTELLIGENCE.md](docs/INTELLIGENCE.md)                                   | The analysis rules and the recommendation learning loop      |
| [WALRUS_SETUP.md](docs/WALRUS_SETUP.md)                                   | Getting MemWal credentials and verifying Mainnet storage     |
| [TATUM_SETUP.md](docs/TATUM_SETUP.md)                                     | Getting a Tatum key and verifying Sui Mainnet access         |
| [SECURITY.md](docs/SECURITY.md)                                           | Security boundaries, RLS, secrets, isolation, deletion       |
| [DATABASE.md](docs/DATABASE.md)                                           | Every table, who can access it, and the migration list       |
| [FINANCE.md](docs/FINANCE.md) · [OFFLINE.md](docs/OFFLINE.md)             | Finance data model and offline sync                          |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)                                     | Every environment variable                                   |
| [TESTING.md](docs/TESTING.md)                                             | What is tested, how, and the latest results                  |
| [HACKATHON_SUBMISSION.md](docs/HACKATHON_SUBMISSION.md)                   | Submission checklist, descriptions and evidence placeholders |
| [BLOG_POST.md](docs/BLOG_POST.md) · [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) | Technical write-up and a 2–3 minute demo script              |

## For developers

```bash
npm ci
cp .env.example .env.local   # fill in values locally (never commit this file)
npm run dev                  # http://localhost:3000
npm run verify               # structure, secrets, types, lint, format, unit tests, build
npm run test:db              # needs PostgreSQL (docs/TESTING.md)
npm run test:e2e             # needs PostgreSQL + an e2e build (docs/TESTING.md)
npm run verify:tatum         # OPTIONAL live Sui Mainnet check with your Tatum key
npm run verify:walrus        # OPTIONAL live Walrus Mainnet check (writes need explicit authorisation)
```

## Ground rules

No fake data · no secrets in code · RLS on every user table · memory is opt-in and disclosed ·
no AI invents numbers · nothing that moves money · on-chain data is never merged without
confirmation · features that aren't built are labelled, not faked.
