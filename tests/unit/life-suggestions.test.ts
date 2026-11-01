import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/components/shell/nav-config";
import { planningSuggestionsFrom, wellbeingSuggestionsFrom } from "@/lib/life/suggestion-rules";
import type { RecalledMemory } from "@/lib/memory/types";
import { decisionLabel } from "@/lib/nudges/labels";

const memory = (
  kind: RecalledMemory["kind"],
  category: RecalledMemory["category"],
  facts: Record<string, string>,
): RecalledMemory => ({
  blobId: `blob-${kind}`,
  kind,
  category,
  observedOn: "2026-10-31",
  facts,
  summary: `${kind} summary`,
  distance: 0.1,
  createdAt: null,
});

const habit = {
  id: "h1",
  name: "Read",
  frequency: "daily" as const,
  weekdays: null,
  start_on: "2026-10-01",
  end_on: null,
  reminder_time: "07:00:00",
  archived_at: null,
};

describe("planning suggestions from Walrus memories", () => {
  it("suggests moving a reminder when the habit is usually done at another part of the day", () => {
    const out = planningSuggestionsFrom(
      [
        memory("habit_pattern", "memory_planning", {
          habit_key: "h1",
          consistency_band_pct: "40",
          usual_time: "evening",
          often_missed: "none",
        }),
      ],
      [habit],
      [],
      "2026-11-01",
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      title: "Move the Read reminder to the evening?",
      memory: { blobId: "blob-habit_pattern" },
    });
  });

  it("stays quiet when there is no memory, the habit is archived, or it's going well", () => {
    expect(planningSuggestionsFrom([], [habit], [], "2026-11-01")).toEqual([]);
    const m = memory("habit_pattern", "memory_planning", {
      habit_key: "h1",
      consistency_band_pct: "90",
      usual_time: "evening",
      often_missed: "none",
    });
    expect(planningSuggestionsFrom([m], [habit], [], "2026-11-01")).toEqual([]);
    const weak = { ...m, facts: { ...m.facts, consistency_band_pct: "30" } };
    expect(
      planningSuggestionsFrom(
        [weak],
        [{ ...habit, archived_at: "2026-10-30T00:00:00Z" }],
        [],
        "2026-11-01",
      ),
    ).toEqual([]);
  });

  it("current records override an outdated memory", () => {
    const m = memory("habit_pattern", "memory_planning", {
      habit_key: "h1",
      consistency_band_pct: "30",
      usual_time: "evening",
      often_missed: "none",
    });
    const checkIns = Array.from({ length: 14 }, (_, i) => ({
      habit_id: "h1",
      on_date: `2026-10-${String(18 + i).padStart(2, "0")}`,
      status: "done" as const,
    }));
    expect(planningSuggestionsFrom([m], [habit], checkIns, "2026-11-01")).toEqual([]);
  });
});

describe("wellbeing suggestions", () => {
  it("only suggests a routine (never medical advice) when sleep is under target", () => {
    const sleep = memory("sleep_pattern", "memory_wellbeing", {
      average_sleep_minutes: "360",
      usual_bedtime: "00:30",
    });
    const out = wellbeingSuggestionsFrom(
      [sleep],
      { water_target_ml: 2000, sleep_target_minutes: 480 },
      false,
    );
    expect(out).toHaveLength(1);
    expect(out[0]!.body).toContain("isn't medical advice");
    expect(
      wellbeingSuggestionsFrom(
        [sleep],
        { water_target_ml: 2000, sleep_target_minutes: 380 },
        false,
      ),
    ).toEqual([]);
  });

  it("doesn't suggest a hydration habit the user already has", () => {
    const water = memory("water_pattern", "memory_wellbeing", { target_met_band_pct: "30" });
    expect(
      wellbeingSuggestionsFrom(
        [water],
        { water_target_ml: 2000, sleep_target_minutes: 480 },
        false,
      ),
    ).toHaveLength(1);
    expect(
      wellbeingSuggestionsFrom([water], { water_target_ml: 2000, sleep_target_minutes: 480 }, true),
    ).toEqual([]);
  });
});

describe("Nudge Center", () => {
  it("explains every held-back nudge in plain words", () => {
    expect(
      decisionLabel({
        status: "delivered",
        decision_reason: null,
        digest: null,
        scheduled_for: null,
      }),
    ).toBeNull();
    expect(
      decisionLabel({
        status: "scheduled",
        decision_reason: "quiet_hours",
        digest: null,
        scheduled_for: null,
      }),
    ).toMatch(/quiet hours/);
    expect(
      decisionLabel({
        status: "bundled",
        decision_reason: "category_frequency",
        digest: "weekly",
        scheduled_for: null,
      }),
    ).toMatch(/weekly summary/);
    expect(
      decisionLabel({
        status: "suppressed",
        decision_reason: "category_off",
        digest: null,
        scheduled_for: null,
      }),
    ).toMatch(/turned this category off/);
  });

  it("Planning, Nudge Center and Wellbeing are real links (no LATER labels)", () => {
    for (const label of ["Planning", "Nudge Center", "Wellbeing"]) {
      const item = NAV_ITEMS.find((i) => i.label === label);
      expect(item?.href).toBeTruthy();
      expect(item?.comingLater).toBeUndefined();
    }
  });
});
