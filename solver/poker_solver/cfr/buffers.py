"""Reservoir-sampled experience memory for Deep CFR.

Deep CFR trains its networks on samples collected across ALL iterations
(the average over iterations is what converges to equilibrium, not the
last iterate), so the memory must hold an unbiased uniform sample of
everything ever inserted even once full. Reservoir sampling (Vitter 1985)
gives exactly that with O(1) per insert.

Each record is (features, mask, target, iteration): `target` is the
instantaneous regret vector for advantage memories or the strategy
probability vector for the strategy memory; `iteration` provides the
linear-CFR weighting t used in the training losses.
"""

import random

import numpy as np
import torch


class ReservoirBuffer:
    def __init__(self, capacity: int, seed: int | None = None):
        self.capacity = capacity
        self.data: list[tuple[np.ndarray, np.ndarray, np.ndarray, int]] = []
        self.num_seen = 0
        self._rng = random.Random(seed)

    def add(self, features: np.ndarray, mask: np.ndarray, target: np.ndarray, iteration: int):
        self.num_seen += 1
        record = (features, mask, target, iteration)
        if len(self.data) < self.capacity:
            self.data.append(record)
            return
        j = self._rng.randrange(self.num_seen)
        if j < self.capacity:
            self.data[j] = record

    def __len__(self):
        return len(self.data)

    def sample_batch(self, batch_size: int, device) -> tuple[torch.Tensor, ...]:
        batch = self._rng.choices(self.data, k=min(batch_size, len(self.data)))
        features = torch.from_numpy(np.stack([b[0] for b in batch])).to(device)
        masks = torch.from_numpy(np.stack([b[1] for b in batch])).to(device)
        targets = torch.from_numpy(np.stack([b[2] for b in batch])).to(device)
        weights = torch.tensor([float(b[3]) for b in batch], device=device)
        return features, masks, targets, weights
