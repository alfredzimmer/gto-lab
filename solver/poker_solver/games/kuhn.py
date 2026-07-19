"""Kuhn poker: the smallest nontrivial poker game, used only to validate that
our CFR/exploitability machinery is correct against a known closed-form
Nash equilibrium before trusting it on anything bigger.

Rules: 3-card deck {J=0, Q=1, K=2}. Each player antes 1 chip and is dealt one
private card. Player 0 acts first. Actions are pass (check/fold) or bet/call
(1 chip). Betting ends after "pp", "bp", "pbp", or "bb"/"pbb".

History encoding: (card0, card1, *betting_actions) where betting actions are
0 (pass) or 1 (bet/call).

Known equilibrium (see e.g. Kuhn 1950 / any game theory reference on Kuhn
poker), parameterized by alpha in [0, 1/3]:
  - Game value to player 0 is exactly -1/18 regardless of alpha.
  - Player 2 (P1) with Jack, facing a check: bets (bluffs) with probability
    exactly 1/3.
  - Player 1 (P0) with Queen, facing a bet after checking: calls with
    probability exactly 1/3.
These alpha-independent constants are what tests/test_kuhn.py checks.
"""

import numpy as np

from poker_solver.games.base import Game

PASS = 0
BET = 1

_TERMINAL_BETTING = {"pp", "bp", "pbp", "bb", "pbb"}


def _betting_str(h):
    return "".join("p" if a == PASS else "b" for a in h[2:])


class KuhnPoker(Game):
    num_players = 2

    def initial_history(self):
        return ()

    def is_chance(self, h):
        return len(h) < 2

    def chance_outcomes(self, h):
        if len(h) == 0:
            return [(c, 1 / 3) for c in (0, 1, 2)]
        # len(h) == 1: deal player 1 a card from the two remaining
        remaining = [c for c in (0, 1, 2) if c != h[0]]
        return [(c, 1 / 2) for c in remaining]

    def is_terminal(self, h):
        if len(h) < 2:
            return False
        return _betting_str(h) in _TERMINAL_BETTING

    def returns(self, h):
        card0, card1 = h[0], h[1]
        betting = _betting_str(h)
        higher0 = card0 > card1
        if betting == "pp":
            win0 = 1 if higher0 else -1
            return (win0, -win0)
        if betting == "bp":
            return (1, -1)
        if betting == "pbp":
            return (-1, 1)
        # "bb" or "pbb": showdown at stake 2
        win0 = 2 if higher0 else -2
        return (win0, -win0)

    def current_player(self, h):
        return (len(h) - 2) % 2

    def legal_actions(self, h):
        return [PASS, BET]

    def infoset_key(self, h):
        player = self.current_player(h)
        card = h[player]
        betting = _betting_str(h)
        return f"{card}|{betting}"

    # ---- Deep CFR interface ----
    # card one-hot (3) + up to 2 past betting actions, each one-hot over
    # {pass, bet} (2 slots x 2) = 7 features. (The acting player has seen at
    # most 2 prior actions: betting ends after 3.)

    feature_dim = 7
    max_actions = 2  # canonical: 0 = PASS, 1 = BET

    def infoset_features(self, h):
        player = self.current_player(h)
        card = h[player]
        x = np.zeros(self.feature_dim, dtype=np.float32)
        x[card] = 1.0
        for slot, action in enumerate(h[2:]):
            x[3 + 2 * slot + action] = 1.0
        return x

    def legal_action_indices(self, h):
        return [PASS, BET]
