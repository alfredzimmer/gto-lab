import math

from poker_solver.cfr.exploitability import exploitability
from poker_solver.cfr.tabular import TabularCFR
from poker_solver.games.kuhn import KuhnPoker


def test_kuhn_tabular_cfr_converges_to_known_equilibrium():
    game = KuhnPoker()
    solver = TabularCFR(game)
    avg_util = solver.train(iterations=20_000)

    # Known closed-form game value for player 0 in Kuhn poker.
    assert math.isclose(avg_util[0], -1 / 18, abs_tol=0.01)
    assert math.isclose(avg_util[1], 1 / 18, abs_tol=0.01)

    strategy = {k: list(v) for k, v in solver.average_strategy().items()}

    # Best response against the converged average strategy should find
    # essentially no exploit left -- this is the actual proof of Nash
    # equilibrium (not just "loss went down"), independent of the
    # closed-form constants below.
    exp = exploitability(game, strategy)
    assert abs(exp) < 0.02

    # Alpha-independent invariants of the known Kuhn equilibrium family:
    # player 1 (P1, acts second) with Jack, facing a check, bluff-bets
    # with probability exactly 1/3.
    jack_facing_check = strategy["0|p"]
    assert math.isclose(jack_facing_check[1], 1 / 3, abs_tol=0.03)

    # player 1 (P1, acts second) with Queen, facing an opening bet,
    # calls with probability exactly 1/3.
    queen_facing_opening_bet = strategy["1|b"]
    assert math.isclose(queen_facing_opening_bet[1], 1 / 3, abs_tol=0.03)

    # player 0 (P0, acts first) never opens betting with a Queen -- it's
    # dominated (checking always weakly beats betting the middle card
    # into the open).
    queen_first_action = strategy["1|"]
    assert queen_first_action[1] < 0.03

    # With King, player 1 facing a check always bets (King never
    # passes up value betting the nuts).
    king_facing_check = strategy["2|p"]
    assert king_facing_check[1] > 0.95
