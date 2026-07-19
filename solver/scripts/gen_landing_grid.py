"""Bake the solver's root-node range grid into static JSON for the landing page.

Evaluates the exported ONNX strategy network (the exact artifact the browser
runs) at the game's first decision -- Button/SB preflop, 100 BB heads-up --
for every combo of all 169 starting-hand classes, and emits the 13x13 grid
of action mixes. The landing page renders this JSON as static markup, so the
hero graphic is genuine solver output, not an illustration.

Mirrors src/lib/gto/ranges.ts computeRangeGrid at the empty action line:
per-combo network evaluation, non-negative clipping over legal actions,
renormalization, then a plain average over the class's combos.

Usage:
  python scripts/gen_landing_grid.py > ../src/lib/gto/landing-grid.json
"""

import json
import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.games.holdem import HoldemGame  # noqa: E402

MODEL_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "public"
    / "models"
    / "holdem_strategy.onnx"
)

# Grid index 0 = Ace ... 12 = Deuce, matching RANK_CHARS in ranges.ts.
RANK_CHARS = "AKQJT98765432"


def engine_rank(grid_index: int) -> int:
    """Engine rank (12 = A ... 0 = 2) for a grid row/col (0 = A)."""
    return 12 - grid_index


def hand_classes():
    for row in range(13):
        for col in range(13):
            hi = RANK_CHARS[min(row, col)]
            lo = RANK_CHARS[max(row, col)]
            if row == col:
                yield {"label": f"{hi}{lo}", "row": row, "col": col, "kind": "pair"}
            elif col > row:
                yield {"label": f"{hi}{lo}s", "row": row, "col": col, "kind": "suited"}
            else:
                yield {"label": f"{hi}{lo}o", "row": row, "col": col, "kind": "offsuit"}


def combos_for(cls) -> list[tuple[int, int]]:
    """Concrete card-int pairs for a class (card = suit * 13 + rank)."""
    r_hi = engine_rank(min(cls["row"], cls["col"]))
    r_lo = engine_rank(max(cls["row"], cls["col"]))
    out = []
    for s1 in range(4):
        for s2 in range(4):
            if cls["kind"] == "pair" and s2 <= s1:
                continue
            if cls["kind"] == "suited" and s1 != s2:
                continue
            if cls["kind"] == "offsuit" and s1 == s2:
                continue
            out.append((s1 * 13 + r_hi, s2 * 13 + r_lo))
    return out


def placeholders(dead: set[int]) -> tuple[int, int]:
    """Two placeholder cards for the opponent's hole slots (never enter
    the acting player's features)."""
    found = [c for c in range(52) if c not in dead][:2]
    return found[0], found[1]


def probs_from_logits(logits, indices) -> list[float]:
    clipped = [max(float(logits[i]), 0.0) for i in indices]
    total = sum(clipped)
    if total <= 0:
        return [1.0 / len(indices)] * len(indices)
    return [v / total for v in clipped]


def main():
    game = HoldemGame()

    # Root decision node: any four hole cards make the histories concrete;
    # the acting player's features only see their own two.
    probe = (0, 1, 2, 3)
    assert not game.is_chance(probe) and not game.is_terminal(probe)
    assert game.current_player(probe) == 0, "root must be Button/SB to act"
    actions = game.legal_actions(probe)
    indices = game.legal_action_indices(probe)

    classes = list(hand_classes())
    rows = [(cls, combos_for(cls)) for cls in classes]
    flat = [combo for _, combos in rows for combo in combos]

    features = np.zeros((len(flat), game.feature_dim), dtype=np.float32)
    for i, (c0, c1) in enumerate(flat):
        d0, d1 = placeholders({c0, c1})
        features[i] = game.infoset_features((c0, c1, d0, d1))

    sess = ort.InferenceSession(str(MODEL_PATH))
    logits = sess.run(["action_logits"], {"features": features})[0]

    cells = []
    aggregate = np.zeros(len(indices))
    offset = 0
    for cls, combos in rows:
        avg = np.zeros(len(indices))
        for k in range(len(combos)):
            avg += probs_from_logits(logits[offset + k], indices)
        offset += len(combos)
        avg /= len(combos)
        cells.append(
            {
                "label": cls["label"],
                "probs": [round(float(p), 4) for p in avg],
            }
        )
        aggregate += avg * len(combos)
    aggregate /= len(flat)

    print(
        json.dumps(
            {
                "node": "Button/SB first decision, preflop, 100 BB effective",
                "modelFile": "public/models/holdem_strategy.onnx",
                "generatedBy": "solver/scripts/gen_landing_grid.py",
                "actions": actions,
                "aggregate": [round(float(p), 4) for p in aggregate],
                "cells": cells,
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
