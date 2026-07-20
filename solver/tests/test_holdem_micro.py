"""The validation gate that was missing for the full Hold'em game: exact
tabular CFR + exact best-response are intentionally out of reach there
(52-card chance nodes can't be enumerated -- see `holdem.py`'s module
docstring), so trusting Deep CFR on the shipped Hold'em model has always
rested on Kuhn/Leduc proxies. `HoldemMicro` reuses Hold'em's real
`evaluate7` showdown logic in a push/fold abstraction small enough to
solve exactly, giving one genuine, exactly-solved Hold'em data point
instead of only different-game proxies.
"""

import math

from poker_solver.cfr.deep_cfr import DeepCFR
from poker_solver.cfr.exploitability import exploitability
from poker_solver.cfr.tabular import TabularCFR
from poker_solver.games.holdem_micro import HoldemMicro


def test_tabular_cfr_solves_holdem_micro_exactly():
    game = HoldemMicro()
    solver = TabularCFR(game)
    solver.train(iterations=300)
    strategy = {k: list(v) for k, v in solver.average_strategy().items()}

    # The actual proof of Nash equilibrium: exact best-response finds
    # essentially no exploit left, on Hold'em's own showdown code.
    exp = exploitability(game, strategy)
    assert exp < 0.01

    # Sanity check against a uniform-random baseline, so the exploitability
    # number above is legible relative to this specific game's scale (a
    # 10bb push/fold game has much smaller stakes than full Hold'em).
    uniform_exp = exploitability(game, {})
    assert exp < uniform_exp / 10

    # Structural sanity, not just "the number is small": with a fixed
    # board ranked above every hole card, only pairing a hole card (vs. the
    # board always playing for unpaired hands) should matter preflop. The
    # opener's strategy should reflect that -- overwhelmingly shove given
    # how profitable stealing the blinds is at this depth, but with real
    # equilibrium mixing (not a degenerate always-shove) at the margin.
    opener_shove_probs = [
        probs[1]  # ACTION_ORDER = [FOLD, ALL_IN, ...]; opener's actions are [FOLD, ALL_IN]
        for key, probs in strategy.items()
        if key.startswith("0:")
    ]
    assert sum(opener_shove_probs) / len(opener_shove_probs) > 0.9
    assert any(0.01 < p < 0.99 for p in opener_shove_probs), (
        "expected at least one hand played as a genuine mixed strategy "
        "at the shove/fold margin, not a fully degenerate equilibrium"
    )


def test_deep_cfr_cross_check_on_holdem_micro():
    """Cross-check Deep CFR -- the actual algorithm training the shipped
    Hold'em model -- against the exact tabular value on the SAME game
    logic Hold'em uses, rather than only on Kuhn/Leduc (different games)."""
    game = HoldemMicro()

    tabular = TabularCFR(game)
    tabular.train(iterations=300)
    exact_strategy = {k: list(v) for k, v in tabular.average_strategy().items()}
    exact_exp = exploitability(game, exact_strategy)
    assert exact_exp < 0.01  # re-confirm the ground truth this test compares against

    solver = DeepCFR(game, hidden=64, layers=2, seed=0)
    for _ in range(40):
        solver.run_iteration(traversals_per_player=500, sgd_steps=200, batch_size=256)
    solver.train_strategy_net(sgd_steps=1500, batch_size=512)
    deep_strategy = solver.extract_full_strategy()
    deep_exp = exploitability(game, deep_strategy)

    # Uniform-random loses ~0.78 here (see the tabular test); a correct
    # Deep CFR run should land well under that with this modest budget,
    # the same "clearly better than random, not necessarily fully
    # converged" pattern already established for Kuhn/Leduc in
    # test_deep_cfr.py -- but this time on Hold'em's own showdown code.
    assert deep_exp < 0.5
    assert deep_exp > exact_exp  # Deep CFR isn't expected to beat the exact solve
