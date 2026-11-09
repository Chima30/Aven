import type { Metadata } from "next";
import { DecisionDemo } from "@/components/intelligence/decision-demo";
export const metadata: Metadata = { title: "Try Decision Replay" };
export default function DemoPage() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
      <div className="mb-8">
        <p className="text-accent mb-3 text-sm">No account required</p>
        <h1 className="type-page text-ink">See a decision change the next recommendation</h1>
        <p className="text-ink-muted mt-3">
          Decline a spending cut, choose your own target, or accept it. Then inspect the next
          scenario.
        </p>
      </div>
      <DecisionDemo />
    </section>
  );
}
