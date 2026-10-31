# Deploy to Vercel (browser only)

Do the [Supabase setup](SUPABASE_SETUP.md) steps 1–3 and the [GitHub upload](GITHUB_UPLOAD.md)
first.

## 1. Import the project

1. Go to <https://vercel.com/new> and sign in with GitHub.
2. Find `Chima30/aven` → **Import**. (If it's missing, click **Adjust GitHub App
   Permissions** and give Vercel access to the repo.)
3. Framework preset: **Next.js** (detected automatically). Leave the build settings as they are.

## 2. Add environment variables

Still on the import screen, open **Environment Variables** and add each of these. Paste values
straight from Supabase, not from a chat.

| Name                                   | Value                              | Notes                                                  |
| -------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`             | Supabase Project URL               | e.g. `https://abcd1234.supabase.co`                    |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key `sb_publishable_…` | Safe for browsers                                      |
| `NEXT_PUBLIC_SITE_URL`                 | `https://aven.vercel.app` for now  | Update in step 4 if your address differs               |
| `SUPABASE_SECRET_KEY`                  | Secret key `sb_secret_…`           | **Server only.** Never add `NEXT_PUBLIC_` to this name |

Leave all three environments ticked: Production, Preview and Development.

Click **Deploy** and wait for "Congratulations".

## 3. Find your real address

On the project page, under **Domains**, copy the address (e.g. `https://aven-chima30.vercel.app`).

## 4. Point everything at that address

1. Vercel → **Settings → Environment Variables** → edit `NEXT_PUBLIC_SITE_URL` to your exact
   address (no trailing slash) → Save.
2. Vercel → **Deployments** → on the latest one, click **⋯ → Redeploy**. This is needed because
   `NEXT_PUBLIC_…` values are built into the app at deploy time.
3. Supabase → do [step 4 (URLs)](SUPABASE_SETUP.md#4-urls-do-this-after-your-first-vercel-deploy-gives-you-a-web-address)
   and [step 5 (email templates)](SUPABASE_SETUP.md#5-email-templates-recommended).

## 5. Smoke test (about 5 minutes)

1. Open your address. The landing page loads.
2. Create an account. You should land on "Check your email".
3. Click the email link. You should land on **Overview**, greeted by name.
4. Settings → Regional: choose your currency and time zone → Save. A green toast appears.
5. Settings → Privacy: allow, then withdraw, "Store wellbeing information". Both appear in the
   consent history.
6. Settings → Your data → **Download my data**. A JSON file downloads.
7. Settings → Security → **Sign out everywhere**. You land on sign-in with a confirmation.
8. Optional: create a throw-away account and delete it from Settings → Your data. You return
   to the home page with a "deleted" banner, and the user disappears from Supabase →
   Authentication → Users.

If a step fails, note which step it was and the exact message, and share it with me. Don't
send keys or passwords.

## Troubleshooting

| Symptom                                                 | Likely cause                                                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Sign-in page says "AVEN isn't configured yet"           | Supabase variables missing in Vercel → add them and redeploy                                      |
| "That link didn't work" after clicking the email        | Redirect URL not added in Supabase, or `NEXT_PUBLIC_SITE_URL` wrong, or the link was already used |
| "Your AVEN profile could not be loaded"                 | The SQL setup wasn't run on this Supabase project                                                 |
| Sign-out or export returns "Cross-site request refused" | `NEXT_PUBLIC_SITE_URL` doesn't match the address you're using                                     |
| No confirmation email                                   | Supabase's built-in email hourly limit. Wait, or set up custom SMTP                               |

## Preview deployments

Every GitHub branch or pull request gets its own preview URL on Vercel. To sign in on a preview,
add `https://*-chima30s-projects.vercel.app/**` (adjust to your team slug) to Supabase Redirect
URLs. Preview and production share the same Supabase project unless you create another one.
