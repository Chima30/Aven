import type { ConsentCategory } from "@/lib/supabase/database.types";

/**
 * Plain-language descriptions for each consent category.
 * Whether a category can be granted is decided by the DATABASE
 * (public.consent_categories.is_available), not by this file.
 */
export interface ConsentCopy {
  title: string;
  description: string;
  group: "ai" | "wellbeing" | "memory";
  /** Shown while the category is not yet available. */
  unavailableNote: string;
}

export const CONSENT_COPY: Record<ConsentCategory, ConsentCopy> = {
  ai_processing: {
    title: "Send data to the AI assistant",
    description:
      "Allows AVEN to send the parts of your data needed to answer a question to Anthropic's API. Used only when AI features are switched on and you ask the assistant something.",
    group: "ai",
    unavailableNote:
      "AVEN does not use an AI provider yet; its insights are calculated deterministically.",
  },
  wellbeing_data: {
    title: "Store wellbeing information",
    description:
      "Allows AVEN to store the sleep, water, meal, activity and mood logs (including Pulse Checks) that you enter. Only you can see them, and withdrawing this stops new logs. AVEN is not a medical service and never diagnoses.",
    group: "wellbeing",
    unavailableNote: "Wellbeing tracking isn't available right now.",
  },
  memory_financial: {
    title: "Remember financial context",
    description:
      "Lets AVEN keep short summaries — budgeting style, regularly overspent categories, savings targets and performance, income patterns, subscriptions, and how you responded to its recommendations — as encrypted long-term memory in Walrus. Never raw transactions, balances, account numbers or credentials.",
    group: "memory",
    unavailableNote: "Walrus Memory isn't available right now.",
  },
  memory_shared_expenses: {
    title: "Remember shared-expense context",
    description: "Lets AVEN remember recurring household costs and group preferences.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
  memory_wellbeing: {
    title: "Remember wellbeing routines",
    description:
      "Lets AVEN keep short pattern summaries — usual bedtime and average sleep, how often you meet your water target, activity routine, meal-logging routine and broad mood trends — as encrypted memory in Walrus, and use them for suggestions. Never individual logs, notes or meal descriptions, and never medical conclusions.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
  memory_planning: {
    title: "Remember planning preferences",
    description:
      "Lets AVEN keep short summaries of how you plan — when you usually complete habits, your preferred time of day, review and reminder timing, and focus notes you choose to save — as encrypted memory in Walrus, and use them for suggestions. Never task titles or calendar details.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
  memory_interactions: {
    title: "Remember assistant conversations",
    description:
      "Lets AVEN keep useful decisions and corrections from your conversations with the assistant.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
};

function memoryNote(): string {
  return "Not available yet.";
}

/**
 * Shown, and acknowledged, before the financial memory permission can be
 * granted. These are facts about the integration, not marketing.
 */
export const WALRUS_MEMORY_DISCLOSURES: readonly string[] = [
  "Memories are short summaries written by AVEN's own code, stored on Walrus (Mainnet) through the official MemWal relayer, which encrypts them before storage.",
  "AVEN's server holds the key that writes and reads these memories. Your memories sit in a private namespace that only your signed-in session can reach.",
  "You can see every memory AVEN has stored, pause memory, or withdraw this permission at any time. Withdrawing or pausing stops all new memories and all recall immediately.",
  "Deleting from Walrus is not supported by the MemWal SDK. When you forget a memory — or delete your account — AVEN permanently stops using it, but the encrypted copy stays on Walrus.",
  "AVEN never stores bank credentials, passwords, card or account numbers, wallet keys or raw transactions in memory.",
];

export const CONSENT_ORDER: readonly ConsentCategory[] = [
  "ai_processing",
  "wellbeing_data",
  "memory_financial",
  "memory_shared_expenses",
  "memory_wellbeing",
  "memory_planning",
  "memory_interactions",
];
