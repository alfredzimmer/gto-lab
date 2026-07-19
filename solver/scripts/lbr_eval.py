"""Probe a trained Deep CFR checkpoint with Local Best Response.

Reports LBR's winnings in bb/hand (mean +/- standard error) over
duplicate-dealt hands, split by seat. This is a Monte Carlo lower bound
on the checkpoint strategy's exploitability -- lower is better, and a
strategy this well-informed exploiter can't beat meaningfully is strong
evidence of near-equilibrium play at this abstraction.

Usage:
  python scripts/lbr_eval.py runs/holdem_v1/checkpoint.pt --hands 500
"""

import argparse
import math
import random
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.cfr.networks import InfosetNet  # noqa: E402
from poker_solver.eval.lbr import LBRPolicy  # noqa: E402
from poker_solver.games.holdem import HoldemGame  # noqa: E402


def load_strategy_net(checkpoint_path: str) -> tuple[InfosetNet, dict]:
    ckpt = torch.load(checkpoint_path, map_location="cpu", weights_only=False)
    args = ckpt["args"]
    game = HoldemGame()
    net = InfosetNet(game.feature_dim, game.max_actions, args["hidden"], args["layers"])
    net.load_state_dict(ckpt["strategy_net"])
    net.eval()
    return net, ckpt


def strategy_policy(game, net, rng):
    def policy(h):
        feats = torch.from_numpy(game.infoset_features(h))
        with torch.no_grad():
            logits = net(feats)
        indices = game.legal_action_indices(h)
        clipped = [max(float(logits[i]), 0.0) for i in indices]
        total = sum(clipped)
        actions = game.legal_actions(h)
        if total <= 0:
            return rng.choice(actions)
        return rng.choices(actions, weights=clipped, k=1)[0]

    return policy


def play_hand(game, policies, rng):
    h = game.initial_history()
    while not game.is_terminal(h):
        if game.is_chance(h):
            outcomes = game.chance_outcomes(h)
            a = rng.choices([a for a, _ in outcomes], [p for _, p in outcomes], k=1)[0]
        else:
            a = policies[game.current_player(h)](h)
        h = game.next_history(h, a)
    return game.returns(h)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--hands", type=int, default=500)
    ap.add_argument("--runouts", type=int, default=200)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    game = HoldemGame()
    net, ckpt = load_strategy_net(args.checkpoint)
    print(f"checkpoint from iteration {ckpt['iteration']}")

    rng = random.Random(args.seed)
    lbr_winnings = []
    for i in range(args.hands):
        lbr_seat = i % 2
        deal_rng = random.Random(rng.randrange(2**32))
        act_rng = random.Random(rng.randrange(2**32))
        lbr = LBRPolicy(game, net, lbr_seat, act_rng, runouts=args.runouts)
        strat = strategy_policy(game, net, act_rng)
        policies = (lbr, strat) if lbr_seat == 0 else (strat, lbr)
        returns = play_hand(game, policies, deal_rng)
        lbr_winnings.append(returns[lbr_seat])
        if (i + 1) % 100 == 0:
            n = len(lbr_winnings)
            mean = sum(lbr_winnings) / n
            var = sum((x - mean) ** 2 for x in lbr_winnings) / max(n - 1, 1)
            se = math.sqrt(var / n)
            print(f"hands={n:5d}  LBR wins {mean:+.3f} +/- {se:.3f} bb/hand", flush=True)

    n = len(lbr_winnings)
    mean = sum(lbr_winnings) / n
    var = sum((x - mean) ** 2 for x in lbr_winnings) / max(n - 1, 1)
    se = math.sqrt(var / n)
    print(f"FINAL: LBR wins {mean:+.3f} +/- {se:.3f} bb/hand over {n} hands")
    print(
        "(Monte Carlo lower bound on exploitability -- lower is better; "
        "a near-untrained checkpoint loses ~10 bb/hand to LBR)"
    )


if __name__ == "__main__":
    main()
