"""Heads-up No-Limit Texas Hold'em with a discretized bet-size grid --
the target game for Deep CFR, matching the abstraction style of Brown et
al. 2019 (full 4-street game, pot-fraction bet sizes, capped raises).

Fixed rules:
- 2 players, effective stacks 100bb each. Chip unit = 0.5bb so every
  amount is an integer: stacks 200, small blind 1, big blind 2.
- Player 0 = button/small blind (acts FIRST preflop, SECOND postflop).
  Player 1 = big blind.
- Streets: preflop, flop (3 cards), turn, river.
- Actions: fold 'f', check/call 'c', bet/raise 'b0' (50% pot), 'b1'
  (100% pot), all-in 'a'. Pot fraction is of the pot AFTER calling.
  At most 3 aggressive actions (bet/raise) per street; after the cap
  only fold/call remain. Raises follow a simplified min-raise rule
  (raise increment >= max(1bb, last increment), clamped up), and any
  grid size that reaches the remaining stack collapses into 'a'.
- Showdown / all-in: once stacks are even and someone is all-in, the
  remaining board runs out as chance nodes with no further betting.

History encoding: ints are cards (0..51: rank = c % 13 with 0=deuce..
12=ace, suit = c // 13), strings are actions. Layout:
  (h0a, h0b, h1a, h1b, *preflop, f1, f2, f3, *flop, turn, *turnacts,
   river, *riveracts)

Returns are measured in big blinds (so +3.0 means winning 3bb), keeping
network targets in a sane numeric range.

Unlike Kuhn/Leduc, this tree cannot be enumerated (chance nodes deal from
a 52-card deck), so `chance_outcomes` exists for the interface but
solving/evaluation must sample it -- exact tabular CFR and exact
best-response are intentionally out of reach here.
"""

from functools import lru_cache

import numpy as np

from poker_solver.games.base import Game
from poker_solver.games.hand_eval import evaluate7

FOLD = "f"
CHECK_CALL = "c"
ALL_IN = "a"
BET_FRACTIONS = {"b0": 0.5, "b1": 1.0}
ACTION_ORDER = [FOLD, CHECK_CALL, "b0", "b1", ALL_IN]

STACK = 200  # chip units of 0.5bb => 100bb
SMALL_BLIND = 1
BIG_BLIND = 2
MAX_RAISES_PER_STREET = 3
NUM_STREETS = 4
_BOARD_CARDS = (0, 3, 4, 5)  # cumulative board size by street


class _State:
    __slots__ = (
        "status",  # 'chance_hole' | 'act' | 'chance_board' | 'fold' | 'showdown'
        "street",  # 0..3
        "board",  # list[int]
        "contrib",  # total chips put in by each player, whole hand
        "street_contrib",  # chips put in this street
        "acted",  # players that have acted this street
        "raises",  # aggressive actions this street
        "last_increment",  # size of last raise increment this street
        "to_act",  # player index
        "folder",  # who folded, if status == 'fold'
    )


def _first_to_act(street: int) -> int:
    return 0 if street == 0 else 1


@lru_cache(maxsize=200_000)
def _parse(h) -> _State:
    """Replay h into a _State. Cached: every Game method needs the parsed
    state, and CFR traversals query several methods per node. Callers must
    treat the returned state as read-only."""
    s = _State()
    s.board = []
    s.folder = None

    if len(h) < 4:
        s.status = "chance_hole"
        return s

    s.street = 0
    s.contrib = [SMALL_BLIND, BIG_BLIND]
    s.street_contrib = [SMALL_BLIND, BIG_BLIND]
    s.acted = set()
    s.raises = 0
    s.last_increment = BIG_BLIND
    s.to_act = _first_to_act(0)

    def street_closed() -> bool:
        if s.street_contrib[0] != s.street_contrib[1]:
            return False
        # Everyone with chips behind must have acted this street.
        return all(p in s.acted or s.contrib[p] >= STACK for p in (0, 1))

    idx = 4
    n = len(h)
    while True:
        # Consume any board cards owed for the current street.
        needed = _BOARD_CARDS[s.street] - len(s.board)
        while needed > 0 and idx < n:
            s.board.append(h[idx])
            idx += 1
            needed -= 1
        if needed > 0:
            s.status = "chance_board"
            return s

        # Betting on this street (skipped if someone is already all-in --
        # stacks are equal, so one player all-in means both stacks are
        # committed or the caller side has chips but no opponent to bet
        # against).
        betting_live = all(s.contrib[p] < STACK for p in (0, 1))
        if betting_live:
            closed = False
            while idx < n and isinstance(h[idx], str):
                token = h[idx]
                idx += 1
                p = s.to_act
                opp = 1 - p
                s.acted.add(p)

                if token == FOLD:
                    s.status = "fold"
                    s.folder = p
                    return s
                prior = _prior_contrib(s, p)
                if token == CHECK_CALL:
                    s.street_contrib[p] = s.street_contrib[opp]
                    s.contrib[p] = prior + s.street_contrib[p]
                else:
                    amount = _aggressive_amount(s, p, token)
                    s.last_increment = amount - s.street_contrib[opp]
                    s.street_contrib[p] = amount
                    s.contrib[p] = prior + amount
                    s.raises += 1
                s.to_act = opp
                if street_closed():
                    closed = True
                    break
            if not closed:
                if idx >= n:
                    s.status = "act"
                    return s
                raise ValueError("board card appeared while betting still open")

        # Street closed (or no betting): advance.
        if s.street == NUM_STREETS - 1:
            s.status = "showdown"
            return s
        s.street += 1
        s.street_contrib = [0, 0]
        s.acted = set()
        s.raises = 0
        s.last_increment = BIG_BLIND
        s.to_act = _first_to_act(s.street)


def _prior_contrib(s: _State, p: int) -> int:
    return s.contrib[p] - s.street_contrib[p]


def _aggressive_amount(s: _State, p: int, token: str) -> int:
    """Street contribution p moves to with bet/raise `token` (clamped to
    stack). Mirrors _legal_aggressive so replay and legality agree."""
    amounts = _aggressive_amounts(s, p)
    return amounts[token]


def _aggressive_amounts(s: _State, p: int) -> dict[str, int]:
    """Map of available aggressive tokens -> resulting street contribution
    for the player to act, applying min-raise clamping, all-in collapse,
    and duplicate-size pruning."""
    opp = 1 - p
    call_amount = s.street_contrib[opp]
    stack_left = STACK - _prior_contrib(s, p)  # max street contribution
    # Pot after p calls = both players' total contributions at that point.
    pot_after_call = s.contrib[opp] + _prior_contrib(s, p) + call_amount

    min_increment = max(BIG_BLIND, s.last_increment)
    out: dict[str, int] = {}
    if s.raises < MAX_RAISES_PER_STREET:
        prev_amount = call_amount
        for token, frac in BET_FRACTIONS.items():
            increment = max(round(frac * pot_after_call), min_increment)
            amount = call_amount + increment
            if amount >= stack_left:
                continue  # collapses into all-in
            if amount <= prev_amount:
                continue  # duplicate/degenerate size
            out[token] = amount
            prev_amount = amount
    if stack_left > call_amount:
        out[ALL_IN] = stack_left
    return out


def _canonical_suit_perm(hole, board) -> list[int]:
    """Suit-isomorphism canonicalization for feature encoding.

    Relabeling suits never changes NLHE strategy, so we map the four suits
    to canonical labels 0..3 by a rule that depends only on the infoset's
    own cards (the acting player's hole + the visible board), never on the
    arbitrary clubs/diamonds/hearts/spades identity. This collapses the
    four suit-symmetric copies of every situation into one encoding, so the
    network sees flush structure consistently instead of relearning it once
    per suit.

    Each suit gets a signature (board_mask, hole_mask): 13-bit masks of
    which ranks of that suit appear on the board / in the hand. Suits are
    ranked by that signature (more/higher board ranks first, then hole
    ranks), tie-broken by original index. Tied suits are genuinely
    interchangeable, so the tie-break cannot change the resulting features.

    Returns perm where perm[old_suit] = canonical_suit.
    """
    board_mask = [0, 0, 0, 0]
    hole_mask = [0, 0, 0, 0]
    for c in board:
        board_mask[c // 13] |= 1 << (c % 13)
    for c in hole:
        hole_mask[c // 13] |= 1 << (c % 13)
    order = sorted(range(4), key=lambda s: (-board_mask[s], -hole_mask[s], s))
    perm = [0, 0, 0, 0]
    for canonical, old in enumerate(order):
        perm[old] = canonical
    return perm


class HoldemGame(Game):
    num_players = 2

    def initial_history(self):
        return ()

    def is_chance(self, h):
        return _parse(h).status in ("chance_hole", "chance_board")

    def chance_outcomes(self, h):
        used = set(c for c in h if isinstance(c, int))
        remaining = [c for c in range(52) if c not in used]
        p = 1 / len(remaining)
        return [(c, p) for c in remaining]

    def is_terminal(self, h):
        return _parse(h).status in ("fold", "showdown")

    def returns(self, h):
        s = _parse(h)
        if s.status == "fold":
            loser = s.folder
            lost = s.contrib[loser] / 2.0  # units -> big blinds
            return (lost, -lost) if loser == 1 else (-lost, lost)

        board = s.board
        hand0 = evaluate7([h[0], h[1], *board])
        hand1 = evaluate7([h[2], h[3], *board])
        if hand0 == hand1:
            return (0.0, 0.0)
        winner = 0 if hand0 > hand1 else 1
        lost = s.contrib[1 - winner] / 2.0
        return (lost, -lost) if winner == 0 else (-lost, lost)

    def current_player(self, h):
        return _parse(h).to_act

    def legal_actions(self, h):
        s = _parse(h)
        p = s.to_act
        facing = s.street_contrib[1 - p] > s.street_contrib[p]
        actions = []
        if facing:
            actions.append(FOLD)
        actions.append(CHECK_CALL)
        actions.extend(_aggressive_amounts(s, p).keys())
        return actions

    def infoset_key(self, h):
        s = _parse(h)
        p = s.to_act
        hole = sorted(h[2 * p : 2 * p + 2])
        public = []
        board_seen = 0
        for x in h[4:]:
            if isinstance(x, int):
                public.append(f"[{x}]")
                board_seen += 1
            else:
                public.append(x)
        return f"{hole[0]},{hole[1]}|{','.join(public)}"

    # ---- Deep CFR interface ----
    # Features (231 total):
    #   52  hole cards (two-hot)
    #   52  board cards (multi-hot)
    #    4  street one-hot
    #    3  pot / to-call / own-stack, normalized by starting stack
    #  120  betting history: 4 streets x 6 action slots x 5 action types

    feature_dim = 52 + 52 + 4 + 3 + NUM_STREETS * 6 * len(ACTION_ORDER)
    max_actions = len(ACTION_ORDER)

    _ACTION_INDEX = {a: i for i, a in enumerate(ACTION_ORDER)}

    def infoset_features(self, h):
        s = _parse(h)
        p = s.to_act
        x = np.zeros(self.feature_dim, dtype=np.float32)
        # Canonicalize suits (isomorphism) so flush structure is encoded
        # consistently across the four suit-symmetric variants of the spot.
        hole = (h[2 * p], h[2 * p + 1])
        perm = _canonical_suit_perm(hole, s.board)
        canon = lambda c: perm[c // 13] * 13 + (c % 13)  # noqa: E731
        x[canon(hole[0])] = 1.0
        x[canon(hole[1])] = 1.0
        for c in s.board:
            x[52 + canon(c)] = 1.0
        x[104 + s.street] = 1.0
        pot = s.contrib[0] + s.contrib[1]
        to_call = s.street_contrib[1 - p] - s.street_contrib[p]
        x[108] = pot / (2 * STACK)
        x[109] = to_call / STACK
        x[110] = (STACK - s.contrib[p]) / STACK

        base = 111
        streets_actions = _actions_by_street(h)
        for street, acts in enumerate(streets_actions):
            for slot, a in enumerate(acts[:6]):
                x[base + (street * 6 + slot) * len(ACTION_ORDER) + self._ACTION_INDEX[a]] = 1.0
        return x

    def legal_action_indices(self, h):
        return [self._ACTION_INDEX[a] for a in self.legal_actions(h)]


def _actions_by_street(h) -> list[list[str]]:
    """Group the action tokens of h by street, using board-card counts as
    street separators."""
    out: list[list[str]] = [[], [], [], []]
    street = 0
    cards_seen = 0
    for x in h[4:]:
        if isinstance(x, int):
            cards_seen += 1
            if cards_seen == 3:
                street = 1
            elif cards_seen == 4:
                street = 2
            elif cards_seen == 5:
                street = 3
        else:
            out[street].append(x)
    return out
