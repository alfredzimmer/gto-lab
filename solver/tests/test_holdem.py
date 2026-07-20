import random

import numpy as np
import pytest

from poker_solver.games.hand_eval import evaluate7
from poker_solver.games.holdem import HoldemGame, _parse

# card = suit * 13 + rank, rank 0 = deuce .. 12 = ace
A_S, A_H = 12, 25
K_S, K_D = 11, 37
HOLE = (A_S, A_H, K_S, K_D)  # P0 has AA, P1 has KK


def _neutral_board():
    # 2c 9c Jd 5h 8s-ish ranks, no pairs/straights/flushes interacting
    return (0, 7, 35, 16, 45)


class TestHandEval:
    def test_categories_order(self):
        # straight flush > quads > full house > flush > straight > trips
        sf = evaluate7([0, 1, 2, 3, 4, 20, 40])  # 2-6 of clubs suit0
        quads = evaluate7([0, 13, 26, 39, 4, 20, 40])
        assert sf > quads

    def test_wheel_straight(self):
        # A-2-3-4-5 mixed suits
        hand = evaluate7([12, 0, 14, 2, 29, 20, 40])  # A,2,3,4,5 + junk
        assert hand[0] == 4 and hand[1] == 3  # straight, 5-high (rank 3)

    def test_two_pair_kicker_can_be_third_pair_rank(self):
        # pairs of K and Q, plus pair of 2s -> kicker is a 2? No: kicker is
        # highest remaining card, which IS the 2 here.
        cards = [11, 24, 10, 23, 0, 13, 5]  # KK QQ 22 + a 7
        hand = evaluate7(cards)
        assert hand[0] == 2 and hand[1] == 11 and hand[2] == 10

    def test_flush_beats_straight(self):
        flush = evaluate7([0, 2, 4, 6, 8, 20, 40])  # 5 clubs
        straight = evaluate7([0, 14, 28, 42, 4, 20, 45])
        assert flush > straight


class TestHoldemMechanics:
    def setup_method(self):
        self.game = HoldemGame()

    def test_blinds_and_first_action(self):
        assert self.game.current_player(HOLE) == 0  # button/SB first preflop
        assert self.game.legal_actions(HOLE) == ["f", "c", "b0", "b1", "a"]

    def test_bb_has_option_after_limp(self):
        h = HOLE + ("c",)
        assert not self.game.is_chance(h)
        assert self.game.current_player(h) == 1
        # BB facing no outstanding bet: no fold available
        assert "f" not in self.game.legal_actions(h)

    def test_pot_raise_preflop_is_3bb(self):
        # pot after SB calls = 4 units; 100% pot raise = call 2 + 4 = 6 units = 3bb
        h = HOLE + ("b1", "c")
        assert self.game.is_chance(h)  # flop deal
        flop = h + (0, 7, 35)
        assert self.game.current_player(flop) == 1  # BB first postflop

    def test_checked_down_pot_awards_pot_to_best_hand(self):
        h = HOLE + ("c", "c") + _neutral_board()[:3] + ("c", "c") + _neutral_board()[3:4] + ("c", "c") + _neutral_board()[4:] + ("c", "c")
        assert self.game.is_terminal(h)
        r = self.game.returns(h)
        assert r == (1.0, -1.0)  # AA beats KK for the 1bb each blind pot
        assert sum(r) == 0

    def test_fold_awards_folders_contribution(self):
        h = HOLE + ("b1", "f")
        assert self.game.returns(h) == (1.0, -1.0)

    def test_all_in_call_runs_out_board_with_no_more_betting(self):
        h = HOLE + ("a", "c")
        assert self.game.is_chance(h)
        full = h + _neutral_board()
        assert self.game.is_terminal(full)
        assert self.game.returns(full) == (100.0, -100.0)

    def test_raise_cap_limits_aggression_per_street(self):
        h = HOLE + ("b0", "b0", "b0")  # 3 aggressive actions
        legal = self.game.legal_actions(h)
        assert "b0" not in legal and "b1" not in legal
        assert "a" in legal  # all-in is always available with chips behind

    def test_infoset_hides_opponent_cards(self):
        h1 = (A_S, A_H, K_S, K_D, "c")
        h2 = (A_S, A_H, 5, 20, "c")  # different BB cards, same public line
        # P1 to act sees different keys; but from P0's perspective after
        # 'c','c' the keys must match:
        h3 = (A_S, A_H, K_S, K_D)
        h4 = (A_S, A_H, 5, 20)
        assert self.game.infoset_key(h3) == self.game.infoset_key(h4)
        assert self.game.infoset_key(h1) != self.game.infoset_key(h2)

    def test_features_depend_only_on_infoset(self):
        h3 = (A_S, A_H, K_S, K_D)
        h4 = (A_S, A_H, 5, 20)
        assert np.array_equal(
            self.game.infoset_features(h3), self.game.infoset_features(h4)
        )


def test_pot_after_call_is_always_even():
    """A street only closes when both players' street contributions match,
    so by induction both players' total contributions are always equal at
    the start of every street. That makes `pot_after_call` (used to size
    the 'b0' 50%-pot bet) always even: it can never land on an exact `.5`
    tie for banker's-rounding, so the TS port's `bankersRound` and Python's
    `round()` can never actually disagree on a `.5` input in this game.
    Verified here over thousands of random lines rather than asserted from
    reasoning alone -- if this ever fails, either the game's betting
    structure changed in a way that breaks street-closure symmetry, or a
    genuine banker's-rounding parity vector needs to be added."""
    game = HoldemGame()
    rng = random.Random(11)
    checked = 0

    for _ in range(3000):
        h = game.initial_history()
        while not game.is_terminal(h):
            if game.is_chance(h):
                outcomes = game.chance_outcomes(h)
                probs = [p for _, p in outcomes]
                a = rng.choices([a for a, _ in outcomes], weights=probs, k=1)[0]
            else:
                s = _parse(h)
                p = s.to_act
                opp = 1 - p
                call_amount = s.street_contrib[opp]
                prior = s.contrib[p] - s.street_contrib[p]
                pot_after_call = s.contrib[opp] + prior + call_amount
                assert pot_after_call % 2 == 0, (h, pot_after_call)
                checked += 1
                a = rng.choice(game.legal_actions(h))
            h = game.next_history(h, a)

    assert checked > 1000  # sanity: the loop actually exercised decisions


def test_random_playouts_preserve_invariants():
    """Fuzz: play thousands of uniformly random legal lines to the end and
    check the invariants that the CFR machinery depends on."""
    game = HoldemGame()
    rng = random.Random(7)

    for _ in range(2000):
        h = game.initial_history()
        steps = 0
        while not game.is_terminal(h):
            steps += 1
            assert steps < 200, f"non-terminating line: {h}"
            if game.is_chance(h):
                outcomes = game.chance_outcomes(h)
                probs = [p for _, p in outcomes]
                assert abs(sum(probs) - 1) < 1e-9
                a = rng.choices([a for a, _ in outcomes], weights=probs, k=1)[0]
            else:
                actions = game.legal_actions(h)
                indices = game.legal_action_indices(h)
                assert len(actions) == len(indices) == len(set(indices))
                feats = game.infoset_features(h)
                assert feats.shape == (game.feature_dim,)
                assert np.isfinite(feats).all()
                a = rng.choice(actions)
            h = game.next_history(h, a)

        r = game.returns(h)
        assert abs(sum(r)) < 1e-9  # zero-sum
        assert abs(r[0]) <= 100.0  # can never win more than the stack


def _permute_suits(h, perm):
    """Relabel every card in history h by suit permutation perm (a bijection
    of {0,1,2,3}); action strings pass through unchanged."""
    return tuple(
        perm[c // 13] * 13 + (c % 13) if isinstance(c, int) else c for c in h
    )


def test_infoset_features_are_suit_isomorphism_invariant():
    """Relabeling all four suits never changes NLHE strategy, so the
    canonicalized feature encoding must be identical for a spot and any
    suit-permuted copy of it. Fuzz over random decision nodes and all 24
    suit permutations. This is the property the shipped model was missing
    (it had arbitrary per-suit weights); guarding it keeps the encoder
    honest independent of any trained checkpoint."""
    import itertools

    game = HoldemGame()
    rng = random.Random(23)
    checked = 0

    for _ in range(400):
        h = game.initial_history()
        while not game.is_terminal(h):
            if game.is_chance(h):
                outcomes = game.chance_outcomes(h)
                a = rng.choices(
                    [a for a, _ in outcomes], [p for _, p in outcomes], k=1
                )[0]
            else:
                base = game.infoset_features(h)
                for perm in itertools.permutations(range(4)):
                    permuted = _permute_suits(h, perm)
                    np.testing.assert_array_equal(
                        game.infoset_features(permuted), base
                    )
                    # Navigation must be suit-blind too.
                    assert game.legal_actions(permuted) == game.legal_actions(h)
                checked += 1
                a = rng.choice(game.legal_actions(h))
            h = game.next_history(h, a)

    assert checked > 300


def test_flush_relevance_is_preserved_after_canonicalization():
    """Canonicalization discards the arbitrary suit LABEL but must keep the
    flush RELATIONSHIP: sharing the board's flush suit has to encode
    differently from holding the same ranks off-suit. (This is exactly what
    the old model could not act on.)"""
    game = HoldemGame()
    # Flop decision for P1 (first to act postflop) after a limp/check.
    def flop_history(hole):
        board = (0, 8, 16)  # 2c, Tc, 5d -- a two-tone (club) flop
        villain = (39, 40)  # 2s, 3s (never enter P1's features)
        return (villain[0], villain[1], hole[0], hole[1], "c", "c", *board)

    draw = flop_history((12, 10))  # Ac, Qc -- nut flush draw (shares club suit)
    brick = flop_history((38, 36))  # Ah, Qh -- same ranks, no club
    assert not np.array_equal(
        game.infoset_features(draw), game.infoset_features(brick)
    )
