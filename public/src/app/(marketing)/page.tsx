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
    body: "Accounts, budgets and savings goals that inform each other — so a savings target can shape what AVEN suggests about spending.",
  },
  {
    title: "Shared bills, settled fairly",
    body: "Split costs with housemates and family, see who owes whom, and mark settlements complete only when everyone confirms.",
  },
  {
    title: "Subscriptions in the open",
    body: "Every recurring cost, its next renewal and its real monthly and yearly impact on your budget.",
  },
  {
    title: "Wellbeing and routines",
    body: "Sleep, water, meals, movement and habits — private to you, and never treated as medical advice.",
  },
  {
    title: "Days that plan themselves",
    body: "Tasks, reminders and weekly reviews that take your routines and commitments into account.",
  },
  {
    title: "A calm daily Pulse Check",
    body: "Instead of a stream of alerts, the things that matter are bundled into one update — on your schedule, never in your quiet hours.",
  },
];

const PRINCIPLES = [
  {
    title: "You decide what AVEN remembers",
    body: "Memory is switched off by default and controlled category by category. You'll be able to see, correct and delete what it keeps.",
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
    body: "AVEN is being built offline-first, so logging an expense on a slow network never means losing it.",
  },
];

const ROADMAP: Array<{ stage: string; title: string; status: "live" | "next" | "planned" }> = [
  { stage: "1", title: "Secure accounts, settings, privacy and consent controls", status: "live" },
  {
    stage: "2",
    title: "Accounts, transactions, budgets and savings goals — offline too",
    status: "live",
  },
  { stage: "3", title: "Subscriptions, planning and the Nudge Center", status: "next" },
  { stage: "4", title: "Shared expenses", status: "planned" },
  { stage: "5", title: "Wellbeing", status: "planned" },
  { stage: "6", title: "Personal agent and Walrus Memory", status: "planned" },
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

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-14 pb-20 sm:px-8 md:pt-20 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <Badge tone="accent">Early access · Stage 2</Badge>
          <h1 className="type-display text-ink mt-5">
            Your money, wellbeing and plans —{" "}
            <span className="text-accent">finally talking to each other.</span>
          </h1>
          <p className="text-ink-muted mt-6 max-w-xl text-lg leading-relaxed">
            AVEN is a personal operating system for everyday life. It connects your finances, shared
            bills, subscriptions, routines and goals, with a personal assistant that only knows what
            you allow it to.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/sign-up" size="lg">
              Create your account
            </ButtonLink>
            <ButtonLink href="#roadmap" size="lg" variant="secondary">
              See what&apos;s ready
            </ButtonLink>
          </div>
          <p className="text-ink-subtle mt-5 text-sm">
            Free while in early access. Works with any currency, from NGN to USD, EUR, JPY and KWD.
          </p>
        </div>
        <div className="flex justify-center lg:justify-end">
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
              <div key={item.title}>
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
              <div key={p.title} className="bg-surface p-6">
                <dt className="text-ink font-semibold">{p.title}</dt>
                <dd className="text-ink-muted mt-2 text-sm leading-relaxed">{p.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="roadmap" className="border-line bg-surface scroll-mt-20 border-t">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="type-eyebrow text-accent">Honest roadmap</p>
          <h2 className="type-page mt-3 text-[2rem]">What works today, and what comes next.</h2>
          <p className="text-ink-muted mt-3 max-w-2xl">
            AVEN is built in stages. Each one is finished and tested before the next begins, and
            features that aren&apos;t ready are labelled — never faked.
          </p>
          <ol className="divide-line border-line mt-10 divide-y rounded-2xl border">
            {ROADMAP.map((r) => (
              <li key={r.stage} className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <span className="type-figure text-ink-subtle w-16 shrink-0 text-sm">
                  Stage {r.stage}
                </span>
                <span className="text-ink flex-1 text-sm font-medium">{r.title}</span>
                {r.status === "live" ? (
                  <Badge tone="success">Available</Badge>
                ) : r.status === "next" ? (
                  <Badge tone="info">Next</Badge>
                ) : (
                  <Badge>Planned</Badge>
                )}
              </li>
            ))}
          </ol>
          <div className="bg-primary text-primary-fg mt-12 flex flex-col items-start justify-between gap-6 rounded-2xl px-6 py-8 sm:flex-row sm:items-center sm:px-10">
            <div>
              <h3 className="text-xl font-semibold">Set up your foundation today.</h3>
              <p className="mt-1 text-sm opacity-80">
                Choose your currency, time zone and privacy choices now, and every new module will
                use them.
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
