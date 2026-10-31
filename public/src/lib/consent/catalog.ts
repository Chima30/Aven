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
    unavailableNote: "The AI assistant arrives in Stage 6.",
  },
  wellbeing_data: {
    title: "Store wellbeing information",
    description:
      "Allows AVEN to store sleep, water, meal and exercise logs you enter. Only you can see them. AVEN is not a medical service.",
    group: "wellbeing",
    unavailableNote: "Wellbeing tracking arrives in Stage 5.",
  },
  memory_financial: {
    title: "Remember financial context",
    description:
      "Lets AVEN keep summaries such as spending patterns and savings progress as long-term memory — never raw transactions.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
  memory_shared_expenses: {
    title: "Remember shared-expense context",
    description: "Lets AVEN remember recurring household costs and group preferences.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
  memory_wellbeing: {
    title: "Remember wellbeing routines",
    description: "Lets AVEN remember routines and goals, such as your usual sleep schedule.",
    group: "memory",
    unavailableNote: memoryNote(),
  },
  memory_planning: {
    title: "Remember planning preferences",
    description: "Lets AVEN remember how you like to plan your days and weeks.",
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
  return "Locked until Stage 6. Before you can switch this on, AVEN will tell you exactly how memories stored in Walrus can be reviewed, corrected and deleted — including any limits.";
}

export const CONSENT_ORDER: readonly ConsentCategory[] = [
  "ai_processing",
  "wellbeing_data",
  "memory_financial",
  "memory_shared_expenses",
  "memory_wellbeing",
  "memory_planning",
  "memory_interactions",
];
