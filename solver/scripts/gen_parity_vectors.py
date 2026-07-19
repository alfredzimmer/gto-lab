"""Generate cross-language parity test vectors for the TypeScript port of
the heads-up NLHE engine + feature encoder.

Samples random legal lines through the game and records, at every
decision node: the history, legal actions (tokens + canonical indices),
pot state, and the nonzero entries of the feature vector. The TS engine
(src/lib/gto/holdem.ts) must reproduce all of it exactly -- the strategy
network's inputs are only meaningful under the exact training-time
encoding, so this parity is load-bearing for every number the UI shows.

Usage:
  python scripts/gen_parity_vectors.py > ../src/lib/gto/parity-vectors.json
"""

import json
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.games.holdem import HoldemGame, _parse  # noqa: E402


def main():
    game = HoldemGame()
    rng = random.Random(42)
    vectors = []

    while len(vectors) < 300:
        h = game.initial_history()
        while not game.is_terminal(h):
            if game.is_chance(h):
                outcomes = game.chance_outcomes(h)
                a = rng.choices(
                    [a for a, _ in outcomes], [p for _, p in outcomes], k=1
                )[0]
            else:
                s = _parse(h)
                feats = game.infoset_features(h)
                nonzero = {
                    str(i): round(float(v), 6) for i, v in enumerate(feats) if v != 0
                }
                vectors.append(
                    {
                        "history": list(h),
                        "player": game.current_player(h),
                        "legalActions": game.legal_actions(h),
                        "legalIndices": game.legal_action_indices(h),
                        "street": s.street,
                        "pot": s.contrib[0] + s.contrib[1],
                        "toCall": s.street_contrib[1 - s.to_act]
                        - s.street_contrib[s.to_act],
                        "features": nonzero,
                    }
                )
                a = rng.choice(game.legal_actions(h))
            h = game.next_history(h, a)

        # Also capture some terminal returns for payout parity.
        r = game.returns(h)
        vectors.append({"history": list(h), "terminalReturns": list(r)})

    print(json.dumps({"featureDim": game.feature_dim, "vectors": vectors}))


if __name__ == "__main__":
    main()
