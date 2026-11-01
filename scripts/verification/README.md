# Live verification evidence

Files in this folder are written by the OPTIONAL live checks, which you run on
your own machine with your own credentials (see docs/WALRUS_SETUP.md and
docs/TATUM_SETUP.md):

- `npm run verify:tatum` → `tatum-mainnet-<time>.json`
- `npm run verify:walrus` → `walrus-mainnet-<run id>.json` (Mainnet writes only
  when `AVEN_WALRUS_MAINNET_CONFIRM=I_AUTHORISE_MAINNET_WRITES` is set)

The files never contain API keys, delegate private keys or the namespace
secret. They do contain public identifiers (your MemWal account object ID, the
delegate key's public Sui address, Walrus blob IDs and job IDs), which you may
want to commit as hackathon evidence.

Nothing in this folder was produced by mocks. If the folder only contains this
README, no live verification has been run yet.
