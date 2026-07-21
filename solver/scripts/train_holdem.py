"""Deep CFR training driver for heads-up NLHE.

Runs external-sampling Deep CFR iterations, periodically:
  - trains a snapshot strategy network from the strategy memory,
  - evaluates it head-to-head against baseline agents (uniform-random and
    always-call) with duplicate dealing (each sampled deck played twice
    with seats swapped) to keep variance manageable,
  - writes a rolling checkpoint (networks always; replay buffers too, in
    one overwritten file, so a crash doesn't lose the run).

Head-to-head vs fixed baselines is the cheap *monitoring* metric.
The real convergence evidence is (a) this same implementation reaching
near-zero exact exploitability on Kuhn/Leduc (tests/), and (b) the
local-best-response probe in scripts/lbr_eval.py run against checkpoints.

Usage:
  python scripts/train_holdem.py --iters 300 --traversals 500 --out runs/holdem
"""

import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.cfr.deep_cfr import DeepCFR  # noqa: E402
from poker_solver.games.holdem import HoldemGame  # noqa: E402


def play_hand(game, policy0, policy1, rng):
    """Play one full hand; policies map history -> action. Returns P0 net bb."""
    h = game.initial_history()
    while not game.is_terminal(h):
        if game.is_chance(h):
            outcomes = game.chance_outcomes(h)
            a = rng.choices([a for a, _ in outcomes], [p for _, p in outcomes], k=1)[0]
        else:
            policy = policy0 if game.current_player(h) == 0 else policy1
            a = policy(h)
        h = game.next_history(h, a)
    return game.returns(h)[0]


def make_strategy_policy(solver, rng):
    def policy(h):
        probs = solver.strategy_probs(h)
        actions = solver.game.legal_actions(h)
        return rng.choices(actions, weights=probs, k=1)[0]

    return policy


def make_random_policy(game, rng):
    return lambda h: rng.choice(game.legal_actions(h))


def make_caller_policy(game):
    return lambda h: "c"


def evaluate(solver, game, hands, seed):
    """Mean bb/hand for the solver strategy vs each baseline, duplicate-dealt."""
    results = {}
    for name, make_opp in (
        ("vs_random", lambda r: make_random_policy(game, r)),
        ("vs_caller", lambda r: make_caller_policy(game)),
    ):
        rng = random.Random(seed)
        total = 0.0
        for i in range(hands // 2):
            deal_seed = rng.randrange(2**32)
            for hero_seat in (0, 1):
                deal_rng = random.Random(deal_seed)  # duplicate: same cards both ways
                act_rng = random.Random(deal_seed + hero_seat)
                hero = make_strategy_policy(solver, act_rng)
                opp = make_opp(act_rng)
                p0, p1 = (hero, opp) if hero_seat == 0 else (opp, hero)
                v0 = play_hand(game, p0, p1, deal_rng)
                total += v0 if hero_seat == 0 else -v0
        results[name] = total / hands
    return results


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--iters", type=int, default=300)
    ap.add_argument("--traversals", type=int, default=500)
    ap.add_argument("--sgd-steps", type=int, default=750)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--strategy-sgd-steps", type=int, default=4000)
    ap.add_argument("--hidden", type=int, default=256)
    ap.add_argument("--layers", type=int, default=3)
    ap.add_argument("--advantage-capacity", type=int, default=150_000)
    ap.add_argument("--strategy-capacity", type=int, default=300_000)
    ap.add_argument("--device", default="mps" if torch.backends.mps.is_available() else "cpu")
    ap.add_argument("--eval-every", type=int, default=25)
    ap.add_argument("--eval-hands", type=int, default=2000)
    ap.add_argument("--out", default="runs/holdem")
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    log_path = out / "log.jsonl"

    game = HoldemGame()
    solver = DeepCFR(
        game,
        hidden=args.hidden,
        layers=args.layers,
        advantage_capacity=args.advantage_capacity,
        strategy_capacity=args.strategy_capacity,
        train_device=args.device,
        seed=args.seed,
    )

    print(f"training on device={args.device}, logging to {log_path}", flush=True)
    t0 = time.time()
    for it in range(1, args.iters + 1):
        it_start = time.time()
        solver.run_iteration(
            traversals_per_player=args.traversals,
            sgd_steps=args.sgd_steps,
            batch_size=args.batch,
        )
        record = {
            "iter": it,
            "iter_seconds": round(time.time() - it_start, 1),
            "elapsed": round(time.time() - t0, 1),
            "advantage_samples": [len(m) for m in solver.advantage_memories],
            "advantage_seen": [m.num_seen for m in solver.advantage_memories],
            "strategy_samples": len(solver.strategy_memory),
        }

        if it % args.eval_every == 0 or it == args.iters:
            solver.train_strategy_net(
                sgd_steps=args.strategy_sgd_steps, batch_size=args.batch
            )
            record["eval"] = evaluate(solver, game, args.eval_hands, seed=args.seed + it)

            snapshot = {
                "iteration": solver.iteration,
                "args": vars(args),
                "advantage_nets": [n.state_dict() for n in solver.advantage_nets],
                "strategy_net": solver.strategy_net.state_dict(),
            }
            torch.save(snapshot, out / "checkpoint.pt")
            # Keep every eval snapshot too, so the best one can be picked by
            # paired LBR afterwards (LBR is noisy and non-monotonic across
            # checkpoints -- see solver/VERIFICATION.md).
            torch.save(snapshot, out / f"ckpt_it{it}.pt")
            torch.save(
                {
                    "advantage": [m.__dict__ for m in solver.advantage_memories],
                    "strategy": solver.strategy_memory.__dict__,
                },
                out / "buffers.pt",
            )

        with open(log_path, "a") as f:
            f.write(json.dumps(record) + "\n")
        print(json.dumps(record), flush=True)


if __name__ == "__main__":
    main()
