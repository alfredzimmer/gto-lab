from poker_solver.cfr.exploitability import exploitability
from poker_solver.cfr.tabular import TabularCFR
from poker_solver.games.leduc import LeducPoker

KING_A, KING_B = 4, 5
QUEEN_A, QUEEN_B = 2, 3
JACK_A, JACK_B = 0, 1


def test_fold_awards_pot_to_non_folder():
    game = LeducPoker()
    h = (KING_A, JACK_A, "r", "f")
    assert game.is_terminal(h)
    net = game.returns(h)
    assert net == [1, -1]
    assert sum(net) == 0


def test_showdown_higher_card_wins_with_no_bets():
    game = LeducPoker()
    h = (KING_A, JACK_A, "c", "c", QUEEN_A, "c", "c")
    assert game.is_terminal(h)
    assert game.returns(h) == [1, -1]


def test_pair_beats_higher_unpaired_card():
    game = LeducPoker()
    # player 0 has King (unpaired), player 1 has Jack that pairs the board.
    h = (KING_A, JACK_A, "c", "c", JACK_B, "c", "c")
    assert game.returns(h) == [-1, 1]


def test_equal_rank_showdown_splits_pot():
    game = LeducPoker()
    h = (KING_A, KING_B, "c", "c", QUEEN_A, "c", "c")
    assert game.returns(h) == [0.0, 0.0]


def test_bet_and_raise_contributions_are_symmetric_at_showdown():
    game = LeducPoker()
    h = (KING_A, JACK_A, "c", "r", "c", QUEEN_A, "r", "r", "c")
    net = game.returns(h)
    # preflop: check, bet(2), call(2) => 2 each. postflop: bet(4), raise(8), call(8) => 8 each.
    # total invested = 1 (ante) + 2 + 8 = 11 each.
    assert net == [11, -11]


def test_raise_cap_removes_raise_from_legal_actions():
    game = LeducPoker()
    h = (KING_A, JACK_A, "r", "r")
    assert game.legal_actions(h) == ["f", "c"]


def test_infoset_key_hides_opponent_card_and_board_until_dealt():
    game = LeducPoker()
    h = (KING_A, JACK_A)
    # not reachable pre-deal, but after both hole cards dealt:
    h2 = (KING_A, JACK_A, "c")
    key = game.infoset_key(h2)
    assert key.startswith(f"{JACK_A}|-|")


def test_leduc_tabular_cfr_exploitability_shrinks_with_more_iterations():
    """Leduc has no known closed-form equilibrium, so unlike Kuhn we can't
    check the output against textbook constants. The proof of correctness
    here is the CFR regret-minimization guarantee itself: exploitability of
    the average strategy must shrink towards 0 as iterations grow. We check
    that trend directly rather than trusting a single endpoint number.
    """
    game = LeducPoker()
    solver = TabularCFR(game)

    solver.train(100)
    strategy_early = {k: list(v) for k, v in solver.average_strategy().items()}
    exp_early = exploitability(game, strategy_early)

    solver.train(900)  # 1000 total
    strategy_late = {k: list(v) for k, v in solver.average_strategy().items()}
    exp_late = exploitability(game, strategy_late)

    assert exp_early > 0.15  # still clearly exploitable this early
    assert exp_late < 0.1  # meaningfully converged
    assert exp_late < exp_early / 2  # and monotonically improving
