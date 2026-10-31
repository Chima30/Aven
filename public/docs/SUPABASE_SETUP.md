# Supabase setup (browser only)

You'll create a **new, empty** Supabase project for AVEN. Don't reuse a project from an earlier
build. Supabase occasionally renames menu items; if a label differs slightly, look for the
closest match.

## 1. Create the project

1. Go to <https://supabase.com/dashboard> and sign in.
2. Click **New project**.
3. Name: `aven`. Database password: click **Generate a password** and save it in your password
   manager. (AVEN doesn't need it, so don't share it with anyone or paste it into a chat.)
4. Region: choose the one closest to most of your users (for example, Europe West for
   Nigeria/UK users).
5. Click **Create new project** and wait 1–2 minutes.

## 2. Create the database tables (one paste)

**Which file?**

| Your situation                                  | Run this file, once                          |
| ----------------------------------------------- | -------------------------------------------- |
| Brand-new, empty Supabase project               | `supabase/setup_all_in_one.sql` (all stages) |
| You already ran the Stage 1 SQL on this project | `supabase/upgrades/stage2.sql` only          |

Not sure? Open **Table Editor**. If you see `profiles` but no `transactions`, you have
Stage 1, so run the upgrade. If you see no tables at all, run the full setup.

1. In the left sidebar, open **SQL Editor** → **New query**.
2. Open the right file from the AVEN files. On GitHub, open the file and click **Copy raw file**.
3. Paste everything into the editor and click **Run**.
4. You should see **"Success. No rows returned."** If you see an error, copy the error message
   and share it with me. The whole script runs as one unit, so a failure changes nothing.
5. Check: open **Table Editor**. You should see 23 tables, including `profiles`,
   `financial_accounts`, `transactions` and `budgets`, each with an **RLS enabled** label.

> Run each file **once**. Running one again fails with "already exists", which is harmless
> and changes nothing. The Stage 2 upgrade keeps all existing users and data, and gives
> existing users the default categories. Developers can instead apply
> `supabase/migrations/*.sql` in order with the Supabase CLI. Use one method, not both.

## 3. Email and password sign-in

1. Go to **Authentication** → **Sign In / Providers** → **Email**.
2. Make sure **Enable Email provider** and **Confirm email** are both **on**.
3. Set **Minimum password length** to `10`. AVEN enforces 10 as well.
4. If you see **Secure password change**, leave it **off**. AVEN checks the current password
   itself before any change.
5. Save.

## 4. URLs (do this after your first Vercel deploy gives you a web address)

1. Go to **Authentication** → **URL Configuration**.
2. **Site URL**: your Vercel address, e.g. `https://aven.vercel.app`. No trailing slash.
3. **Redirect URLs** → **Add URL** for each of:
   - `https://aven.vercel.app/auth/confirm` (use your real address)
   - `http://localhost:3000/auth/confirm` (only if you'll run AVEN on a computer)
4. Save.

## 5. Email templates (recommended)

These make confirmation links work even when someone opens the email on a different device.

Go to **Authentication** → **Emails** (or **Email Templates**).

**Confirm signup.** Replace the link in the template body with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/overview"
  >Confirm your email</a
>
```

**Reset password.** Replace the link with:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password"
  >Choose a new password</a
>
```

Click **Save** for each template. AVEN also works with the default templates, but those links
only work in the same browser the person signed up in.

## 6. Find your keys (you'll paste them into Vercel, never into chat)

Go to **Project Settings** → **API Keys** (and **Data API** for the URL).

| Value                                        | Where                       | Goes into Vercel as                    |
| -------------------------------------------- | --------------------------- | -------------------------------------- |
| Project URL (`https://xxxx.supabase.co`)     | Project Settings → Data API | `NEXT_PUBLIC_SUPABASE_URL`             |
| Publishable key (`sb_publishable_…`)         | API Keys                    | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| Secret key (`sb_secret_…`), click **Reveal** | API Keys                    | `SUPABASE_SECRET_KEY`                  |

If your project only shows **legacy** keys, use `anon` for the publishable key and
`service_role` for the secret key.

## 7. Before real users (not needed for testing)

Supabase's built-in email sender only allows a small number of emails per hour. Before you
invite real users, set up custom SMTP under **Authentication** → **Emails** → **SMTP
Settings**. This is planned for Stage 8.
