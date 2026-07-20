"""Calibration for LBR (Local Best Response) itself. LBR is used throughout
this project as the only quantitative exploitability signal for the full
Hold'em game (exact best-response is intentionally out of reach there -- see
`poker_solver/games/holdem.py`'s module docstring). Nothing has ever
verified LBR *itself* against a known baseline: a strategy with zero
card-awareness (uniform-random over legal actions) has an easily-reasoned
lower bound on how exploitable it must be, so a competent LBR implementation
must beat it by a large, clear margin. If this test doesn't pass, LBR is
broken and every exploitability claim resting on it (including
`solver/VERIFICATION.md`) is untrustworthy.

A second, stronger calibration -- LBR's Monte Carlo lower bound checked
against the EXACT `exploitability()` value on the same strategy, using
`games/holdem_micro.py`'s exactly-solvable push/fold game -- was planned
but is not implemented here. `LBRPolicy`/`RangeTracker` in
`poker_solver/eval/lbr.py` are hardcoded to the full `HoldemGame`'s
internal `_State` representation (they import `_parse`, `_aggressive_amounts`,
`ALL_IN`/`CHECK_CALL`/`FOLD`/`STACK` directly from `games/holdem.py` and
read `.board`/`.contrib`/`.street_contrib` off the parsed state), not a
generic `Game`-interface exploiter -- so it cannot run against
`HoldemMicro`'s different history/state representation without first
genericizing LBR itself. That's a real refactor of the same code that
evaluates shipped models, with real risk of subtly changing its behavior,
so it's out of scope for a verification pass; if it's done later, this is
where the second calibration test belongs.
"""

import random
import statistics
import sys
from pathlib import Path

import torch
from torch import nn

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from poker_solver.eval.lbr import LBRPolicy  # noqa: E402
from poker_solver.games.holdem import HoldemGame  # noqa: E402
from lbr_eval import play_hand, strategy_policy  # noqa: E402


class ZeroLogitNet(nn.Module):
    """Stand-in for a trained InfosetNet that always outputs zero logits.

    Zero logits make `strategy_policy`'s clip-and-normalize fall through to
    its `total <= 0` branch (uniform random legal action) and make
    `RangeTracker.action_probs_batch` fall through to its own uniform
    branch -- so this net plays uniformly at random *and* gives LBR no
    informative posterior over the opponent's hand, i.e. a strategy with
    genuinely zero card-awareness in both directions.
    """

    def __init__(self, max_actions: int):
        super().__init__()
        self.max_actions = max_actions

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return torch.zeros(*x.shape[:-1], self.max_actions)


def _run_lbr_vs(net, hands: int, runouts: int, seed: int) -> list[float]:
    game = HoldemGame()
    rng = random.Random(seed)
    winnings = []
    for i in range(hands):
        lbr_seat = i % 2
        deal_rng = random.Random(rng.randrange(2**32))
        act_rng = random.Random(rng.randrange(2**32))
        lbr = LBRPolicy(game, net, lbr_seat, act_rng, runouts=runouts)
        strat = strategy_policy(game, net, act_rng)
        policies = (lbr, strat) if lbr_seat == 0 else (strat, lbr)
        returns = play_hand(game, policies, deal_rng)
        winnings.append(returns[lbr_seat])
    return winnings


def test_lbr_beats_uniform_random_policy_by_a_wide_margin():
    game = HoldemGame()
    net = ZeroLogitNet(game.max_actions)
    net.eval()

    winnings = _run_lbr_vs(net, hands=300, runouts=100, seed=0)
    mean = statistics.mean(winnings)
    stdev = statistics.pstdev(winnings)
    se = stdev / (len(winnings) ** 0.5)

    # A policy with zero card-awareness that also bets/raises uniformly at
    # random should be crushed. Folklore quoted elsewhere in this repo puts
    # a near-untrained *trained* net at ~10 bb/hand lost to LBR; a purely
    # uniform-random policy (which doesn't even try to fold bad hands or
    # value-bet good ones) should lose at least as badly. Assert a
    # conservative floor well below that anecdote, with the measured
    # standard error reported on failure for context.
    assert mean > 3.0, (
        f"LBR should heavily exploit a card-blind uniform-random policy, "
        f"got {mean:+.3f} +/- {se:.3f} bb/hand over {len(winnings)} hands "
        "-- if this doesn't hold, LBR itself is broken"
    )
