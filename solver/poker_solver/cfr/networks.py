"""Networks for Deep CFR (Brown et al. 2019).

Both the per-player advantage networks and the final average-strategy
network share the same architecture: a small fully-connected net mapping
an infoset feature vector to one output per canonical action. Illegal
actions are masked by the caller, never by the network.
"""

import torch
from torch import nn


class InfosetNet(nn.Module):
    def __init__(self, feature_dim: int, max_actions: int, hidden: int = 128, layers: int = 3):
        super().__init__()
        dims = [feature_dim] + [hidden] * layers
        blocks: list[nn.Module] = []
        for d_in, d_out in zip(dims[:-1], dims[1:]):
            blocks.append(nn.Linear(d_in, d_out))
            blocks.append(nn.ReLU())
        self.body = nn.Sequential(*blocks)
        self.head = nn.Linear(dims[-1], max_actions)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.body(x))


def regret_matching(advantages: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
    """Strategy from predicted advantages over one infoset.

    Positive-part normalization over legal actions; if no legal action has
    positive predicted advantage, play the highest-advantage legal action
    deterministically (the choice used in the Deep CFR paper).

    advantages, mask: 1-D tensors of length max_actions (mask is 1 for
    legal actions, 0 otherwise). Returns a probability vector over the
    canonical action space with zero mass on illegal actions.
    """
    pos = torch.clamp(advantages, min=0.0) * mask
    total = pos.sum()
    if total > 0:
        return pos / total
    masked = torch.where(mask > 0, advantages, torch.tensor(-torch.inf))
    out = torch.zeros_like(advantages)
    out[int(torch.argmax(masked))] = 1.0
    return out
