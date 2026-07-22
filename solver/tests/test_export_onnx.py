"""ONNX export round-trip: the shipped model is only useful if PyTorch and
ONNX Runtime agree on its output. `scripts/export_onnx.py` already computes
this comparison (`sample_infoset_features` + a max-abs-diff assert) but only
as a side effect of actually exporting a real trained checkpoint, run by
hand. This test exercises the same export/compare logic as an automated,
CI-safe check: it builds a freshly-initialized (untrained) InfosetNet rather
than loading a checkpoint from `runs/`, since `runs/` is multi-gigabyte and
intentionally not git-tracked -- this test is about the export mechanics
(graph structure, opset, dynamic axes) being faithful, not about the
trained model's quality (that's `test_lbr.py` / `VERIFICATION.md`'s job).
"""

import sys
from pathlib import Path

import numpy as np
import onnxruntime as ort
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from poker_solver.cfr.networks import InfosetNet  # noqa: E402
from poker_solver.games.holdem import HoldemGame  # noqa: E402
from export_onnx import sample_infoset_features  # noqa: E402

MAX_ACTIONS = 6


def test_onnx_export_matches_pytorch_on_real_infosets(tmp_path):
    game = HoldemGame()
    assert game.max_actions == MAX_ACTIONS

    torch.manual_seed(0)
    net = InfosetNet(game.feature_dim, game.max_actions, hidden=64, layers=2)
    net.eval()

    out_path = tmp_path / "model.onnx"
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

    feats = sample_infoset_features(game, 256, seed=0)
    with torch.no_grad():
        torch_out = net(torch.from_numpy(feats)).numpy()

    sess = ort.InferenceSession(str(out_path))
    onnx_out = sess.run(["action_logits"], {"features": feats})[0]

    assert onnx_out.shape == (256, MAX_ACTIONS)
    assert np.isfinite(onnx_out).all()
    max_diff = float(np.abs(torch_out - onnx_out).max())
    assert max_diff < 1e-5, f"ONNX/PyTorch mismatch: {max_diff}"


def test_sampled_features_cover_all_streets_and_have_no_nans():
    game = HoldemGame()
    feats = sample_infoset_features(game, 512, seed=0)
    assert feats.shape == (512, game.feature_dim)
    assert np.isfinite(feats).all()

    # Street one-hot lives at offset 104 (4 slots): confirm the sample walk
    # actually reaches decisions on every street, not just preflop.
    street_onehot = feats[:, 104:108]
    streets_seen = set(int(i) for i in np.argmax(street_onehot, axis=1))
    assert streets_seen == {0, 1, 2, 3}
