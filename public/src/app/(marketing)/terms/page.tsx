import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";

export const metadata: Metadata = { title: "Terms of use (draft)" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" updated="31 October 2026">
      <section>
        <h2>Early access</h2>
        <p>
          AVEN is in early access and is being built in stages. Features marked as coming later are
          not yet available. We may change or remove features as the product develops.
        </p>
      </section>
      <section>
        <h2>Your account</h2>
        <p>
          You are responsible for keeping your password safe and for the information you add. You
          must be old enough to form a binding agreement where you live.
        </p>
      </section>
      <section>
        <h2>Not financial, legal or medical advice</h2>
        <p>
          AVEN helps you organise information and may offer suggestions. It is not a bank, does not
          move money, and does not provide financial, legal, tax or medical advice. Decisions you
          make remain your own.
        </p>
      </section>
      <section>
        <h2>Shared expenses</h2>
        <p>
          When shared expenses launch, AVEN will record and track settlements between people. It
          will not transfer money. A settlement is only marked complete when the people involved
          confirm it.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <p>
          Don&apos;t try to access other people&apos;s data, disrupt the service, or use AVEN for
          anything unlawful.
        </p>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>
          You can export your data and delete your account at any time from Settings. We may suspend
          accounts that break these terms.
        </p>
      </section>
      <section>
        <h2>Liability</h2>
        <p>
          AVEN is provided as is during early access. To the extent the law allows, we are not
          liable for indirect losses arising from its use.
        </p>
      </section>
    </LegalPage>
  );
}
