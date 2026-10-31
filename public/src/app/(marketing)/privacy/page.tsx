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
        <h2>The personal assistant and memory</h2>
        <p>
          The AI assistant (planned) will use Anthropic&apos;s API, only when you have switched AI
          on and given consent. AVEN&apos;s long-term memory (planned) will use Walrus. Memory
          categories are locked until we have verified — and told you — exactly how stored memories
          can be reviewed, corrected and deleted, including any limitations. Nothing has been
          written to Walrus.
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
