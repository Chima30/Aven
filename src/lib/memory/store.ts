/**
 * Honest, user-facing status of the Walrus Memory integration.
 *
 * "verified" here means verified IN CODE against the official SDK and its
 * mock. Live Mainnet behaviour is verified separately by
 * `npm run verify:walrus` (see docs/WALRUS_SETUP.md), whose evidence file is
 * the only proof AVEN accepts that real Mainnet memories were stored.
 */
export const MEMORY_CAPABILITIES = {
  sdk: "@mysten-incubation/memwal 0.1.12 (official MemWal SDK)",
  relayer: "Hosted MemWal relayer (Mainnet)",
  encryption:
    "The relayer encrypts each memory (SEAL) before storing it on Walrus. AVEN's delegate key, held only on AVEN's server, can read memories back.",
  isolation:
    "Each AVEN user has a private namespace derived on the server with a secret HMAC. Recall only ever searches the signed-in user's namespace.",
  deletion:
    "The MemWal SDK does not offer a delete operation. When you forget a memory, AVEN permanently stops using it and excludes it from every recall, but the encrypted copy remains on Walrus.",
  revocation:
    "Withdrawing consent or pausing memory stops all new writes and all recall immediately.",
} as const;
