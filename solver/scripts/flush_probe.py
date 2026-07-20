"""Flush-awareness acceptance probe for the shipped strategy net.

This is the decisive new signal for the suit-canonicalization retrain (see
solver/VERIFICATION.md). It measures two things on the exported ONNX model
using the real training-time feature encoder (HoldemGame.infoset_features):

  1. FLUSH SENSITIVITY (the model signal) -- holding a flush draw / made
     flush must produce a materially different strategy than the same ranks
     off-suit, and in a sensible direction. Reported as strategy
     total-variation distance (TVD) plus the change in aggression (bet+raise
     +all-in mass). Before the fix the shipped net barely reacted: max TVD
     ~0.10 across these spots, often the wrong direction, because the raw
     per-card encoding buried the flush interaction under per-suit weight
     noise (an identical made flush rotated across suits swung up to 0.32).
     A genuinely flush-aware retrain should clear MIN_FLUSH_TVD comfortably.
     NOTE: the threshold is a heuristic gate, not a proof -- read the printed
     per-spot numbers and directions, and compare against the ~0.10 baseline.

  2. SUIT SYMMETRY (an encoder invariant, not a model skill) -- the same hand
     rotated across the four suits. The canonicalized encoder maps these to
     byte-identical features, so the TVD is exactly 0 for ANY model; a
     non-zero value would mean the encoder itself lost its canonicalization
     (already unit-tested in tests/test_holdem.py). It does NOT detect a
     stale/mismatched .onnx -- only retraining + LBR + the flush signal above
     do that.

Usage:
  python scripts/flush_probe.py [path/to/holdem_strategy.onnx]
Exit code 0 on PASS, 1 on FAIL.
"""

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.games.holdem import HoldemGame, ACTION_ORDER  # noqa: E402

DEFAULT_MODEL = (
    Path(__file__).resolve().parent.parent.parent
    / "public" / "models" / "holdem_strategy.onnx"
)

# Thresholds. Flush relevance should move real strategy mass -- set above the
# pre-fix shipped model's ~0.10 max so this gates a genuine improvement, not
# just any per-suit wobble (heuristic, see module docstring). Suit relabeling
# must move exactly none (an encoder invariant, independent of the model).
MIN_FLUSH_TVD = 0.15
MAX_SUIT_ROTATION_TVD = 1e-6

game = HoldemGame()
_IDX = {a: i for i, a in enumerate(ACTION_ORDER)}


def _card(name: str) -> int:
    return "cdhs".index(name[1]) * 13 + "23456789TJQKA".index(name[0])


def _strategy(sess, h):
    x = game.infoset_features(h)[None, :].astype(np.float32)
    logits = sess.run(None, {"features": x})[0][0]
    legal = game.legal_actions(h)
    clip = np.array([max(float(logits[_IDX[a]]), 0.0) for a in legal])
    p = clip / clip.sum() if clip.sum() > 0 else np.ones(len(legal)) / len(legal)
    return legal, p


def _tvd(pa, pb) -> float:
    return 0.5 * float(np.abs(np.asarray(pa) - np.asarray(pb)).sum())


def _aggression(legal, p) -> float:
    """Total probability on bet/raise/all-in (a semi-bluff/value proxy)."""
    return float(sum(pr for a, pr in zip(legal, p) if a in ("b0", "b1", "a")))


# Villain hole cards never enter the acting player's features.
_V = [_card("2s"), _card("3s")]


def _flop_decision(hole, board):
    """P1's first-to-act flop decision after a preflop limp/check."""
    return (_V[0], _V[1], hole[0], hole[1], "c", "c", *board)


_FLUSH_PAIRS = [
    ("two-tone 2c Tc 5d, A Q (nut flush draw vs bricks)",
     ["2c", "Tc", "5d"], ["Ac", "Qc"], ["Ah", "Qh"]),
    ("monotone 2c Tc Jc, A K (made nut flush vs no clubs)",
     ["2c", "Tc", "Jc"], ["Ac", "Kc"], ["Ad", "Kh"]),
    ("two-tone 7h 8h 2s, A 9 (2nd-nut flush draw vs none)",
     ["7h", "8h", "2s"], ["Ah", "9h"], ["Ac", "9d"]),
]


def main() -> int:
    model = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_MODEL
    sess = ort.InferenceSession(str(model))
    print(f"probing {model}\n")

    print("FLUSH SENSITIVITY (want max TVD >= %.2f; +aggr = flush hand bets more):"
          % MIN_FLUSH_TVD)
    max_flush = 0.0
    for label, b, hin, hout in _FLUSH_PAIRS:
        board = [_card(c) for c in b]
        la, pa = _strategy(sess, _flop_decision([_card(c) for c in hin], board))
        lb, pb = _strategy(sess, _flop_decision([_card(c) for c in hout], board))
        d = _tvd(pa, pb)
        daggr = _aggression(la, pa) - _aggression(lb, pb)
        max_flush = max(max_flush, d)
        print(f"  TVD={d:.4f}  aggr {daggr:+.3f}  {label}")

    print("\nSUIT SYMMETRY (want TVD <= %.0e; identical hand rotated by suit):"
          % MAX_SUIT_ROTATION_TVD)
    base = _flop_decision([_card("Ac"), _card("Kc")],
                          [_card("2c"), _card("Tc"), _card("Jc")])
    _, p0 = _strategy(sess, base)
    max_rot = 0.0
    for k in (1, 2, 3):
        rot = tuple(
            ((c // 13 + k) % 4) * 13 + (c % 13) if isinstance(c, int) else c
            for c in base
        )
        _, pk = _strategy(sess, rot)
        d = _tvd(p0, pk)
        max_rot = max(max_rot, d)
        print(f"  TVD={d:.6f}  rotate +{k} suit(s)")

    ok_flush = max_flush >= MIN_FLUSH_TVD
    ok_rot = max_rot <= MAX_SUIT_ROTATION_TVD
    print(f"\nmax flush-sensitivity TVD = {max_flush:.4f} -> "
          f"{'PASS' if ok_flush else 'FAIL'}")
    print(f"max suit-rotation TVD     = {max_rot:.6f} -> "
          f"{'PASS' if ok_rot else 'FAIL'}")
    passed = ok_flush and ok_rot
    print("\n" + ("PASS: model is flush-aware and suit-symmetric."
                  if passed else
                  "FAIL: see above (stale .onnx, or model not yet flush-aware)."))
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
