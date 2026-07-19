"""Leduc Hold'em: the standard second benchmark game in the CFR literature
(Southey et al. 2005; used throughout Zinkevich et al. 2007 and the Deep CFR
paper's own validation). Big enough that no closed-form equilibrium is
known, so correctness here is proven the same way it will be for the real
heads-up NLHE game later: by showing the exact best-response
exploitability of the converged strategy goes to (near) zero.

Rules:
- 6-card deck: ranks {J=0, Q=1, K=2}, two suits each, i.e. card // 2 is the
  rank. Each of the 2 players antes 1 chip and is dealt one private card.
- Two betting rounds ("preflop" and "postflop"). After preflop betting
  closes, one public board card is revealed.
- Fixed-limit betting: bet size is 2 chips preflop, 4 chips postflop.
  At most 2 bets total per round (bet, then a single raise), then a
  player facing the cap may only call or fold.
- Player 0 acts first in both rounds.
- Showdown: a hole card matching the board card's rank beats any
  non-pair; otherwise higher hole-card rank wins; equal rank splits the
  pot. (At most one player can pair the board -- only two copies of each
  rank exist and one is already on the board.)

History encoding: (card0, card1, *preflop_action_tokens, [board_card],
*postflop_action_tokens), where action tokens are the strings 'c' (check/
call), 'r' (bet/raise), 'f' (fold), and card slots are ints -- the two
types are used to disambiguate an action token from the board-card chance
draw when replaying a history.
"""

import numpy as np

from poker_solver.games.base import Game

CHECK_CALL = "c"
RAISE = "r"
FOLD = "f"
MAX_RAISES_PER_ROUND = 2
BET_SIZE = (2, 4)  # (preflop, postflop)
ANTE = 1
NUM_CARDS = 6


def _rank(card: int) -> int:
    return card // 2


def _stage_complete(seq: str) -> bool:
    if seq == "":
        return False
    if seq == "cc":
        return True
    return len(seq) >= 2 and seq[-1] == "c" and seq[-2] == "r"


def _legal_actions_for(seq: str) -> list[str]:
    if seq == "" or seq == "c":
        return [CHECK_CALL, RAISE]
    # seq[-1] must be 'r' here (otherwise the stage would already be
    # complete or terminal, and callers only call this on live stages)
    if seq.count(RAISE) >= MAX_RAISES_PER_ROUND:
        return [FOLD, CHECK_CALL]
    return [FOLD, CHECK_CALL, RAISE]


def _parse(h):
    """Replay a history into a structured description of the game state.

    Returns a dict with keys: status ('chance_hole', 'chance_board',
    'preflop', 'postflop', 'fold', 'showdown'), preflop (str), postflop
    (str), board (int|None), folder (0|1|None).
    """
    if len(h) < 2:
        return {"status": "chance_hole"}

    idx = 2
    n = len(h)
    preflop_tokens: list[str] = []
    while idx < n and isinstance(h[idx], str):
        preflop_tokens.append(h[idx])
        idx += 1
        if preflop_tokens[-1] == FOLD:
            return {
                "status": "fold",
                "preflop": "".join(preflop_tokens),
                "postflop": "",
                "board": None,
                "folder": (len(preflop_tokens) - 1) % 2,
            }
        if _stage_complete("".join(preflop_tokens)):
            break

    preflop = "".join(preflop_tokens)
    if not _stage_complete(preflop):
        return {"status": "preflop", "preflop": preflop, "postflop": "", "board": None}

    if idx >= n:
        return {"status": "chance_board", "preflop": preflop, "postflop": "", "board": None}

    board = h[idx]
    idx += 1
    postflop_tokens: list[str] = []
    while idx < n and isinstance(h[idx], str):
        postflop_tokens.append(h[idx])
        idx += 1
        if postflop_tokens[-1] == FOLD:
            return {
                "status": "fold",
                "preflop": preflop,
                "postflop": "".join(postflop_tokens),
                "board": board,
                "folder": (len(postflop_tokens) - 1) % 2,
            }
        if _stage_complete("".join(postflop_tokens)):
            break

    postflop = "".join(postflop_tokens)
    if _stage_complete(postflop):
        return {"status": "showdown", "preflop": preflop, "postflop": postflop, "board": board}
    return {"status": "postflop", "preflop": preflop, "postflop": postflop, "board": board}


def _stage_contributions(seq: str, bet_size: int) -> list[int]:
    contrib = [0, 0]
    outstanding = 0
    player = 0
    for ch in seq:
        if ch == CHECK_CALL:
            contrib[player] = outstanding * bet_size
        elif ch == RAISE:
            outstanding += 1
            contrib[player] = outstanding * bet_size
        player = 1 - player
    return contrib


class LeducPoker(Game):
    num_players = 2

    def initial_history(self):
        return ()

    def is_chance(self, h):
        return _parse(h)["status"] in ("chance_hole", "chance_board")

    def chance_outcomes(self, h):
        state = _parse(h)
        if state["status"] == "chance_hole":
            if len(h) == 0:
                return [(c, 1 / NUM_CARDS) for c in range(NUM_CARDS)]
            remaining = [c for c in range(NUM_CARDS) if c != h[0]]
            return [(c, 1 / len(remaining)) for c in remaining]
        # chance_board
        used = {h[0], h[1]}
        remaining = [c for c in range(NUM_CARDS) if c not in used]
        return [(c, 1 / len(remaining)) for c in remaining]

    def is_terminal(self, h):
        return _parse(h)["status"] in ("fold", "showdown")

    def returns(self, h):
        state = _parse(h)
        preflop_contrib = _stage_contributions(state["preflop"], BET_SIZE[0])
        postflop_contrib = (
            _stage_contributions(state["postflop"], BET_SIZE[1])
            if state["board"] is not None
            else [0, 0]
        )
        invested = [
            ANTE + preflop_contrib[i] + postflop_contrib[i] for i in (0, 1)
        ]

        if state["status"] == "fold":
            folder = state["folder"]
            winner = 1 - folder
            net = [0.0, 0.0]
            net[winner] = invested[folder]
            net[folder] = -invested[folder]
            return net

        # showdown
        card0, card1, board = h[0], h[1], state["board"]
        r0, r1, rb = _rank(card0), _rank(card1), _rank(board)
        pair0 = r0 == rb
        pair1 = r1 == rb
        if pair0 and not pair1:
            winner = 0
        elif pair1 and not pair0:
            winner = 1
        elif r0 > r1:
            winner = 0
        elif r1 > r0:
            winner = 1
        else:
            return [0.0, 0.0]

        net = [0.0, 0.0]
        loser = 1 - winner
        net[winner] = invested[loser]
        net[loser] = -invested[loser]
        return net

    def current_player(self, h):
        state = _parse(h)
        if state["status"] == "preflop":
            return len(state["preflop"]) % 2
        return len(state["postflop"]) % 2

    def legal_actions(self, h):
        state = _parse(h)
        seq = state["preflop"] if state["status"] == "preflop" else state["postflop"]
        return _legal_actions_for(seq)

    def infoset_key(self, h):
        state = _parse(h)
        player = self.current_player(h)
        card = h[player]
        board = state["board"] if state["board"] is not None else "-"
        return f"{card}|{board}|{state['preflop']}|{state['postflop']}"

    # ---- Deep CFR interface ----
    # Suits are strategically irrelevant in Leduc (only rank matters for
    # showdown), so features encode ranks: hole rank one-hot (3) + board
    # {none, J, Q, K} one-hot (4) + per-round betting tokens, 4 slots per
    # round one-hot over {f, c, r} (2 rounds x 4 x 3 = 24). Total 31.

    feature_dim = 31
    max_actions = 3  # canonical: 0 = FOLD, 1 = CHECK_CALL, 2 = RAISE

    _ACTION_INDEX = {FOLD: 0, CHECK_CALL: 1, RAISE: 2}

    def infoset_features(self, h):
        state = _parse(h)
        player = self.current_player(h)
        x = np.zeros(self.feature_dim, dtype=np.float32)
        x[_rank(h[player])] = 1.0
        if state["board"] is None:
            x[3] = 1.0
        else:
            x[4 + _rank(state["board"])] = 1.0
        for round_idx, seq in enumerate((state["preflop"], state["postflop"])):
            base = 7 + round_idx * 12
            for slot, ch in enumerate(seq[:4]):
                x[base + slot * 3 + self._ACTION_INDEX[ch]] = 1.0
        return x

    def legal_action_indices(self, h):
        return [self._ACTION_INDEX[a] for a in self.legal_actions(h)]
