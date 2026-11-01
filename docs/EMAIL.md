# Email notifications

Optional. Each user decides in **Settings → Notifications → Email** (off by default) and picks
what to receive:

- **Daily and weekly summaries, plus important alerts** (default), or
- **Everything that reaches my Nudge Center**.

Email only repeats what is already in the Nudge Center: the same rules, quiet hours and daily
limit apply, nothing is ever emailed twice (rows are claimed before sending), nudges you already
read in the app are skipped, and only nudges from the last 3 hours are sent (no surprise
backlog when you switch it on). Failed sends are retried on the next run, up to 3 times. Every
email links to the settings page to turn it off.

Emails are sent by the background scheduler (SCHEDULER.md) — so `CRON_SECRET` and the GitHub
schedule need to be set up too.

## Set up (site owner, no terminal)

AVEN uses plain SMTP, so any provider works. The quickest is your own Gmail:

1. Turn on 2-Step Verification for the Google account.
2. Go to **myaccount.google.com/apppasswords**, create an app password called "AVEN", and copy
   the 16 letters. (This is not your normal password, and you can revoke it any time.)
3. In **Vercel → Settings → Environment Variables** add:

| Name            | Value                       |
| --------------- | --------------------------- |
| `SMTP_HOST`     | `smtp.gmail.com`            |
| `SMTP_PORT`     | `465`                       |
| `SMTP_USER`     | your Gmail address          |
| `SMTP_PASSWORD` | the 16-letter app password  |
| `EMAIL_FROM`    | `AVEN <your Gmail address>` |

4. Redeploy. Settings → Integrations should show **Email (SMTP): Configured**.
5. Settings → Notifications → turn Email on → Save → **Send a test email**.

Gmail allows about 500 emails a day — plenty for a personal or demo deployment. For a public
launch use a provider with your own domain (Resend: `smtp.resend.com`, port 465, user `resend`,
password = API key; Brevo: `smtp-relay.brevo.com`, port 587). Emails from a Gmail address sent
by an app can land in spam the first time — mark one as "Not spam".

## Security

- SMTP credentials are server-only environment variables, validated on start (values are never
  echoed in errors) and recognised by the secret scanner.
- `EMAIL_FROM` is checked for line breaks (no header injection); subjects are stripped of line
  breaks; email HTML escapes every value; only AVEN's own paths become links.
- Addresses come from Supabase Auth (confirmed addresses only) and are never logged.
- Users can switch email on/off and choose the mode (column grant on two columns only); they
  can't change `emailed_at` / `email_attempts`.
- Sending a test email is limited to 3 per hour per user.
