"""Validation gate for the Deep CFR implementation: it must reproduce the
equilibria that tabular CFR (already validated against closed-form Kuhn
math) finds on the small benchmark games. A broken Deep CFR can show a
nicely decreasing training loss while converging to nothing -- only the
best-response exploitability of the extracted strategy actually certifies
correctness, so that is what these tests assert on.
"""

import math

from poker_solver.cfr.deep_cfr import DeepCFR
from poker_solver.cfr.exploitability import exploitability
from poker_solver.games.kuhn import KuhnPoker
from poker_solver.games.leduc import LeducPoker


def test_deep_cfr_reaches_low_exploitability_on_kuhn():
    game = KuhnPoker()
    solver = DeepCFR(game, hidden=64, layers=2, seed=0)
    for _ in range(20):
        solver.run_iteration(traversals_per_player=200, sgd_steps=150, batch_size=128)
    solver.train_strategy_net(sgd_steps=600, batch_size=256)

    strategy = solver.extract_full_strategy()
    exp = exploitability(game, strategy)
    # Uniform random is exploitable for ~0.92 in Kuhn; tabular CFR reaches
    # ~0.003. Deep CFR with this small budget lands close to equilibrium.
    assert exp < 0.15

    # Structural invariants of the Kuhn equilibrium family (looser
    # tolerances than the tabular test -- function approximation noise):
    # P1 with Jack facing a check bluffs about 1/3 of the time...
    assert math.isclose(strategy["0|p"][1], 1 / 3, abs_tol=0.1)
    # ...and with the King never checks back the nuts.
    assert strategy["2|p"][1] > 0.9
    # Facing a bet with a Jack is a pure fold.
    assert strategy["0|b"][0] > 0.9


def test_deep_cfr_improves_on_leduc():
    game = LeducPoker()
    solver = DeepCFR(game, hidden=128, layers=3, seed=0)
    for _ in range(20):
        solver.run_iteration(traversals_per_player=300, sgd_steps=300, batch_size=256)
    solver.train_strategy_net(sgd_steps=1500, batch_size=512)

    strategy = solver.extract_full_strategy()
    exp = exploitability(game, strategy)
    # Uniform random loses ~4.7 to a best responder in Leduc; a correct
    # Deep CFR gets well under 1 with even this modest budget (longer runs
    # reach ~0.2, see scripts/leduc benchmark), while a subtly broken one
    # stalls near random.
    assert exp < 1.0
