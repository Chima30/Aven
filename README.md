# AVEN

Most apps track what you do, but they don't remember what you decide. That's why they often keep giving you the same advice, even after you've turned it down.

AVEN is a personal companion that brings your finances, daily plans and wellbeing into one place. It helps you manage your accounts, track spending, set budgets and savings goals, plan your day, build habits and keep an eye on things like sleep, water intake, meals, activity and mood.

It also pays attention to the information you enter and uses it to make suggestions that are relevant to your routines and goals.

The difference is that AVEN remembers your decisions. You can accept a recommendation, turn it down or adjust it to something that works better for you. With your permission, these decisions and useful patterns from your finances, planning and wellbeing are saved as encrypted long-term memories on Walrus Memory.

Here's a simple example: if AVEN suggests cutting your entertainment spending by 10% and you turn it down, it can suggest 5% instead next time. If you choose a different amount, it remembers your choice. If you keep rejecting the same suggestion, it stops bringing it up. The same applies to your daily routine. If you usually complete a habit in the evening but your reminder is set for the morning, AVEN can suggest changing the reminder time.

You stay in control of what AVEN remembers, and its suggestions can change as your needs and routines change.

The goal is a companion that learns from your decisions instead of repeating the same advice.

**Live application:** https://aven-ashy.vercel.app/

**Repository:** https://github.com/Chima30/Aven

<img width="1359" height="629" alt="image" src="https://github.com/user-attachments/assets/1fa3d37a-1be1-45ec-96ef-32fe70c1b19d" />


---

## Live on Walrus Mainnet

The deployed app stores and recalls real memories on Walrus Mainnet through the MemWal relayer, and reads Sui Mainnet through Tatum's gRPC gateway. Screenshots from the live site, 2 November 2026:

<img width="1365" height="629" alt="image" src="https://github.com/user-attachments/assets/56309e10-7168-4844-a828-27f05448b810" />



_Walrus relayer connected in production mode and accepting writes; Sui Mainnet connected via Tatum gRPC with the latest checkpoint and epoch._

<img width="1359" height="629" alt="image" src="https://github.com/user-attachments/assets/9d135076-9752-46ce-8c51-3e2b77f16fef" />



_15 memories stored on Walrus (budgeting style, goal progress, savings target and more), each with its blob id, plus Correct and Forget controls._

---

## What AVEN does

### 1. Personal finance

Users can:

- Create and manage multiple accounts in any currency (NGN, USD, EUR and more, never added together).
- Record income and expenses, and transfer between their own accounts.
- Organise transactions with categories.
- Review transaction history.
- Create monthly budgets and track spending against them.
- Set and monitor savings goals.
- See balances, spending and cash flow at a glance.

Balances, totals and metrics are calculated from application records with deterministic TypeScript. They are never invented by an AI model.

### 2. Offline-first

Logging should not stop when the connection does. AVEN is a Progressive Web App with an IndexedDB sync outbox, used for transactions, task completion, habit check-ins, wellbeing logs and Pulse Checks.

- Local storage of pending changes.
- A persistent outbox with client-generated ids.
- Idempotent synchronisation (each change is applied exactly once).
- Automatic retries and duplicate prevention.
- Pending, syncing, synced and failed states.
- Conflict detection when the same record changed elsewhere.

Pending changes are always shown separately from server-confirmed records.

### 3. Financial intelligence

AVEN analyses your records to show:

- Spending compared with your usual months and with budget limits.
- Recurring payments and subscriptions.
- Income patterns.
- Savings rate and savings goal progress, with estimated completion pace.

Every calculation is deterministic and explainable, and every recommendation shows its working.

### 4. Recommendations that learn from decisions

Recommendations include reducing spending in a category, setting a budget, increasing savings, reviewing a subscription and contributing to a goal. You can accept, decline or change each one, and AVEN recalls those outcomes later.

| Your decision                              | How future recommendations adapt          |
| ------------------------------------------ | ----------------------------------------- |
| Decline a suggested 10% spending reduction | A gentler suggestion can be offered later |
| Change the suggested amount                | Your chosen amount becomes the reference  |
| Repeatedly decline the same suggestion     | AVEN stops repeating it                   |

AVEN does not make decisions for you. It makes future suggestions fit what you have already decided.

### 5. Planning

- **Calendar:** month, week and day views; all-day and timed events; daily, weekly, monthly and yearly repeats; cancel a single occurrence without touching the series; every event keeps its own time zone, so daylight-saving changes don't move it.
- **Tasks:** not started, in progress, completed or cancelled; priority, due dates, reminders and categories; overdue and upcoming views.
- **Habits:** every day or chosen weekdays, with streaks, consistency and history. Rest days and today never break a streak, and missed days are never shamed.
- **Reviews:** private daily and weekly reviews, with an option to remember your next focus.

### 6. Nudge Center and Pulse Check

- One inbox for task, event and habit reminders, review reminders, budget alerts, savings milestones and streaks.
- A daily "Your day in AVEN" summary and a weekly summary, built only from real records.
- Per-topic delivery (right away, daily summary, weekly summary or off), quiet hours, a daily limit and a pause switch.
- History of every nudge, including ones held for quiet hours or bundled into a summary, with the reason.
- **Opt-in email:** users choose to receive summaries and important alerts, or everything, by email. Email is off by default.
- **Pulse Check:** an optional, private check-in on mood, energy, stress, sleep and your day. Every question can be skipped. It is not medical.
- Delivery is decided by fixed, tested rules that AI cannot override. Nudges are produced by a server-side scheduler (GitHub Actions every 15 minutes, a daily Vercel Cron, plus a catch-up when you open the app), not by browser timers.

### 7. Wellbeing

- Sleep (overnight sleep and clock changes handled exactly), water (ml, L or fl oz, with a daily target), meals (your own description, never calorie estimates), activity (km or miles) and mood, energy and stress.
- 7- and 14-day trends. Days without a record stay empty and are never filled in.
- Requires its own consent, enforced in the database. AVEN is not a medical service and never diagnoses.

### 8. Walrus Memory

AVEN uses the official MemWal SDK (`@mysten-incubation/memwal`) to store long-term memory on Walrus.

- **Opt-in, per category:** financial context, planning preferences and wellbeing routines each have their own consent.
- **Summaries, not records:** budgeting style, overspent categories, income pattern, subscriptions, savings performance, recommendation outcomes, habit timing, sleep and water patterns, and similar. Never raw transactions, balances, account numbers, notes or meal descriptions.
- Per-user encrypted namespaces; recall before adapting recommendations and suggestions.
- Review, correct, forget (AVEN stops using a memory permanently) and pause.
- Deletion from Walrus itself is not supported by the MemWal SDK. AVEN discloses this before you consent, and forgotten memories are never recalled again.

Supabase remains the authoritative database. Walrus Memory is the contextual layer, not a replacement.

### 9. Sui wallet support

Add public Sui Mainnet addresses to see balances and recent sent transactions through Tatum's Sui gateway. You review each on-chain transaction and confirm before it is imported, with duplicate detection. The integration is read-only: AVEN never asks for private keys, signs transactions or moves funds.

### 10. Privacy and security

- Supabase Auth and PostgreSQL with Row Level Security on every table, tested with two-user isolation tests.
- All planning and wellbeing writes go through one validated, idempotent database function; users cannot write those tables directly.
- Zod validation on the server, rate limits on sensitive actions, and secrets kept server-side only (checked by a secret scanner in CI).
- Explicit consent for AI, memory and wellbeing data, with a consent history.
- Data export and account deletion.

AVEN does not process payments or move money.

---

## Technology stack

| Layer                     | Technology                                  |
| ------------------------- | ------------------------------------------- |
| Application               | Next.js 16 App Router                       |
| UI                        | React 19                                    |
| Language                  | TypeScript (strict mode)                    |
| Styling                   | Tailwind CSS 4                              |
| Validation                | Zod                                         |
| Database                  | Supabase PostgreSQL                         |
| Authentication            | Supabase Auth                               |
| Database security         | Row Level Security                          |
| Long-term memory          | Walrus Memory                               |
| Memory SDK                | `@mysten-incubation/memwal` 0.1.12          |
| Blockchain                | Sui Mainnet                                 |
| Blockchain data           | Tatum Sui gateway (gRPC)                    |
| Intelligence              | Deterministic TypeScript                    |
| Offline storage           | IndexedDB                                   |
| PWA                       | Service worker                              |
| Email                     | SMTP (Gmail, Resend, Brevo or any provider) |
| Scheduling                | GitHub Actions and Vercel Cron              |
| Unit and database testing | Vitest                                      |
| End-to-end testing        | Playwright                                  |
| Hosting                   | Vercel                                      |
| CI                        | GitHub Actions                              |

---

## Architecture overview

**Supabase:** accounts, transactions, budgets, goals, tasks, calendar events, habits, reviews, wellbeing logs, notifications, preferences and consent. Every row is owned by one user and protected by RLS.

**Deterministic intelligence layer:** analyses real records and produces explainable recommendations.

**Nudge scheduler:** a server-side job that turns real records into reminders and summaries, applies your delivery preferences, and sends optional email.

**Walrus Memory:** stores approved, encrypted summaries and makes previous decisions and patterns available to recommendations and suggestions.

**Tatum and Sui:** read-only access to user-added public Sui addresses; imports need confirmation.

**Offline layer:** IndexedDB keeps pending changes locally and syncs them safely when the connection returns.

---

## Getting started

### Requirements

- Node.js 20.9 or newer, and npm.
- A Supabase project.
- Git.
- Optional: Walrus Memory (MemWal) credentials, a Tatum API key, an SMTP account for email, and a `CRON_SECRET` for the background scheduler.

### 1. Clone the repository

```bash
git clone https://github.com/Chima30/Aven.git
cd Aven
```

### 2. Install dependencies

```bash
npm ci
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Add the required values to `.env.local`. Never commit `.env.local` or expose server-side secrets in client-side code. Every variable is described in [ENVIRONMENT.md](docs/ENVIRONMENT.md).

### 4. Set up the database

New Supabase project: run `supabase/setup_all_in_one.sql` once in the SQL Editor.

Existing project: run the files in `supabase/upgrades/` from the stage after the one you already have (`stage5.sql` adds Planning, Wellbeing and the Nudge Center; `stage6.sql` adds email notifications). Full instructions: [Supabase setup](docs/SUPABASE_SETUP.md).

### 5. Run the application

```bash
npm run dev
```

Open http://localhost:3000

### 6. Verify the project

```bash
npm run verify
```

This runs the structure check, secret scan, type check, lint, formatting check, unit tests and a production build. Database and end-to-end tests are described in [TESTING.md](docs/TESTING.md).

---

## Optional integrations

| Integration           | What it enables                                        | Setup                                   |
| --------------------- | ------------------------------------------------------ | --------------------------------------- |
| Walrus Memory         | Long-term memory and the learning feedback loop        | [WALRUS_SETUP.md](docs/WALRUS_SETUP.md) |
| Sui Mainnet via Tatum | Read-only wallet balances and confirmed imports        | [TATUM_SETUP.md](docs/TATUM_SETUP.md)   |
| Email (SMTP)          | Opt-in email copies of nudges                          | [EMAIL.md](docs/EMAIL.md)               |
| Background scheduler  | Reminders and summaries even when nobody has AVEN open | [SCHEDULER.md](docs/SCHEDULER.md)       |

Without these, AVEN still works and shows each feature as not set up. Mock-based tests do not count as live verification.

---

## Documentation

| Document                                                | Description                                                  |
| ------------------------------------------------------- | ------------------------------------------------------------ |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Application architecture and design decisions                |
| [FINANCE.md](docs/FINANCE.md)                           | Finance data model and calculations                          |
| [INTELLIGENCE.md](docs/INTELLIGENCE.md)                 | Financial analysis and the recommendation feedback loop      |
| [PLANNING.md](docs/PLANNING.md)                         | Calendar, tasks, habits and reviews                          |
| [NUDGE_CENTER.md](docs/NUDGE_CENTER.md)                 | Delivery rules, summaries and Pulse Check                    |
| [WELLBEING.md](docs/WELLBEING.md)                       | Wellbeing logs, units, consent and limits                    |
| [MEMORY.md](docs/MEMORY.md)                             | Walrus Memory architecture, namespaces, consent and deletion |
| [OFFLINE.md](docs/OFFLINE.md)                           | Offline storage and synchronisation                          |
| [SCHEDULER.md](docs/SCHEDULER.md)                       | Background scheduler and push notification requirements      |
| [EMAIL.md](docs/EMAIL.md)                               | Email notification setup and safeguards                      |
| [DATABASE.md](docs/DATABASE.md)                         | Tables, access rules and migrations                          |
| [SECURITY.md](docs/SECURITY.md)                         | Security boundaries, RLS and privacy                         |
| [ENVIRONMENT.md](docs/ENVIRONMENT.md)                   | Environment variables                                        |
| [SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)             | Database setup and upgrades                                  |
| [WALRUS_SETUP.md](docs/WALRUS_SETUP.md)                 | Walrus Memory configuration and verification                 |
| [TATUM_SETUP.md](docs/TATUM_SETUP.md)                   | Tatum and Sui Mainnet configuration                          |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                     | Deploying to Vercel                                          |
| [TESTING.md](docs/TESTING.md)                           | Test strategy and latest results                             |
| [ROADMAP.md](docs/ROADMAP.md)                           | What's done and what's next                                  |
| [HACKATHON_SUBMISSION.md](docs/HACKATHON_SUBMISSION.md) | Submission details and evidence                              |
| [BLOG_POST.md](docs/BLOG_POST.md)                       | Technical write-up                                           |
| [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)                   | Demonstration guide                                          |

---

## Project status

**Available now:** personal finance, offline sync, financial intelligence and learning recommendations, Walrus Memory, read-only Sui wallets, Planning, the Nudge Center with Pulse Check and opt-in email, and Wellbeing.

**Tests (latest run):** 249 unit tests, 197 database tests on PostgreSQL 16 (including two-user isolation for every user-owned table) and 88 end-to-end tests on desktop and mobile, all passing. See [TESTING.md](docs/TESTING.md).

**Not included yet:** push notifications to phones, shared expenses and subscription tracking.

**Verified live (2 November 2026):** Walrus Memory on Mainnet (15 memories stored by the deployed app, relayer in production mode) and Sui Mainnet via Tatum gRPC, as shown in the screenshots above. Automated tests use the official MemWal mock and mocked Sui responses, and are never presented as live verification.

---

## Ground rules

- No fake data: no fabricated balances, transactions, tasks, events or health records.
- AI must not invent financial numbers, and cannot override notification rules.
- No secrets in source control.
- Row Level Security on every table.
- Memory is opt-in per category, and stores summaries, not records.
- Calculations are deterministic and explainable.
- AVEN does not move money, give medical advice or estimate calories.
- Public wallet data is not imported without confirmation.
- Unavailable features are labelled honestly, never faked.

---

**AVEN is built around a simple idea: a personal companion should remember what matters to you, understand your decisions and make what it suggests next more relevant.**
