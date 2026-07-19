# TO-DO

1. Rewrite Cactus Kev's Algorithm using WASM to maximize efficiency.
2. ~~Introduce an actual GTO solver (even a light one into the project).~~
   Done: Deep CFR pipeline in `solver/` + in-browser GTO trainer at `/gto`.

## GTO trainer follow-ups

- Longer/bigger training runs (more traversals per iteration, larger
  networks) to tighten the LBR exploitability bound further.
- Richer bet-size grid (e.g. 33%/150% pot) once training budget allows.
- Show per-action EV estimates (export the advantage networks too).
- Score tracking for GTO practice sessions (reuse practice_logs schema).
