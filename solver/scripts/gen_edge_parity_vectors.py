"""Generate TARGETED (not randomly-sampled) cross-language parity vectors
for edge cases that `scripts/gen_parity_vectors.py`'s random-line sampling
essentially never reaches:

  - the raise-cap boundary (exactly MAX_RAISES_PER_STREET aggressive
    actions taken on a street: b0/b1 must disappear from legal actions,
    but all-in must remain -- see `test_raise_cap_limits_aggression_per_street`
    in tests/test_holdem.py for the Python-side version of this check;
    this generates the TS-side equivalent as a directed vector instead of
    hoping random sampling stumbles onto exactly 3 raises).
  - the min-raise-clamp-to-all-in collapse (remaining stack too short for
    the b0/b1 pot-fraction grid, so only 'a' remains as an aggressive
    option).
  - showdown ties/wheel-straights/split-pots/kickers at terminal nodes,
    which need specific hole/board cards that essentially never occur
    among the ~20 terminal vectors random sampling produces.

Note on banker's-rounding ties (NOT generated here): the b0 (half-pot)
bet size is `round(0.5 * pot_after_call)`, which only has a genuine
round-half-to-even tie when `pot_after_call` is odd. This game's betting
structure makes that impossible: a street only closes when both players'
street contributions are equal, so by induction both players' total
contributions are always equal at the start of every street, and
`pot_after_call = 2*prior_contrib + 2*street_contrib(opp)` is therefore
always even (verified exhaustively in
`tests/test_holdem.py::test_pot_after_call_is_always_even`, and spot-checked
here empirically over thousands of random hands during development -- 0
odd values found). There is no reachable tie for a parity vector to cover.

Usage:
  python scripts/gen_edge_parity_vectors.py > ../src/lib/gto/parity-vectors-edge.json
"""

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.games.holdem import HoldemGame, MAX_RAISES_PER_STREET, _parse  # noqa: E402

# Fixed, arbitrary-but-valid hole/board cards for the action-sequence
# (non-showdown) vectors below -- card identity doesn't matter for these,
# only the betting sequence does.
_ACTION_HOLE = (0, 13, 26, 39)
_ACTION_FLOP = (4, 17, 30)


def _record_decision(game, h):
    s = _parse(h)
    feats = game.infoset_features(h)
    nonzero = {str(i): round(float(v), 6) for i, v in enumerate(feats) if v != 0}
    return {
        "history": list(h),
        "player": game.current_player(h),
        "legalActions": game.legal_actions(h),
        "legalIndices": game.legal_action_indices(h),
        "street": s.street,
        "pot": s.contrib[0] + s.contrib[1],
        "toCall": s.street_contrib[1 - s.to_act] - s.street_contrib[s.to_act],
        "features": nonzero,
    }


def _play(game, h, tokens):
    for tok in tokens:
        assert tok in game.legal_actions(h), (h, tok, game.legal_actions(h))
        h = game.next_history(h, tok)
    return h


def raise_cap_vectors(game):
    """Three pot-sized preflop raises reach the cap: the 4th decision must
    exclude b0/b1 but keep 'a' (all-in is always available with chips
    behind, regardless of the raise cap -- see
    `test_raise_cap_limits_aggression_per_street`)."""
    out = []
    h = _ACTION_HOLE
    # Before the cap (2 raises taken): b0/b1 must still be legal, for
    # contrast with the at-cap vector below.
    h2 = _play(game, h, ("b1", "b1"))
    v = _record_decision(game, h2)
    assert "b0" in v["legalActions"] and "b1" in v["legalActions"]
    out.append(v)

    h3 = _play(game, h, ("b1", "b1", "b1"))
    s = _parse(h3)
    assert s.raises == MAX_RAISES_PER_STREET
    v = _record_decision(game, h3)
    assert "b0" not in v["legalActions"] and "b1" not in v["legalActions"]
    assert "a" in v["legalActions"]
    out.append(v)
    return out


def all_in_clamp_vectors(game):
    """After enough preflop and flop betting, the remaining stack is too
    short for the b0/b1 pot-fraction grid to fit: both collapse and only
    'a' remains as an aggressive option, well before the raise cap."""
    h = _play(game, _ACTION_HOLE, ("b1", "b1", "c"))
    h = h + _ACTION_FLOP
    h = _play(game, h, ("b1", "b1"))
    v = _record_decision(game, h)
    assert "b0" not in v["legalActions"] and "b1" not in v["legalActions"]
    assert "a" in v["legalActions"]
    return [v]


# ---- Showdown edge cases ----
# Each entry: hero hole, villain hole, board (flop3+turn+river), and a short
# note on the pattern being exercised. Both players check every street, so
# the hand always reaches showdown regardless of card strength. Card
# encoding: card = suit*13 + rank, rank 0..12 = 2..A (ace also plays low in
# straights).


def _card(suit: int, rank: int) -> int:
    return suit * 13 + rank


_SHOWDOWN_CASES = [
    {
        "note": "wheel straight (A-2-3-4-5) beats a made pair",
        "hero": (_card(0, 12), _card(0, 3)),  # Ac, 5c
        "villain": (_card(0, 11), _card(1, 11)),  # Kc, Kd
        "board": [_card(1, 0), _card(2, 1), _card(3, 2), _card(0, 6), _card(1, 7)],
        # board ranks: 2,3,4,8,9 -- with hero's A,5 completes A2345.
    },
    {
        "note": "same category (one pair via a paired board), tie broken by kicker",
        "hero": (_card(1, 12), _card(2, 1)),  # Ad, 3h
        "villain": (_card(3, 11), _card(1, 2)),  # Ks, 4d
        "board": [_card(0, 10), _card(1, 10), _card(2, 0), _card(3, 5), _card(0, 7)],
        # board pairs Q,Q; hero kicker A beats villain kicker K.
    },
    {
        "note": "exact split pot: the board's straight plays for both hands",
        "hero": (_card(1, 0), _card(2, 1)),  # 2d, 3h
        "villain": (_card(3, 2), _card(0, 3)),  # 4s, 5c
        "board": [_card(0, 12), _card(1, 11), _card(2, 10), _card(3, 9), _card(0, 8)],
        # board is A-K-Q-J-T, a made broadway straight neither hole pair improves.
    },
    {
        "note": "full house vs. full house: higher trip rank wins, and the "
        "winner must choose which of two available trips to use as the trip",
        "hero": (_card(1, 11), _card(2, 11)),  # Kd, Kh -- pairs board Ks -> KKK + 88 kept as pair
        "villain": (_card(2, 0), _card(3, 0)),  # 2h, 2s -- pairs board 2c -> 222, loses to hero's KKK88
        "board": [_card(0, 6), _card(1, 6), _card(3, 6), _card(0, 11), _card(0, 0)],
        # board: 8c,8d,8s (trip 8s), Kc, 2c. Hero: KKK (better trip) + 88 pair
        # -- beats using 888 as the trip. Villain: 888 (higher than 222) + 22
        # pair -- beats using 222 as the trip. Hero's KKK88 > villain's 88822.
    },
]


def showdown_vectors(game):
    out = []
    for case in _SHOWDOWN_CASES:
        h = (*case["hero"], *case["villain"])
        h = _play(game, h, ("c", "c"))  # preflop: SB completes, BB checks
        h = h + tuple(case["board"][:3])
        h = _play(game, h, ("c", "c"))  # flop check/check
        h = h + (case["board"][3],)
        h = _play(game, h, ("c", "c"))  # turn check/check
        h = h + (case["board"][4],)
        h = _play(game, h, ("c", "c"))  # river check/check
        assert game.is_terminal(h)
        r = game.returns(h)
        out.append({"history": list(h), "terminalReturns": list(r), "note": case["note"]})
    return out


def main():
    game = HoldemGame()
    vectors = (
        raise_cap_vectors(game)
        + all_in_clamp_vectors(game)
        + showdown_vectors(game)
    )
    print(json.dumps({"featureDim": game.feature_dim, "vectors": vectors}, indent=2))


if __name__ == "__main__":
    main()
