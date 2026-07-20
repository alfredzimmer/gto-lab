# Solver Verification

This is the checked-in record of correctness/exploitability evidence for
the GTO solver. Update it whenever a new Hold'em checkpoint is exported to
`public/models/holdem_strategy.onnx`, or whenever the CFR/exploitability/LBR
machinery changes. Numbers here are real, reproducible measurements, not
folklore -- every section states the exact command used to produce it.

## How to reproduce

```sh
cd solver
.venv/bin/python -m pytest -v
pnpm test   # from repo root, frontend parity + trainer-math tests
.venv/bin/python scripts/lbr_eval.py runs/holdem_v2/checkpoint.pt --hands 2000 --runouts 200 --seed 0
```

## Test suite status (2026-07-20, commit 41f0d91)

- `solver/tests/`: **33/33 passed**, up from 25 at the start of this
  verification pass -- added `test_exploitability.py` (infoset-key-length
  invariant), `test_export_onnx.py` (PyTorch/ONNX Runtime parity),
  `test_lbr.py` (LBR-vs-uniform-random calibration), `test_holdem_micro.py`
  (exact tabular CFR + Deep CFR cross-check on a solvable push/fold
  variant), plus a new invariant test and edge-case coverage inside
  `test_holdem.py`.
- Frontend `pnpm test`: **51/51 passed** across 8 suites, up from 23 across
  4 -- added `holdem.edge.test.ts` (targeted raise-cap/all-in-clamp/
  showdown parity vectors + a `compareScores` contract test),
  `strategy.spot.test.ts` (`describeSpot`), `strategy.getStrategy.test.ts`
  (masking/normalization), `GtoFeedback.test.tsx` (`verdict()` boundaries).
- `node scripts/check-onnx-runtime.mjs` (new, run outside Jest -- see ONNX
  section below): **passes**, 20/20 sampled real infosets produce valid,
  finite, correctly-shaped output from the actual shipped `.onnx` file
  through a real ONNX runtime.
- `solver/.pytest_cache/v/cache/lastfailed` is empty (`{}`) -- no outstanding failures from a prior run.

## Exact-equilibrium games

Computed directly (not just "test passed") via `TabularCFR`/`DeepCFR` +
`exploitability()` on 2026-07-20:

| Game | Method | Iterations | Result |
|---|---|---|---|
| Kuhn | Tabular CFR | 20,000 | game value p0 = -0.05646 (closed form -1/18 = -0.05556); **exploitability = 0.00322** |
| Leduc | Tabular CFR | 100 | exploitability = 0.25210 |
| Leduc | Tabular CFR | 1,000 (cumulative) | exploitability = 0.05378 (shrunk to 21% of the 100-iter value) |
| Kuhn | Deep CFR (hidden=64, layers=2, seed=0) | 20 iters x 200 traversals | exploitability = 0.05199 |
| Leduc | Deep CFR (hidden=128, layers=3, seed=0) | 20 iters x 300 traversals | exploitability = 0.91662 |

For reference, uniform-random play is exploitable for ~0.92 in Kuhn and
~4.7 in Leduc (see `test_deep_cfr.py` docstrings) -- Deep CFR's Leduc number
above (0.92) is with a deliberately small training budget for test speed;
the docstring in `test_deep_cfr.py` notes longer runs reach ~0.2.

### Micro Hold'em (push/fold) -- a real Hold'em data point, not just a proxy

`poker_solver/games/holdem_micro.py` is a heads-up preflop shove/fold
abstraction (10bb effective stacks, small deck, fixed neutral board) built
specifically so exact tabular CFR and exact best-response can solve it
directly, while still calling the real `evaluate7` on genuine 7-card hands
-- unlike Kuhn/Leduc, this exercises Hold'em's own showdown code. See
`solver/tests/test_holdem_micro.py`.

| Method | Result |
|---|---|
| Uniform random | exploitability = 0.781746 |
| Exact tabular CFR (300 iters) | **exploitability = 0.000734** -- a true, exactly-verified Nash equilibrium on Hold'em's own payout/hand-eval logic |
| Deep CFR (hidden=64, layers=2, seed=0, 40 iters x 500 traversals) | exploitability = 0.244382 -- clearly better than random, not fully converged with this modest budget, the same pattern established on Kuhn/Leduc |

This directly narrows the "proxy trust" gap: previously, trusting Deep CFR
on the shipped Hold'em model rested entirely on it having worked on two
*different, simpler* games (Kuhn, Leduc). This is one genuine,
zero-exploitability-verified data point using Hold'em's actual game logic.

**What this does NOT cover**: the micro game has no community board dealt
by chance (a fixed, neutral 5-card board is used instead to keep the
chance tree exactly enumerable) and a much shorter stack than the shipped
model's 100bb -- so it validates the CFR/best-response *machinery* against
real showdown code, not the full game's bet-sizing/multi-street dynamics.
LBR remains the only signal for those. A planned second calibration --
checking LBR's Monte Carlo lower bound against this micro-game's exact
`exploitability()` value -- was not implemented: `LBRPolicy`/`RangeTracker`
in `poker_solver/eval/lbr.py` are hardcoded to the full `HoldemGame`'s
internal state representation and can't run against a different game
without first genericizing LBR itself, which risks the same code that
evaluates shipped models and was judged out of scope here (see the
docstring in `test_lbr.py`).

## Hold'em LBR results (2026-07-20, seed 0, 2000 hands, 200 runouts/decision)

Monte Carlo **lower bound** on exploitability, in bb/hand (lower is
better). Command: `scripts/lbr_eval.py runs/<checkpoint> --hands 2000 --runouts 200 --seed 0`.

| checkpoint | LBR wins (bb/hand) | 95% CI (±1.96·SE) |
|---|---|---|
| `holdem_v1/checkpoint.pt` | +2.145 | ±1.221 |
| `holdem_v2/ckpt_it50.pt` | +0.946 | ±1.366 |
| `holdem_v2/ckpt_it100.pt` | +1.972 | ±1.547 |
| `holdem_v2/ckpt_it150.pt` | +1.589 | ±1.399 |
| `holdem_v2/ckpt_it200.pt` | +0.680 | ±1.272 |
| `holdem_v2/ckpt_it250.pt` | +1.321 | ±1.256 |
| `holdem_v2/ckpt_it300.pt` (shipped, = `holdem_v2/checkpoint.pt`) | +1.539 | ±1.117 |

**Honest read of this table**: these numbers are noisy and do **not** show
a clean monotonic improvement with more training -- standard errors are
large enough (~0.6-0.8 bb/hand) that most checkpoints overlap within 1-2
combined SEs of each other. This supersedes an earlier, unverified
in-conversation claim of "v1 +2.27±0.32 vs v2(it250) +0.83±0.33 bb/hand,
paired 8k hands" -- that number was never persisted anywhere and could not
be reproduced from this repo; treat it as superseded by the table above,
which *is* reproducible from the exact command shown. At 2000 hands/seed 0,
LBR does not distinguish these checkpoints from each other with confidence;
a tighter comparison would need either many more hands or a paired-seed
design across checkpoints (same dealt hands for all 7), which
`lbr_eval.py` does not currently support (it seeds hand-by-hand from a
single running RNG, not a shared per-hand seed across separate runs).

All checkpoints measurably beat a uniform-random baseline: `test_lbr.py`
asserts LBR wins >3.0 bb/hand against a policy with zero card-awareness
(actual measured margin ~4-8bb/hand in ad hoc runs), so even the noisiest
trained checkpoint above is meaningfully better than random, just not
cleanly ranked against each other by this measurement.

## ONNX round-trip

Two layers, checking different things:

- **Python**: `solver/tests/test_export_onnx.py::test_onnx_export_matches_pytorch_on_real_infosets`
  exports a freshly-initialized `InfosetNet` (opset 17, dynamic batch axis)
  and asserts PyTorch vs. ONNX Runtime outputs match to `atol=1e-5` on 256
  sampled infoset feature vectors, with finite (non-NaN/Inf) output of the
  expected `(n, 5)` shape. This is a CI-safe stand-in for the same check
  `scripts/export_onnx.py` performs on a real checkpoint at export time
  (`max |torch - onnx| < 1e-4` assertion in that script).
- **TypeScript**: `node scripts/check-onnx-runtime.mjs` loads the actual
  tracked `public/models/holdem_strategy.onnx` through `onnxruntime-node`
  (a real runtime, not a mock -- a CPU-execution-provider stand-in for the
  browser's `onnxruntime-web/wasm`; ONNX graph execution semantics are
  provider-agnostic) and runs it on 20 real infosets sampled from the
  TS/Python parity fixture, asserting correct output shape/name, no NaNs,
  and that clip-and-normalize produces a valid probability distribution.
  This is deliberately a plain Node script rather than a Jest test: Jest
  sandboxes each test file in its own V8 context, and onnxruntime-node's
  native addon hands back result tensors built against the real process's
  typed-array constructors, so `instanceof Float32Array` fails inside
  onnxruntime-common's own Tensor constructor when run under Jest -- a
  known category of Jest-vs-native-addon incompatibility, not a bug in
  this check. Run it with `pnpm run check:onnx`.

## CI

`.github/workflows/test.yml` runs `solver/tests/` (pytest) and
`pnpm test` + `pnpm run check:onnx` (frontend) on every push and PR --
previously nothing ran automatically; all verification was manual. Uses
Node 22 in CI (the prior workflow was removed for a Node 20/pnpm 11
incompatibility -- see commit `bf71e13`).

## Known gaps / non-goals

- **Exact best-response on the full 4-street Hold'em game is intentionally
  out of reach** (52-card chance nodes can't be enumerated) -- see the
  module docstring in `poker_solver/games/holdem.py`. LBR remains the only
  quantitative exploitability signal for the *shipped* model, and it is a
  lower bound, not an exact number. The micro Hold'em push/fold game (above)
  narrows this gap by proving the CFR/best-response machinery exactly on
  Hold'em's real showdown code, but at 10bb stacks with no dealt board --
  it does not cover the shipped model's full 100bb/4-street dynamics.
- `test_lbr.py` calibrates LBR only against a uniform-random policy, not
  against exact ground truth -- see "What this does NOT cover" above for
  why the exact-vs-LBR calibration on `holdem_micro` wasn't implemented.
- LBR's Monte Carlo noise (~0.6-0.8 bb/hand SE at 2000 hands, single seed)
  is large relative to the differences between checkpoints; do not read
  small differences between adjacent checkpoints in the table above as
  meaningful without a paired-seed re-run.
