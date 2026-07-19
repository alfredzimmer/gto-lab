# GTO Lab

Learn heads-up No-Limit Hold'em from an actual solver — not opinions, not
generated text. Every frequency shown in the app comes from a Deep CFR
(Brown et al. 2019) self-play run, and inference happens entirely in your
browser via ONNX.

## Features

- **Range Explorer** (`/`): the 13×13 starting-hand matrix at any
  node of the game tree. Walk the betting line, pick the exact flop /
  turn / river from a card selector, and inspect per-hand mixed
  strategies (all 1,326 combos evaluated live per node).
- **Trainer** (`/trainer`): get dealt real solver-line spots, commit to
  an action, and see the equilibrium action mix, how far off you were,
  and the pot-odds math.

## Tech Stack

- **Framework**: Next.js (App Router), TypeScript, Tailwind CSS v4
- **Inference**: `onnxruntime-web` (wasm), no server round-trips
- **Testing**: Jest & React Testing Library
- **Solver**: Python + PyTorch Deep CFR pipeline in `solver/`

## Getting Started

```bash
pnpm install
pnpm dev
```

The app expects a trained strategy model at `public/models/holdem_strategy.onnx` (one is
committed after training; see below to retrain).

## The solver (`solver/`)

The GTO strategy is trained by an external-sampling Deep CFR
implementation whose correctness is gated on classical benchmarks before
the real game:

1. Tabular CFR + exact best-response exploitability, validated against
   the closed-form Kuhn poker equilibrium (game value −1/18, the 1/3
   bluff/call frequencies).
2. The same machinery validated on Leduc hold'em (exploitability → 0).
3. Deep CFR validated against those tabular ground truths on both games.
4. Only then trained on the target: heads-up NLHE, 100bb, 4 streets,
   discretized bet sizes (½-pot, pot, all-in; 3 raises/street cap).
5. The trained strategy is probed with Local Best Response (a
   lower bound on exploitability) — `scripts/lbr_eval.py`.

The TypeScript game engine and feature encoder used by the browser are
parity-tested against the Python training engine on generated test
vectors (`src/lib/gto/parity-vectors.json`), so the network always sees
inputs encoded exactly as during training.

```bash
cd solver
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/            # full validation gate
.venv/bin/python scripts/train_holdem.py --out runs/holdem_v1
.venv/bin/python scripts/lbr_eval.py runs/holdem_v1/checkpoint.pt
.venv/bin/python scripts/export_onnx.py runs/holdem_v1/checkpoint.pt \
    --out ../public/models/holdem_strategy.onnx
```

## Testing

- App: `pnpm test` (includes the TS/Python parity suite)
- Solver: `cd solver && .venv/bin/python -m pytest tests/`

## License

MIT
