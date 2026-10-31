import type { MemoryStore } from "./types";

export class MemoryUnavailableError extends Error {
  constructor() {
    super(
      "Walrus Memory is not enabled. It will be integrated in Stage 6 after its deletion and access behaviour is verified.",
    );
    this.name = "MemoryUnavailableError";
  }
}

/**
 * The only MemoryStore in Stage 1. Every call fails loudly, so no code path
 * can accidentally believe a memory was saved.
 */
export const disabledMemoryStore: MemoryStore = {
  backend: "disabled",
  async write() {
    throw new MemoryUnavailableError();
  },
  async search() {
    throw new MemoryUnavailableError();
  },
  async correct() {
    throw new MemoryUnavailableError();
  },
  async delete() {
    throw new MemoryUnavailableError();
  },
};

/** Honest status shown in Settings → Privacy. */
export const MEMORY_BACKEND_STATUS = {
  backend: "disabled",
  writesEnabled: false,
  verified: {
    sdkAndAuth: false,
    encryption: false,
    retrieval: false,
    accessRevocation: false,
    deletion: false,
  },
} as const;
