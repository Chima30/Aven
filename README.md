# AVEN

**Personal finance, wellbeing and personal intelligence — in one calm, connected place.**

AVEN connects your money, shared bills, subscriptions, wellbeing, routines and plans, with a
personal agent and a long-term memory that only knows what you allow. It is global (any
currency, any time zone) and is built in stages: each stage is finished and tested before the
next begins.

> **Current status: Stage 2 — Core finance.** On top of the Stage 1 foundation (secure
> accounts, settings, privacy and consent, export and deletion), AVEN now has accounts,
> income, expenses, transfers, categories, monthly budgets, savings goals and a finance
> dashboard — with **offline transaction entry and safe sync**. Wellbeing, planning, the
> Nudge Center and AI are not live yet, and the app never shows invented data.

## Stack

| Layer        | Technology                                                       |
| ------------ | ---------------------------------------------------------------- |
| App          | Next.js 16 (App Router), React 19, TypeScript (strict)           |
| Styling      | Tailwind CSS 4, custom design tokens (light / dark / system)     |
| Data & auth  | Supabase: PostgreSQL, Auth, Row Level Security                   |
| Validation   | Zod                                                              |
| Offline      | PWA service worker + IndexedDB outbox (`idb`)                    |
| Tests        | Vitest (unit + database/RLS), Playwright (end-to-end)            |
| Hosting / CI | Vercel, GitHub Actions                                           |
| Later stages | Anthropic API (Stage 6), Walrus Memory (Stage 6), Sui (optional) |

## Getting it running (no terminal needed)

1. **Supabase** — create the project and run the database setup (or the Stage 2 upgrade) → [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
2. **GitHub** — upload these files to `Chima30/aven` → [docs/GITHUB_UPLOAD.md](docs/GITHUB_UPLOAD.md)
3. **Vercel** — import the repo and add the environment variables → [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Documentation

| Document                                | What's in it                                                  |
| --------------------------------------- | ------------------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | How the app is structured and why                             |
| [FINANCE.md](docs/FINANCE.md)           | Finance data model, balance rules, currencies, write path     |
| [DATABASE.md](docs/DATABASE.md)         | Every table, who can access it, and the migration list        |
| [SECURITY.md](docs/SECURITY.md)         | Security boundaries, RLS strategy, CSRF, rate limits, secrets |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)   | Environment variables and where to find each value            |
| [OFFLINE.md](docs/OFFLINE.md)           | Offline queue, sync, idempotency, retries, conflicts          |
| [NUDGE_CENTER.md](docs/NUDGE_CENTER.md) | Notification rules, quiet hours and scheduling plan           |
| [MEMORY.md](docs/MEMORY.md)             | Walrus Memory architecture, consent and open questions        |
| [TESTING.md](docs/TESTING.md)           | What is tested, how, and Stage 1 results                      |
| [ROADMAP.md](docs/ROADMAP.md)           | Stages 1–8                                                    |

## For developers

```bash
npm ci
cp .env.example .env.local   # then fill in values (never commit this file)
npm run dev                  # http://localhost:3000
npm run verify               # secrets scan, types, lint, format, unit tests, build
npm run test:db              # needs PostgreSQL (see docs/TESTING.md)
npm run test:e2e             # needs PostgreSQL + a build made with the e2e env (docs/TESTING.md)
```

## Ground rules

No fake data · no secrets in code · RLS on every user table · AI and memory are opt-in ·
nothing that moves money · features that aren't built are labelled, not faked.
