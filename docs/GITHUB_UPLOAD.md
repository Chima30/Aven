# Upload AVEN to GitHub (`Chima30/aven`)

The ZIP contains the project files **at its top level**: `package.json`, `src/`, `docs/` and
so on, with no outer folder. Those files must end up at the top of the repository.

## Option A: GitHub Desktop (easiest, recommended)

GitHub's website accepts at most **100 files per upload**, and AVEN has more than that.
GitHub Desktop has no file limit and keeps hidden files such as `.github` and `.gitignore`.

1. Install GitHub Desktop from <https://desktop.github.com> and sign in as `Chima30`.
2. **File → Clone repository** → choose `Chima30/aven` → pick a folder → **Clone**.
3. Unzip `aven-stage1.zip`. Copy **everything inside it** into the cloned `aven` folder, so
   `package.json` sits directly inside `aven/`.
   - On Mac, press **Cmd + Shift + .** in Finder to show hidden files, and make sure
     `.github`, `.gitignore`, `.env.example`, `.prettierrc.json` and `.prettierignore` are copied.
   - On Windows, in File Explorer go to **View → Show → Hidden items**.
4. In GitHub Desktop you'll see the changed files. Bottom-left summary:
   `Stage 1: AVEN foundation` → **Commit to main** → **Push origin**.

## Option B: GitHub website (three uploads)

Each upload must be under 100 files, so the project goes up in three batches. **Folders must
keep their place**: upload `src/app` _into_ `src/` and so on, as described below.

1. Open <https://github.com/Chima30/aven>.
2. **Upload 1, the `src` folder minus `src/app`.** Click **Add file → Upload files**. From the
   unzipped files, drag the whole `src` folder in, then remove the `src/app` entries from the
   list. If removing them is fiddly, use Option A instead. Commit message `Stage 1: src part 1`
   → **Commit changes**.
3. **Upload 2, `src/app`.** In the repository, open the `src` folder, then **Add file → Upload
   files** and drag in the `app` folder (about 52 files). Commit.
4. **Upload 3, everything else.** Go back to the repository's top level. **Add file → Upload
   files** and drag in `docs`, `public`, `scripts`, `supabase`, `tests`, `.github`, and all the
   loose files such as `package.json`, `.gitignore`, `.env.example`, `.prettierrc.json` and
   `.prettierignore` (hidden files must be visible, see Option A step 3). Commit.
5. Check that the repository's top level shows `package.json` and `src/`, not a folder called
   `aven-stage1`, and that `src/app/(app)/overview/page.tsx` exists.

Option A is much less error-prone. Use it if you can.

## After pushing

- Open the **Actions** tab. The **CI** workflow runs four jobs: checks, database & RLS tests,
  and end-to-end tests. It should turn green within about 10 minutes. If anything is red, open
  it, copy the first red error, and share it with me.
- Never upload a `.env` or `.env.local` file. `.gitignore` already blocks them, and CI fails if
  a secret is found.
