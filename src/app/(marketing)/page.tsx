import type { Metadata } from "next";
import { AppPreview } from "@/components/marketing/app-preview";
import { ButtonLink } from "@/components/ui/button";
import { AccountDeletedNotice } from "./account-deleted-notice";

export const metadata: Metadata = {
  title: { absolute: "AVEN · money, plans and wellbeing" },
};

const CONNECTIONS = [
  {
    title: "Money that knows your goals",
    body: "Accounts, budgets and savings goals that inform each other, in any currency — logged offline, synced when you're back.",
  },
  {
    title: "Intelligence you can question",
    body: "Spending and savings suggestions that show their working, and learn from what you accept or decline.",
  },
  {
    title: "Plans that keep up",
    body: "Calendar, tasks, habits and weekly reviews — with streaks that never shame you for a missed day.",
  },
  {
    title: "Wellbeing, privately",
    body: "Sleep, water, meals, movement and mood. Yours alone, and never treated as medical advice.",
  },
  {
    title: "Nudges, not noise",
    body: "Reminders and a daily summary that respect your quiet hours — in the app, or by email if you want it.",
  },
  {
    title: "Memory you control",
    body: "Patterns AVEN remembers live encrypted on Walrus, category by category, only when you allow it.",
  },
];

const PRINCIPLES = [
  {
    title: "You decide what AVEN remembers",
    body: "Memory is off by default and switched on per category. See, correct or forget what it keeps.",
  },
  {
    title: "Nothing invented",
    body: "Your personal workspace uses your own records. The separate example workspace is clearly labelled and never writes to your account.",
  },
  {
    title: "AI is optional",
    body: "A conversational AI assistant is planned. Today's recommendations use deterministic rules, and no data is sent to an AI provider.",
  },
  {
    title: "Works on a shaky connection",
    body: "Offline-first: logging an expense, a habit or a glass of water on a slow network never means losing it.",
  },
];

const FEATURES: Array<{ title: string; ready: boolean }> = [
  { title: "Accounts, transactions, budgets and savings goals", ready: true },
  { title: "Spending and savings intelligence that learns from you", ready: true },
  { title: "Walrus Memory and read-only Sui wallets", ready: true },
  { title: "Calendar, tasks, habits and reviews", ready: true },
  { title: "Nudge Center, Pulse Check and email summaries", ready: true },
  { title: "Sleep, water, meals, activity and mood", ready: true },
  { title: "Decision Replay, AVEN Impact and What-if Lab", ready: true },
  { title: "Conversational AI assistant", ready: false },
  { title: "Shared expenses and subscriptions", ready: false },
];

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      {params.account_deleted === "1" ? <AccountDeletedNotice /> : null}

      <section className="ambient overflow-x-clip">
        <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 pt-14 pb-24 sm:px-8 md:pt-24 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="border-line bg-surface/60 text-ink-muted mb-6 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs backdrop-blur">
              <span
                aria-hidden="true"
                className="bg-accent size-1.5 rounded-full shadow-[0_0_8px_var(--accent)]"
              />
              Personal finance and life, in one calm place
            </p>
            <h1 className="type-display text-ink">
              AVEN remembers your decisions, not just your data.
            </h1>
            <p className="text-ink-muted mt-6 max-w-xl text-lg leading-relaxed">
              Money, plans and habits, kept together. AVEN shows why it made a suggestion, remembers
              your choices with permission, and lets you inspect what changed next.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <ButtonLink href="/sign-up" size="lg">
                Create your account
              </ButtonLink>
              <ButtonLink href="/demo" size="lg" variant="secondary">
                Try the decision loop
              </ButtonLink>
            </div>
            <p className="text-ink-subtle mt-5 text-sm">Works in any currency, from NGN to USD</p>
          </div>
          <AppPreview />
        </div>
      </section>

      <section className="border-line bg-surface/60 border-y">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="type-page max-w-2xl text-[2rem]">What AVEN does</h2>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTIONS.map((item, i) => (
              <div
                key={item.title}
                className="border-line bg-canvas/40 shadow-elev-1 lift rounded-2xl border p-6"
              >
                <div
                  aria-hidden="true"
                  className="mb-5 h-px w-10"
                  style={{ background: `var(--chart-${(i % 6) + 1})` }}
                />
                <h3 className="type-section">{item.title}</h3>
                <p className="text-ink-muted mt-2 text-sm leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="type-page text-[2rem]">What AVEN will and won&apos;t do</h2>
            <p className="text-ink-muted mt-4">
              Your data is protected by row-level security, so only your account can read it. AVEN
              never asks for bank passwords, PINs or one-time codes, and it never moves money.
            </p>
          </div>
          <dl className="border-line bg-line shadow-elev-2 grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="bg-surface p-6">
                <dt className="text-ink font-medium">{p.title}</dt>
                <dd className="text-ink-muted mt-2 text-sm leading-relaxed">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="roadmap" className="border-line bg-surface/60 scroll-mt-20 border-t">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <h2 className="type-page text-[2rem]">What works today, and what comes next</h2>
          <ul className="divide-line border-line bg-canvas/40 shadow-elev-1 mt-10 divide-y rounded-2xl border">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span
                  aria-hidden="true"
                  className={
                    f.ready
                      ? "bg-accent size-2 rounded-full shadow-[0_0_8px_var(--accent)]"
                      : "bg-line-strong size-2 rounded-full"
                  }
                />
                <span className="text-ink flex-1 text-sm">{f.title}</span>
                <span className="text-ink-subtle text-xs">{f.ready ? "Available" : "Next"}</span>
              </li>
            ))}
          </ul>
          <div className="hero-surface border-line-strong edge-light mt-12 flex flex-col items-start justify-between gap-6 rounded-2xl border px-6 py-8 sm:flex-row sm:items-center sm:px-10">
            <div>
              <h3 className="text-ink text-xl font-medium">Set up in a few minutes</h3>
              <p className="text-ink-muted mt-1 text-sm">
                Choose your currency and time zone, add an account, and start logging
              </p>
            </div>
            <ButtonLink href="/sign-up" size="lg">
              Create your account
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
