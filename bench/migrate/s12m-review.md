# Owner review of the entries stale under 0.7 (trial 0021, ADR 0044)

Reviewed by the owner on 2026-10-01 from `bench/migrate/s12m.md`: all ten entries of hozu-run2 are accepted.

| Entries | Kind | Reading |
|---|---|---|
| account idle/on/account.SignIn/0 (behavior, contracts), notes adding/invoke/done/0 (contracts), notes idle/on/notes.Add/0 (contracts) | identical was / now | 0.7 hash noise (contract hashes moved with context growth) |
| account signingIn/invoke/done/0 (behavior, contracts) | navigate home → notesList | the move to /notes that change 09 asked for, never accepted into the lock |
| notes idle/on/notes.Undo/0, undoing/invoke/done/0, undoing/invoke/failed/NothingToUndo/0, undoing/invoke/failed/Unexpected/0 | missing | change 10's undo, never entered the lock (R4) |

hozu-run1 had no entry stale under 0.7.
