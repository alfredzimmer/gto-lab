"""7-card hand evaluator over int cards 0..51.

rank = card % 13 (0 = deuce ... 12 = ace), suit = card // 13.

`evaluate7` returns an orderable tuple -- higher tuple = better hand --
(category, tiebreak ranks...), category 0..8:
  0 high card, 1 pair, 2 two pair, 3 trips, 4 straight, 5 flush,
  6 full house, 7 quads, 8 straight flush.

Plain Python, no lookup tables: a showdown costs one pass over 7 cards.
This is the training-loop hot path only through terminal nodes, which
profiling shows is dwarfed by network forward passes, so clarity wins
over a Cactus-Kev port here. (The TypeScript app keeps its own fast
evaluator; this one exists so the Python game tree is self-contained.)
"""

from collections import Counter


def _straight_high(rank_set: set[int]) -> int | None:
    """Highest straight top-rank present, or None. Ace plays low in the
    wheel (A-2-3-4-5) via the rank -1 alias."""
    ranks = set(rank_set)
    if 12 in ranks:
        ranks.add(-1)
    best = None
    for high in range(12, 2, -1):
        if all((high - i) in ranks for i in range(5)):
            best = high
            break
    return best


def evaluate7(cards: list[int]) -> tuple:
    ranks = [c % 13 for c in cards]
    suits = [c // 13 for c in cards]
    rank_counts = Counter(ranks)
    suit_counts = Counter(suits)

    # Flush / straight flush
    flush_suit = next((s for s, n in suit_counts.items() if n >= 5), None)
    if flush_suit is not None:
        flush_ranks = sorted((r for r, s in zip(ranks, suits) if s == flush_suit), reverse=True)
        sf_high = _straight_high(set(flush_ranks))
        if sf_high is not None:
            return (8, sf_high)

    # Group ranks by multiplicity, then by rank, descending.
    by_count = sorted(rank_counts.items(), key=lambda rc: (rc[1], rc[0]), reverse=True)

    if by_count[0][1] == 4:
        quad = by_count[0][0]
        kicker = max(r for r in ranks if r != quad)
        return (7, quad, kicker)

    if by_count[0][1] == 3:
        trips = by_count[0][0]
        pair = next((r for r, n in by_count[1:] if n >= 2), None)
        if pair is not None:
            return (6, trips, pair)

    if flush_suit is not None:
        return (5, *flush_ranks[:5])

    straight = _straight_high(set(ranks))
    if straight is not None:
        return (4, straight)

    if by_count[0][1] == 3:
        trips = by_count[0][0]
        kickers = sorted((r for r in ranks if r != trips), reverse=True)[:2]
        return (3, trips, *kickers)

    if by_count[0][1] == 2:
        if by_count[1][1] == 2:
            hi, lo = by_count[0][0], by_count[1][0]
            # A third pair's rank can only play as a kicker.
            kicker = max(r for r in ranks if r != hi and r != lo)
            return (2, hi, lo, kicker)
        pair = by_count[0][0]
        kickers = sorted((r for r in ranks if r != pair), reverse=True)[:3]
        return (1, pair, *kickers)

    return (0, *sorted(ranks, reverse=True)[:5])
