# Optional contextual companion — design and integration boundary

AVEN currently uses deterministic intelligence. No AI provider is configured or called by the
application. `lib/intelligence/companion.ts` is a tested extension contract, not a live chatbot.
No new credentials or environment variables are required for this release.

A future server-only provider adapter can implement `CompanionProvider.explain`. Before enabling
it, a server action must verify the session, reload `ai_enabled` and `ai_processing` consent,
apply `ai_quota_status`, rate limits and usage accounting, and construct a minimum authorized
fact set from RLS-scoped loaders. Do not accept client-supplied balances or consent flags.
Never include raw notes, memory text, wellbeing records or financial account identifiers by
default. Obtain specific consent for any chosen context and disclose the provider and retention.

The model receives labelled deterministic facts; it can explain them and cite their stable ids.
It cannot call tools or change records. Figures in a future UI must be rendered directly from
validated facts, independently of model prose. Citation validation cannot prove the model's
language is true: output remains untrusted and needs grounding/evaluation before release.
Provider output must never become an arithmetic input, saved recommendation or memory candidate.
Timeout/failure returns an unavailable status without exposing provider error details.

Required before shipping an actual adapter: primary provider documentation review, server-side
credential configuration, privacy disclosure updates, scoped consent controls, injection and
cross-user tests, real credentialed integration checks and explicit release review. There is
no AI-enabled route, UI control, external request or quota consumption in this change.
