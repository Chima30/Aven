import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Privacy policy (draft)" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="31 October 2026">
      <section>
        <h2>Who we are</h2>
        <p>
          AVEN is a personal finance, wellbeing and planning application. This policy explains what
          information AVEN stores, why, and the control you have over it.
        </p>
      </section>
      <section>
        <h2>What we store today</h2>
        <ul>
          <li>
            <strong>Account details</strong> — your email address and a securely hashed password,
            managed by our authentication provider, Supabase.
          </li>
          <li>
            <strong>Profile and preferences</strong> — display name, country, currency, locale, time
            zone, appearance and notification settings.
          </li>
          <li>
            <strong>Consent history</strong> — each time you grant or withdraw a permission, so you
            and we can show exactly what you agreed to and when.
          </li>
          <li>
            <strong>Security log</strong> — events such as sign-ins, sign-outs, password changes,
            exports and privacy changes, visible to you in Settings.
          </li>
        </ul>
        <p>
          Financial, shared-expense, subscription, wellbeing and planning records will only be
          stored once those features launch and you add them yourself.
        </p>
      </section>
      <section>
        <h2>What we never do</h2>
        <ul>
          <li>Ask for your bank passwords, PINs or one-time codes.</li>
          <li>Move money or process payments.</li>
          <li>Sell your personal information.</li>
          <li>Send your data to an AI provider unless you switch AI features on and consent.</li>
        </ul>
      </section>
      <section>
        <h2>Health and wellbeing information</h2>
        <p>
          Wellbeing logs are sensitive. They will only be stored with your explicit consent, are
          visible only to you, and are included in your export and deleted with your account. AVEN
          is not a medical service and does not give medical advice.
        </p>
      </section>
      <section>
        <h2>Long-term memory (Walrus)</h2>
        <p>
          If you allow it, AVEN keeps short financial summaries — such as your budgeting style,
          categories you regularly overspend in, savings targets and how you responded to its
          recommendations — as long-term memory on Walrus (Mainnet), through the MemWal relayer,
          which encrypts each memory before storing it. Memories are written by AVEN&apos;s own
          code, never contain raw transactions, balances, account numbers or credentials, and sit in
          a private namespace that only your signed-in session can reach.
        </p>
        <p>
          You can see every stored memory, pause memory, or withdraw the permission at any time. The
          MemWal SDK does not support deleting from Walrus: when you forget a memory or delete your
          account, AVEN permanently stops using it, but the encrypted copy remains on Walrus.
        </p>
        <h2>AI providers</h2>
        <p>
          AVEN does not currently send your data to any AI provider. Its insights and
          recommendations are calculated by deterministic code from your own records.
        </p>
        <h2>Sui wallets</h2>
        <p>
          You may add public Sui Mainnet addresses. AVEN reads their balances and activity through
          Tatum on its server, never asks for keys and never signs or sends transactions. On-chain
          activity only becomes an AVEN transaction when you confirm it.
        </p>
      </section>
      <section>
        <h2>Where your data is stored</h2>
        <p>
          AVEN uses Supabase (database and authentication) and Vercel (hosting). Access to your
          records is restricted by row-level security so that only your account can read them.
        </p>
      </section>
      <section>
        <h2>Your rights and controls</h2>
        <ul>
          <li>Export your data as a JSON file at any time (Settings → Data).</li>
          <li>Withdraw any consent at any time (Settings → Privacy).</li>
          <li>
            Delete your account. This permanently removes your Supabase records. A minimal record
            that a deletion occurred is kept without any personal details.
          </li>
        </ul>
      </section>
      <section>
        <h2>On this device</h2>
        <p>
          To work offline, AVEN may keep changes you make on this device until they reach our
          servers. Signing out clears this information from the browser.
        </p>
      </section>
    </LegalPage>
  );
}
