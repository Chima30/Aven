# Demo script (2–3 minutes)

**Before recording:** Walrus and Tatum configured; Stage 3–4 SQL run; a demo account with at
least two complete months of real or clearly-labelled sample entries you typed yourself (AVEN
never generates data), including a budget that was exceeded; memory allowed; one public Sui
address ready. Have the memory page open in a second tab. Use 1080p, browser zoom 110%.

| Time      | Screen                                                                                                        | Say                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | Landing page → Overview                                                                                       | "Budgeting apps forget everything you tell them. AVEN remembers your decisions on Walrus — and its next suggestion changes because of them."                                               |
| 0:15–0:35 | Intelligence → a _Bring Food down to…_ card                                                                   | "Everything here is calculated from my own records — no AI inventing numbers. Food went over its budget in 3 of the last 3 months, so AVEN suggests a 10% cut."                            |
| 0:35–0:50 | Click **Decline**                                                                                             | "I'll decline. That decision is now written to Walrus Mainnet through the MemWal SDK."                                                                                                     |
| 0:50–1:15 | Intelligence → **Walrus Memory**                                                                              | "Here's the memory: _Writing…_ then _Stored on Walrus_, with its blob ID. Supabase only keeps this bookkeeping — **Read memories back from Walrus** fetches the text from Walrus itself."  |
| 1:15–1:45 | Back to Intelligence (a later/next-month suggestion, or the second demo account where a decline was recalled) | "AVEN recalled that decision. The new card is _Shaped by your memory_: 5% instead of 10%, and **Why this changed** shows the exact memory and blob ID. Decline twice and it stops asking." |
| 1:45–2:00 | Savings card → set target 30% → **Save to memory**                                                            | "My savings target lives only in Walrus. The savings recommendation now uses 30% instead of the default."                                                                                  |
| 2:00–2:20 | Money → **Sui wallets**                                                                                       | "AVEN reads my public Sui Mainnet wallet through Tatum's gRPC gateway — balances and recent transactions, shown separately. Nothing is merged unless I confirm it, with duplicate checks." |
| 2:20–2:35 | Settings → **Integrations**                                                                                   | "Live status: the MemWal relayer version and the latest Sui checkpoint."                                                                                                                   |
| 2:35–2:50 | Settings → Privacy → memory notes                                                                             | "Memory is opt-in, private per user, and honest: the SDK can't delete from Walrus, so _forget_ means AVEN never uses it again — and users are told before they agree."                     |
| 2:50–3:00 | Evidence JSON (verification folder) or repo                                                                   | "Code, docs and Mainnet verification evidence are on GitHub. Thanks!"                                                                                                                      |

**Tips:** If the memory is still _Writing…_, press **Check pending writes**. To show the learning
change in one take, prepare a second account where you declined the Food suggestion earlier
(the card will already show _Shaped by your memory_). Don't show `.env.local`, the Vercel
environment screen or any key.
