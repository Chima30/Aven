"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { AmountError, decimalSeparatorFor, parsePositiveAmount } from "@/lib/finance/amount-input";
import { isValidIsoDate } from "@/lib/finance/periods";
import { formValue, type FormState } from "@/lib/forms";
import { isCurrencyCode, type CurrencyCode } from "@/lib/money/currencies";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { isSuiDigest, parseSuiAddress } from "@/lib/sui/address";
import { SuiProviderError } from "@/lib/sui/reader";
import { suiRuntime } from "@/lib/sui/runtime";
import { SUI_ERROR_COPY } from "@/lib/sui/service";
import { createClient } from "@/lib/supabase/server";

const SESSION_EXPIRED: FormState = {
  status: "error",
  message: "Your session has expired. Please sign in again.",
};
const RATE_LIMITED: FormState = {
  status: "error",
  message: "Too many requests in a short time. Please wait a few minutes.",
};

async function session() {
  const user = await getCurrentUser();
  if (!user) return null;
  return { user, supabase: await createClient() };
}

export async function addWalletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const rawAddress = formValue(formData, "address");
  const label = formValue(formData, "label").trim();
  const address = parseSuiAddress(rawAddress);
  const values = { address: rawAddress, label };
  if (!address) {
    return {
      status: "error",
      values,
      fieldErrors: {
        address: "Enter a Sui address: 0x followed by up to 64 hexadecimal characters.",
      },
    };
  }
  if (label.length > 60) {
    return { status: "error", values, fieldErrors: { label: "Use 60 characters or fewer." } };
  }
  if (!(await consumeRateLimit(ctx.supabase, "wallet_change"))) return RATE_LIMITED;

  const { error } = await ctx.supabase
    .from("sui_wallets")
    .insert({ user_id: ctx.user.id, address, label: label || null });
  if (error) {
    if (error.code === "23505") {
      return {
        status: "error",
        values,
        fieldErrors: { address: "You've already added this wallet." },
      };
    }
    if (error.code === "23514") {
      return { status: "error", values, message: "You can add up to 5 wallets." };
    }
    return { status: "error", values, message: "The wallet couldn't be saved. Please try again." };
  }
  revalidatePath("/money/wallets");
  return {
    status: "success",
    message: "Wallet added. AVEN only reads public data; it can never move funds.",
  };
}

export async function removeWalletAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const id = z.uuid().safeParse(formValue(formData, "id"));
  if (!id.success) return { status: "error", message: "That wallet wasn't found." };
  const { error } = await ctx.supabase.from("sui_wallets").delete().eq("id", id.data);
  if (error) return { status: "error", message: "The wallet couldn't be removed." };
  revalidatePath("/money/wallets");
  return { status: "success", message: "Wallet removed. Transactions you imported stay in AVEN." };
}

const importSchema = z.object({
  walletId: z.uuid(),
  digest: z.string().refine(isSuiDigest, "Invalid transaction digest"),
  accountId: z.uuid({ message: "Choose an account." }),
  categoryId: z.uuid().optional(),
  kind: z.enum(["income", "expense"]),
  occurredOn: z.string().refine(isValidIsoDate, "Choose a valid date."),
  description: z.string().trim().max(200).optional(),
});

/**
 * Records a confirmed on-chain transaction as an AVEN transaction.
 * - The digest is re-checked on Sui Mainnet (via Tatum) for this wallet.
 * - The AMOUNT is entered by the user in the account's currency: AVEN has no
 *   price feed and never invents an exchange rate.
 * - import_chain_transaction() refuses a digest imported before and asks for
 *   confirmation if a matching transaction already exists.
 */
export async function importChainTransactionAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await session();
  if (!ctx) return SESSION_EXPIRED;
  const values = {
    amount: formValue(formData, "amount"),
    description: formValue(formData, "description"),
    occurredOn: formValue(formData, "occurredOn"),
    accountId: formValue(formData, "accountId"),
    categoryId: formValue(formData, "categoryId"),
    kind: formValue(formData, "kind"),
  };
  const parsed = importSchema.safeParse({
    walletId: formValue(formData, "walletId"),
    digest: formValue(formData, "digest"),
    accountId: values.accountId,
    categoryId: values.categoryId || undefined,
    kind: values.kind,
    occurredOn: values.occurredOn,
    description: values.description || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { status: "error", values, message: issue?.message ?? "Check the form and try again." };
  }
  const input = parsed.data;
  if (!(await consumeRateLimit(ctx.supabase, "chain_import"))) return RATE_LIMITED;

  const [{ data: wallet }, { data: account }, { data: prefs }] = await Promise.all([
    ctx.supabase.from("sui_wallets").select("id, address").eq("id", input.walletId).maybeSingle(),
    ctx.supabase
      .from("financial_accounts")
      .select("id, currency_code, archived_at")
      .eq("id", input.accountId)
      .maybeSingle(),
    ctx.supabase.from("user_preferences").select("locale, number_format").maybeSingle(),
  ]);
  if (!wallet) return { status: "error", values, message: "That wallet wasn't found." };
  if (!account || account.archived_at) {
    return { status: "error", values, fieldErrors: { accountId: "Choose an active account." } };
  }
  if (!isCurrencyCode(account.currency_code)) {
    return { status: "error", values, message: "That account's currency isn't supported." };
  }

  let amountMinor: number;
  try {
    const money = parsePositiveAmount(
      values.amount,
      account.currency_code as CurrencyCode,
      prefs ? decimalSeparatorFor(prefs.locale, prefs.number_format) : ".",
    );
    amountMinor = Number(money.amountMinor);
  } catch (error) {
    return {
      status: "error",
      values,
      fieldErrors: { amount: error instanceof AmountError ? error.message : "Enter an amount." },
    };
  }

  // Confirm the transaction exists on Sui Mainnet and involves this wallet.
  const runtime = suiRuntime();
  if (!runtime.available) {
    return { status: "error", values, message: "Sui access isn't configured on this server." };
  }
  try {
    const tx = await runtime.service.transaction(input.digest, wallet.address);
    if (!tx)
      return { status: "error", values, message: "That transaction wasn't found on Sui Mainnet." };
    if (tx.changes.length === 0) {
      return {
        status: "error",
        values,
        message:
          "That transaction didn't change this wallet's balances, so it can't be imported for it.",
      };
    }
  } catch (error) {
    const kind = error instanceof SuiProviderError ? error.kind : "unknown";
    return { status: "error", values, message: SUI_ERROR_COPY[kind] };
  }

  const transactionId = randomUUID();
  const { data, error } = await ctx.supabase.rpc("import_chain_transaction", {
    p_mutation_id: randomUUID(),
    p_wallet_id: wallet.id,
    p_tx_digest: input.digest,
    p_transaction_id: transactionId,
    p_confirm_duplicate: formValue(formData, "confirmDuplicate") === "yes",
    p_payload: {
      kind: input.kind,
      account_id: account.id,
      amount_minor: amountMinor,
      currency_code: account.currency_code,
      category_id: input.categoryId ?? null,
      description: input.description ?? "Sui Mainnet transaction",
      merchant: null,
      notes: `Imported from Sui Mainnet transaction ${input.digest}`,
      occurred_on: input.occurredOn,
    },
  });
  if (error || !data) {
    return {
      status: "error",
      values,
      message: "The transaction couldn't be imported. Please try again.",
    };
  }
  switch (data.status) {
    case "imported":
      revalidatePath("/money", "layout");
      return {
        status: "success",
        message: "Imported into AVEN. You can edit it like any transaction.",
      };
    case "duplicate_digest":
      return { status: "error", values, message: "You've already imported this Sui transaction." };
    case "possible_duplicate":
      return {
        status: "error",
        values: { ...values, needsConfirm: "yes" },
        message: `AVEN already has ${data.matches.length} transaction${data.matches.length === 1 ? "" : "s"} in this account with the same amount within a day (${data.matches
          .map((m) => `${m.occurred_on}${m.description ? ` “${m.description}”` : ""}`)
          .join(
            ", ",
          )}). If this is a different transaction, tick “Import anyway” and submit again.`,
      };
    case "rejected":
      return { status: "error", values, message: data.message };
  }
}
