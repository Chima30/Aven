# Roadmap

Each stage is completed, tested and reviewed before the next begins. **Stage 3 starts only
after Stage 2 is explicitly approved.**

| Stage                                     | Scope                                                                                                                                                                       | Status                          |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| 1 · Foundation                            | Auth, app shell, design system, settings, consent, audit log, export, deletion, RLS tests, offline/nudge/memory architecture                                                | Approved                        |
| 2 · Core finance                          | Accounts, transactions, categories, income/expenses/transfers, budgets, savings goals, finance dashboard, search/filters, summaries; **offline transaction logging + sync** | **Delivered — awaiting review** |
| 3 · Subscriptions, planning, Nudge Center | Subscriptions + renewals, reminders, calendar, tasks, daily/weekly planning, routines, Nudge Center, Pulse Check, server-side scheduling, quiet hours                       | Not started                     |
| 4 · Shared expenses                       | Groups, invitations, members, splits, settlements with confirmation, group history and budgets, retention when members leave                                                | Not started                     |
| 5 · Wellbeing                             | Sleep, water, meals, exercise, habits, routines, goals, reviews; offline logging; consent-gated                                                                             | Not started                     |
| 6 · Agent + Walrus Memory                 | Ask Your Agent, floating assistant, Anthropic API (server-only), usage limits, confirmation for consequential actions, Walrus Memory after verification                     | Not started                     |
| 7 · Optional integrations                 | Sui watch-only wallets / digest verification via Tatum gRPC, bank connections, calendars, push — only with clear benefit                                                    | Not started                     |
| 8 · Hardening & launch                    | Security, performance, accessibility, mobile, browsers, monitoring, nonce CSP, SMTP, backups, export/deletion verification, legal review                                    | Not started                     |

## Deferred from Stage 1 (by design)

- Magic link and Google sign-in.
- Changing email address.
- MFA (Supabase supports it; to review for Stage 8).
- Localised UI languages (architecture ready; English only).

## Deferred from Stage 2

- **CSV import** (listed in the master brief's Stage 2 summary but not in the Stage 2 task
  brief). It needs a careful preview → map columns → de-duplicate → confirm flow, so it is
  deferred rather than done hastily. It's a candidate for early Stage 3.
- Receipt attachments: the `attachment_ref` column is reserved; uploads come later.
- Offline management of accounts, budgets and goals (transactions are fully offline).
- Currency conversion and multi-currency transfers.
