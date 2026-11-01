"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { TransactionForm, type TxAccountOption, type TxCategoryOption } from "./transaction-form";

/** "Add transaction" button + dialog. Works offline once the page has loaded. */
export function AddTransaction({
  userId,
  accounts,
  categories,
  decimal,
  today,
  defaultAccountId,
  label = "Add transaction",
  size = "md",
}: {
  userId: string;
  accounts: TxAccountOption[];
  categories: TxCategoryOption[];
  decimal: "." | ",";
  today: string;
  defaultAccountId?: string;
  label?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size={size} onClick={() => setOpen(true)}>
        <span aria-hidden="true" className="text-base leading-none">
          +
        </span>
        {label}
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New transaction"
        className="max-w-xl"
      >
        {open ? (
          <TransactionForm
            userId={userId}
            accounts={accounts}
            categories={categories}
            decimal={decimal}
            today={today}
            defaultAccountId={defaultAccountId}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </Dialog>
    </>
  );
}
