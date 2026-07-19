"""Export a trained Deep CFR strategy network to ONNX for in-browser
inference via onnxruntime-web, and verify output parity between the
PyTorch and ONNX versions on a batch of real infoset encodings.

Usage:
  python scripts/export_onnx.py runs/holdem_v1/checkpoint.pt \
      --out ../public/models/holdem_strategy.onnx
"""

import argparse
import random
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from poker_solver.cfr.networks import InfosetNet  # noqa: E402
from poker_solver.games.holdem import HoldemGame  # noqa: E402


def sample_infoset_features(game, n, seed=0):
    """Collect feature vectors from n random reachable decision nodes."""
    rng = random.Random(seed)
    feats = []
    while len(feats) < n:
        h = game.initial_history()
        while not game.is_terminal(h):
            if game.is_chance(h):
                outcomes = game.chance_outcomes(h)
                a = rng.choices(
                    [a for a, _ in outcomes], [p for _, p in outcomes], k=1
                )[0]
            else:
                feats.append(game.infoset_features(h))
                if len(feats) >= n:
                    break
                a = rng.choice(game.legal_actions(h))
            h = game.next_history(h, a)
    return np.stack(feats[:n])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("checkpoint")
    ap.add_argument("--out", default="runs/holdem_strategy.onnx")
    args = ap.parse_args()

    game = HoldemGame()
    ckpt = torch.load(args.checkpoint, map_location="cpu", weights_only=False)
    train_args = ckpt["args"]
    net = InfosetNet(
        game.feature_dim, game.max_actions, train_args["hidden"], train_args["layers"]
    )
    net.load_state_dict(ckpt["strategy_net"])
    net.eval()

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    example = torch.zeros(1, game.feature_dim)
    torch.onnx.export(
        net,
        (example,),
        str(out_path),
        input_names=["features"],
        output_names=["action_logits"],
        dynamic_axes={"features": {0: "batch"}, "action_logits": {0: "batch"}},
        opset_version=17,
        dynamo=False,
    )

    # Parity check on real infoset encodings.
    import onnxruntime as ort

    feats = sample_infoset_features(game, 256)
    with torch.no_grad():
        torch_out = net(torch.from_numpy(feats)).numpy()
    sess = ort.InferenceSession(str(out_path))
    onnx_out = sess.run(["action_logits"], {"features": feats})[0]
    max_diff = float(np.abs(torch_out - onnx_out).max())
    assert max_diff < 1e-4, f"ONNX/PyTorch mismatch: {max_diff}"
    size_kb = out_path.stat().st_size / 1024
    print(
        f"exported {out_path} ({size_kb:.0f} KB), "
        f"iteration {ckpt['iteration']}, max |torch - onnx| = {max_diff:.2e}"
    )


if __name__ == "__main__":
    main()
