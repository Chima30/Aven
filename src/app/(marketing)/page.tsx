import type { Metadata } from "next";
import { ConnectionsIllustration } from "@/components/marketing/connections-illustration";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/feedback";
import { AccountDeletedNotice } from "./account-deleted-notice";

export const metadata: Metadata = {
  title: { absolute: "AVEN — money, wellbeing and plans in one calm place" },
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
    body: "No sample balances, no made-up transactions, no fake activity. Everything you see is something you added.",
  },
  {
    title: "AI is optional",
    body: "The assistant is off until you turn it on. When it's off, none of your data is sent to an AI provider.",
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

      <section
        data-no-reveal
        className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 md:pt-20 lg:grid-cols-[1.05fr_1fr]"
      >
        <div className="animate-fade-up">
          <Badge tone="accent">Early access · Walrus Memory + Sui</Badge>
          <h1 className="type-display text-ink mt-5">
            Your money, wellbeing and plans —{" "}
            <span className="text-accent">finally talking to each other.</span>
          </h1>
          <p className="text-ink-muted mt-6 max-w-xl text-lg leading-relaxed">
            AVEN connects your finances, plans, routines and wellbeing in one calm place — and only
            remembers what you allow it to.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/sign-up" size="lg">
              Create your account
            </ButtonLink>
            <ButtonLink href="#roadmap" size="lg" variant="secondary">
              What&apos;s inside
            </ButtonLink>
          </div>
          <p className="text-ink-subtle mt-5 text-sm">
            Free while in early access. Works with any currency, from NGN to USD, EUR, JPY and KWD.
          </p>
        </div>
        <div className="animate-fade-up flex justify-center [animation-delay:150ms] lg:justify-end">
          <ConnectionsIllustration />
        </div>
      </section>

      <section className="border-line bg-surface border-y">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="type-eyebrow text-accent">One connected system</p>
          <h2 className="type-page mt-3 max-w-2xl text-[2rem]">
            Not six apps in one dashboard. One picture of your life.
          </h2>
          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {CONNECTIONS.map((item) => (
              <div key={item.title} data-reveal>
                <div className="bg-accent mb-4 h-px w-10" />
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
            <p className="type-eyebrow text-accent">Built on trust</p>
            <h2 className="type-page mt-3 text-[2rem]">Private by design, not by promise.</h2>
            <p className="text-ink-muted mt-4">
              Your data is protected by row-level security, so only your account can read it. AVEN
              never asks for bank passwords, PINs or one-time codes, and it never moves money.
            </p>
          </div>
          <dl className="border-line bg-line grid gap-px overflow-hidden rounded-2xl border sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p.title} className="bg-surface p-6" data-reveal>
                <dt className="text-ink font-semibold">{p.title}</dt>
                <dd className="text-ink-muted mt-2 text-sm leading-relaxed">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="roadmap" className="border-line bg-surface scroll-mt-20 border-t">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="type-eyebrow text-accent">What&apos;s inside</p>
          <h2 className="type-page mt-3 text-[2rem]">What works today, and what comes next.</h2>
          <ul className="divide-line border-line mt-10 divide-y rounded-2xl border">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-center gap-4 px-5 py-4 sm:px-6" data-reveal>
                <span
                  aria-hidden="true"
                  className={
                    f.ready ? "bg-accent size-2 rounded-full" : "bg-line-strong size-2 rounded-full"
                  }
                />
                <span className="text-ink flex-1 text-sm font-medium">{f.title}</span>
                {f.ready ? <Badge tone="success">Available</Badge> : <Badge>Next</Badge>}
              </li>
            ))}
          </ul>
          <div className="bg-primary text-primary-fg mt-12 flex flex-col items-start justify-between gap-6 rounded-2xl px-6 py-8 sm:flex-row sm:items-center sm:px-10">
            <div>
              <h3 className="text-xl font-semibold">Start with what matters today.</h3>
              <p className="mt-1 text-sm opacity-80">
                Set your currency and time zone, add an account, and AVEN takes it from there.
              </p>
            </div>
            <ButtonLink href="/sign-up" variant="accent" size="lg">
              Create your account
            </ButtonLink>
          </div>
        </div>
      </section>
    </>
  );
}
