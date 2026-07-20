"""Preflop-only shove/fold Hold'em ("push/fold"): a heads-up abstraction
small enough for EXACT tabular CFR and EXACT best-response to solve
directly, unlike the full 4-street game (see `holdem.py`'s module
docstring for why that's out of reach there). This reuses the real
`evaluate7` hand comparator on genuine 7-card hands, so it exercises
Hold'em's actual showdown logic rather than an unrelated toy game --
giving one real, exactly-solved data point to calibrate Deep CFR and LBR
against, instead of relying only on Kuhn/Leduc (different games entirely)
as proxies.

Rules: 2 players, a short effective stack (parametrized; chip unit = 0.5bb
like `holdem.py`). Player 0 (opener, on the button) acts first with only
two options: fold, or shove all-in -- no smaller bet sizes, the classic
push/fold abstraction used for short stacks. If the opener shoves, player 1
(responder) faces fold or call; a call runs straight to showdown.

The board is FIXED (not dealt by chance) at 5 cards ranked strictly above
every hole card rank, in mixed suits with no straight or flush of its own
(see `_NEUTRAL_BOARD`). This keeps every showdown a genuine 7-card
`evaluate7` call -- unlike comparing 2 hole cards directly, which crashes
`evaluate7` on a made pair (it assumes a real 7-card hand, i.e. at least 5
distinct ranks in play) -- while keeping the chance tree tiny: only the 4
hole cards are dealt by chance, from a small deck (default 5 ranks x 2
suits = 10 cards) low enough that they never reach the fixed board's
ranks, so 10*9*8*7 = 5040 hole deals are exactly enumerable, vs. hundreds
of millions if the board were also dealt randomly.

One consequence of the fixed high board: since it always supplies the top
5 kickers, an UNPAIRED starting hand is exactly equivalent to any other
unpaired starting hand (the board plays); only pairing a hole card matters,
and higher pair ranks beat lower ones. That's a real, if simplified,
distinction for the opener to shove more with (any pair) than with (any
non-pair) -- enough texture for a genuine equilibrium, while keeping the
"which hands are strong" question simple enough to eyeball by hand.

History encoding: (c0a, c0b, c1a, c1b, *actions), actions drawn from
{'f' fold, 'a' all-in, 'c' call}.
"""

import numpy as np

from poker_solver.games.base import Game
from poker_solver.games.hand_eval import evaluate7

FOLD = "f"
ALL_IN = "a"
CHECK_CALL = "c"
ACTION_ORDER = [FOLD, ALL_IN, CHECK_CALL]

SMALL_BLIND = 1
BIG_BLIND = 2

# Ranks 6,8,10,11,12 (mixed suits): no 5-consecutive run and no single suit
# reaches 5 cards, so the board itself is never better than "ace-high" --
# strictly above every hole card rank when num_ranks <= 5 (ranks 0..4).
_NEUTRAL_BOARD = (3 * 13 + 6, 0 * 13 + 8, 1 * 13 + 10, 2 * 13 + 11, 0 * 13 + 12)


class HoldemMicro(Game):
    num_players = 2
    max_actions = len(ACTION_ORDER)
    _ACTION_INDEX = {a: i for i, a in enumerate(ACTION_ORDER)}

    def __init__(self, stack: int = 20, num_ranks: int = 5, num_suits: int = 2):
        # stack: chip units (0.5bb each); default 20 = 10bb, a genuine
        # push/fold depth in real poker.
        self.stack = stack
        self.num_ranks = num_ranks
        self.num_suits = num_suits
        assert num_ranks <= 5, "hole ranks must stay below the fixed board's lowest rank (6)"
        # `evaluate7` decodes rank = c % 13, suit = c // 13 (the full-deck
        # convention), so cards here must be real suit*13+rank values, not
        # a dense 0..num_cards-1 range -- otherwise every "card" would
        # decode to suit 0 with a distinct rank and pairs could never be
        # dealt at all.
        self.cards = [
            suit * 13 + rank
            for suit in range(num_suits)
            for rank in range(num_ranks)
        ]
        self.num_cards = len(self.cards)
        assert self.num_cards >= 4, "need at least 4 cards to deal both hands"
        self._card_slot = {c: i for i, c in enumerate(self.cards)}
        # 2 hole cards two-hot (num_cards each) + 1 responder-position flag.
        self.feature_dim = 2 * self.num_cards + 1

    def initial_history(self):
        return ()

    def is_chance(self, h):
        return len(h) < 4

    def chance_outcomes(self, h):
        used = set(h)
        remaining = [c for c in self.cards if c not in used]
        p = 1 / len(remaining)
        return [(c, p) for c in remaining]

    def is_terminal(self, h):
        if len(h) < 4:
            return False
        actions = h[4:]
        if len(actions) == 0:
            return False
        if actions[0] == FOLD:
            return True
        return len(actions) == 2  # shove resolved by fold or call

    def returns(self, h):
        actions = h[4:]
        if actions[0] == FOLD:
            lost = SMALL_BLIND / 2.0
            return (-lost, lost)
        if actions[1] == FOLD:
            won = BIG_BLIND / 2.0
            return (won, -won)
        hero = evaluate7([h[0], h[1], *_NEUTRAL_BOARD])
        villain = evaluate7([h[2], h[3], *_NEUTRAL_BOARD])
        if hero == villain:
            return (0.0, 0.0)
        lost = self.stack / 2.0
        return (lost, -lost) if hero > villain else (-lost, lost)

    def current_player(self, h):
        actions = h[4:]
        return 0 if len(actions) == 0 else 1

    def legal_actions(self, h):
        actions = h[4:]
        return [FOLD, ALL_IN] if len(actions) == 0 else [FOLD, CHECK_CALL]

    def infoset_key(self, h):
        p = self.current_player(h)
        hole = tuple(sorted(h[2 * p : 2 * p + 2]))
        actions = h[4:]
        return f"{p}:{hole}|{''.join(actions)}"

    # ---- Deep CFR interface ----

    def infoset_features(self, h):
        p = self.current_player(h)
        x = np.zeros(self.feature_dim, dtype=np.float32)
        x[self._card_slot[h[2 * p]]] = 1.0
        x[self.num_cards + self._card_slot[h[2 * p + 1]]] = 1.0
        if p == 1:
            x[2 * self.num_cards] = 1.0
        return x

    def legal_action_indices(self, h):
        return [self._ACTION_INDEX[a] for a in self.legal_actions(h)]
