"use client";

import { useEffect } from "react";
import { putCache } from "@/lib/offline/db";
import { rememberCurrentUser, sharedDb } from "@/lib/offline/controller";

export interface CachedReferenceData {
  accounts: Array<{ id: string; name: string; currency: string; archived: boolean }>;
  categories: Array<{ id: string; kind: "income" | "expense"; name: string; archived: boolean }>;
  decimal: "." | ",";
  locale: string;
  defaultCurrency: string;
}

/**
 * Keeps a copy of the user's accounts and categories on this device, so the
 * offline page can still offer transaction entry. Cleared on sign-out.
 */
export function FinanceCacheWriter({
  userId,
  data,
}: {
  userId: string;
  data: CachedReferenceData;
}) {
  useEffect(() => {
    if (!("indexedDB" in window)) return;
    void (async () => {
      await rememberCurrentUser(userId);
      await putCache(await sharedDb(), userId, "finance_reference", data);
    })().catch(() => undefined);
  }, [userId, data]);
  return null;
}
