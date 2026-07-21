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
.venv/bin/python scripts/flush_probe.py   # flush-awareness acceptance gate
```

## Suit canonicalization (flush awareness) -- SHIPPED (holdem_v4 it100, 2026-07-20)

**Status: shipped.** `public/models/holdem_strategy.onnx` is the canonicalized
`holdem_v4` checkpoint, **iteration 100**, selected by a multi-seed LBR sweep
(see "Hold'em LBR results"). It is flush-aware (flush probe PASS, max
sensitivity TVD **0.17**, suit-rotation 0), and by 5-seed-averaged LBR it is
**+0.67 +/- 0.20 bb/hand -- far less exploitable than the previous shipped
holdem_v3 it240 (+2.26 +/- 0.20, a 5.6-sigma / 1.59 bb/hand improvement)**.
It also fixes the over-jamming (#4): on a limped-pot flop it bets ~1/2-pot and
jams ~3%, where v3 jammed 20-40% -- exactly the leak LBR punished.

Why an early (it100) checkpoint and not the it400 endpoint: the full
`holdem_v4` run (`--iters 400 --traversals 1500 --batch 1024`, buffers
600k/1.2M, ~3h on MPS) showed **exploitability does NOT decrease with more
training** -- multi-seed LBR wanders in a ~0.7-1.6 band with a mild
non-monotonic hump (it100 +0.67, it300 +1.56, it400 +0.94), i.e. the Deep CFR
average strategy converges (low-noise strategy-TVD keeps shrinking) but to an
approximate fixed point whose exploitability is capped by function-
approximation error. More iterations don't help; it100 is the best-measured
point that is also flush-aware. Lesson recorded: single-seed LBR is too noisy
(seed spread ~±1 bb/hand > within-seed SE) to rank checkpoints -- always
average across seeds.

The pre-canonicalization shipped net played flush hands almost identically to
same-rank bricks. Root cause was the encoder, not the pipeline: the raw
one-hot-per-card encoding gave the net no suit-symmetry prior, so it had
arbitrary per-suit weights instead of a flush concept. Measured on the old
`.onnx` via `scripts/flush_probe.py`'s methodology:

- flush-draw vs same-rank-brick strategy TVD: only ~0.03-0.10;
- the *identical* made nut flush rotated across the four suits swung up to
  **0.32 TVD** -- pure per-suit noise, larger than the actual flush signal.

**Fix:** `HoldemGame.infoset_features` (and its bit-identical TS twin
`infosetFeatures`) now relabel suits into a canonical order
(`_canonical_suit_perm` / `canonicalSuitPerm`) before one-hot encoding. This
is suit isomorphism -- a provable NLHE symmetry -- so it adds no human prior,
pools the four suit-symmetric copies of every spot into one encoding, and
preserves the flush *relationship* while discarding the meaningless
clubs-vs-hearts label. `FEATURE_DIM`, action space, and network are unchanged.

Guards added (all green now, model-free):
- Python `tests/test_holdem.py::test_infoset_features_are_suit_isomorphism_invariant`
  (features identical under all 24 suit permutations) and
  `::test_flush_relevance_is_preserved_after_canonicalization`.
- TS `src/lib/gto/holdem.test.ts` "holdem suit canonicalization" suite (same
  two properties), plus the regenerated `parity-vectors*.json` still match
  bit-for-bit, proving the TS port of the canonicalization is exact.

`scripts/flush_probe.py` is the acceptance gate: it wants flush-sensitivity
TVD >= 0.15 (a heuristic above the ~0.10 pre-fix baseline) and suit-rotation
TVD == 0 (an encoder invariant, exactly 0 for any model). Passing output on the
shipped `holdem_v4 it100` model (`python scripts/flush_probe.py`) -- note the
+aggr deltas are now positive (flush hands bet MORE, the intuitive direction):

```
FLUSH SENSITIVITY (want max TVD >= 0.15; +aggr = flush hand bets more):
  TVD=0.1118  aggr +0.106  two-tone 2c Tc 5d, A Q (nut flush draw vs bricks)
  TVD=0.1733  aggr +0.173  monotone 2c Tc Jc, A K (made nut flush vs no clubs)
  TVD=0.1480  aggr +0.148  two-tone 7h 8h 2s, A 9 (2nd-nut flush draw vs none)
SUIT SYMMETRY: TVD=0.000000 for all suit rotations
max flush-sensitivity TVD = 0.1733 -> PASS ; max suit-rotation TVD = 0 -> PASS
```

NOTE: passing this probe is necessary, not sufficient -- a heavily
undertrained net also passes it (flush-aware but bad); LBR remains the quality
arbiter. Full runbook for a converged retrain: plan file
`/Users/alfred/.claude/plans/pure-gathering-wilkinson.md`.

## Test suite status (2026-07-20)

- Suit-canonicalization additions: `solver/tests/` now **35 passed** and
  frontend `pnpm test` **53 passed** (each +2 model-free guards: suit-
  permutation invariance and flush-relevance preservation, PY + TS).

(Snapshot below is from commit 41f0d91, before the canonicalization work.)

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
| `holdem_v2/ckpt_it300.pt` (flush-blind) | +1.539 | ±1.117 |
| `holdem_v3/checkpoint.pt` (it240, single seed -- see multi-seed below) | +1.772 | ±0.525 |

### Multi-seed sweep (2026-07-20, 5 seeds x 2000 hands = 10k hands/checkpoint)

Single-seed LBR turned out too noisy to rank checkpoints: the *same* it100
checkpoint scored +0.44/+1.44/+0.62 across seeds 0/1/2 (spread ~1 bb/hand,
far above the within-seed ±0.5 SE). Averaging over 5 seeds gives honest
error bars (SE across seeds). Command: `lbr_eval.py <ckpt> --hands 2000
--runouts 200 --seed {0..4}`.

| checkpoint | mean LBR (±SE over 5 seeds) | note |
|---|---|---|
| `holdem_v4/ckpt_it50.pt`  | +0.93 ± 0.21 | |
| `holdem_v4/ckpt_it100.pt` | **+0.67 ± 0.20** | **SHIPPED** (flush PASS 0.17) |
| `holdem_v4/ckpt_it200.pt` | +1.32 ± 0.17 | |
| `holdem_v4/ckpt_it300.pt` | +1.56 ± 0.31 | |
| `holdem_v4/ckpt_it400.pt` | +0.94 ± 0.17 | flush FAIL (0.145) |
| `holdem_v3/checkpoint.pt` (prev shipped, it240) | +2.26 ± 0.20 | superseded |

Reads: (1) v4 it100 is **5.6 sigma** less exploitable than the prev-shipped
v3 (+0.67 vs +2.26). (2) Exploitability does **not** fall with more training
-- it wanders 0.7-1.6 with a mild non-monotonic hump (it100 best, it300
worst, it400 recovers), the signature of hitting this net/abstraction's
function-approximation floor. The strategy still *converges* (strategy-TVD
between snapshots keeps shrinking), just to an approximate, error-capped
fixed point. To push exploitability below ~0.7 needs a bigger net / finer
bet grid / engineered features, not more iterations.

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
