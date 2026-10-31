# Walrus Memory setup (Mainnet)

AVEN stores long-term memory on **Walrus Mainnet** through the official **MemWal** TypeScript
SDK (`@mysten-incubation/memwal`, pinned to 0.1.12) and the hosted MemWal relayer at
`https://relayer.memory.walrus.xyz`. AVEN works without it; memory features then show
"not configured".

> **Never** paste your delegate private key or namespace secret into chat, a GitHub commit,
> an issue, or any file other than your local `.env.local` and Vercel's environment
> variables. AVEN only ever reads these values on the server.

## What you need

| Variable                  | What it is                                                                           | Secret? |
| ------------------------- | ------------------------------------------------------------------------------------ | ------- |
| `MEMWAL_PRIVATE_KEY`      | The **delegate key** for your Walrus Memory account (64 hex chars or `suiprivkey1…`) | **Yes** |
| `MEMWAL_ACCOUNT_ID`       | Your Walrus Memory **account object ID** (`0x…`)                                     | No      |
| `MEMWAL_NAMESPACE_SECRET` | 32+ random characters you generate; derives private per-user namespaces              | **Yes** |
| `MEMWAL_SERVER_URL`       | Relayer URL. Default `https://relayer.memory.walrus.xyz`                             | No      |
| `MEMWAL_NAMESPACE`        | Base namespace. Default `aven-production`                                            | No      |

### 1. Create your Walrus Memory account and delegate key

1. Open **memory.walrus.xyz** in your browser and sign in with your Sui wallet.
2. Create (or open) your Walrus Memory account. Copy the **account ID** (starts with `0x`).
3. Create a **delegate key** for AVEN and copy the private key it shows you. Keep it somewhere
   safe — you'll paste it only into `.env.local` and Vercel.

The exact button names on memory.walrus.xyz may change; the two values you need are always
the _account ID_ and a _delegate private key_. Writing memories on Mainnet may require your
account to have the funding or sponsorship the MemWal service asks for — follow what the site
shows; AVEN never pays or signs anything itself.

### 2. Generate the namespace secret

In a terminal (Git Bash on Windows works):

```
openssl rand -hex 32
```

Copy the output. **Set it once and keep it**: changing it later makes every existing memory
unreachable for AVEN (that's also what makes deleted accounts' memories unreachable).

### 3. Put the values in `.env.local` (your computer)

```
MEMWAL_PRIVATE_KEY=<your delegate private key>
MEMWAL_ACCOUNT_ID=<your account id, 0x…>
MEMWAL_NAMESPACE_SECRET=<output of openssl rand -hex 32>
MEMWAL_SERVER_URL=https://relayer.memory.walrus.xyz
MEMWAL_NAMESPACE=aven-production
```

`.env.local` is git-ignored. GitHub Desktop will not show it as a change — if it ever does,
do **not** commit it.

### 4. Put the same values in Vercel

Vercel → your project → **Settings → Environment Variables** → add each variable above for
**Production** (and Preview if you use it). Do **not** add a `NEXT_PUBLIC_` prefix. Redeploy.

## Check it works

1. **In the app:** Settings → **Integrations** → _Walrus Memory_ should say **Connected** and
   show the relayer version.
2. **Read-only check on your machine:** `npm run verify:walrus` — with only the variables
   above set, it calls the relayer's health endpoint and makes **no writes**.

## Turn memory on (as a user)

Settings → **Privacy & consent** → _Remember financial context_ → read the notes → tick the
acknowledgement → **Allow**. Then use **Intelligence**: answer a recommendation, or save a
savings target. **Intelligence → Walrus Memory** lists every memory with its status and
Walrus blob ID, and **Read memories back from Walrus** fetches their text from Walrus.

## Mainnet verification (≥ 10 real memories) — only when you authorise it

This writes **real memories to Walrus Mainnet** using your account. It will not run unless you
explicitly authorise it for that run.

macOS / Linux / Git Bash:

```
AVEN_WALRUS_MAINNET_CONFIRM=I_AUTHORISE_MAINNET_WRITES npm run verify:walrus
```

Windows PowerShell:

```
$env:AVEN_WALRUS_MAINNET_CONFIRM="I_AUTHORISE_MAINNET_WRITES"; npm run verify:walrus; Remove-Item Env:AVEN_WALRUS_MAINNET_CONFIRM
```

What it does:

1. Writes 11 AVEN-format memories (clearly labelled "Verification run …") through AVEN's own
   memory service into a dedicated verification namespace no user can map to.
2. Polls the relayer until each job is `done` with a Walrus **blob ID** (up to 10 minutes).
3. Recalls them back through AVEN's recall path, and cross-checks with `listMemories()`.
4. Writes `verification/walrus-mainnet-<run id>.json` with job IDs, blob IDs, timestamps,
   relayer version, your (public) account ID and delegate address. No secrets.
5. Passes only if **at least 10** memories reached `stored` with a blob ID. Failed jobs are
   recorded but never counted.

Commit the evidence file if you want it in your submission.

## Limits you should know (and that users are told)

- **No deletion from Walrus.** MemWal SDK 0.1.12 has no delete call for real relayers (only
  its test mock has `forget`). "Forget" in AVEN permanently excludes a memory from every recall
  (by blob ID and content hash) — the encrypted copy remains on Walrus. Account deletion
  records this honestly (`external_cleanup.walrus = retained_unreachable`).
- **Who can read memories.** The relayer encrypts memories before storage; AVEN's delegate
  key (server-only) can read them back. Users' namespaces are separated by an HMAC derived on
  the server from the signed-in user's ID.
- **Writes are asynchronous.** The relayer accepts a job, then embeds, encrypts, uploads and
  indexes it. AVEN tracks each job and retries rate-limited or failed writes up to 5 times.

## Troubleshooting

| Symptom                                       | Fix                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Integrations shows "Invalid settings"         | The message names the variable. Keys must be 64 hex chars or `suiprivkey1…`; IDs `0x…`. |
| "Not reachable"                               | Check `MEMWAL_SERVER_URL`, then the relayer status; try again later.                    |
| Memories stay "Writing…"                      | Press **Check pending writes** on the Walrus Memory page; jobs can take a minute.       |
| "Waiting to retry" with a rate-limit message  | The relayer is rate limiting; AVEN retries automatically on the next check.             |
| A partial setup (only some MEMWAL_ variables) | AVEN treats it as invalid, not off — set all three required variables.                  |
