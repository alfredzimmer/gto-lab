"""Deep CFR (Brown, Lerer, Gross, Sandholm 2019) with external-sampling
MCCFR traversals, generic over the `Game` interface.

Algorithm outline, per the paper:

  for t = 1..T:
    for each player p:
      run K external-sampling traversals with p as the traverser:
        - at p's decision nodes, walk ALL actions; the instantaneous
          regret vector (child value minus node value under the current
          regret-matching strategy) is stored in p's advantage memory
        - at the opponent's nodes, store the current strategy in the
          strategy memory, then SAMPLE one action and continue
        - at chance nodes, sample one outcome
      retrain p's advantage network FROM SCRATCH on p's advantage memory
      (regret-matching over its outputs then defines p's next strategy)
  finally, train the strategy network on the strategy memory; it predicts
  the iteration-weighted average strategy, which is what converges to a
  Nash equilibrium (the individual iterates do not).

Loss weighting: both memories store the iteration t of each sample and
losses are weighted proportionally to t (linear CFR weighting, as in the
paper), which discounts the noisy early iterations.

Traversal-time network evaluation happens on CPU regardless of the
training device: traversals make thousands of single-row forward passes
through tiny nets, where GPU/MPS kernel-launch latency dominates any
compute win. Training minibatches run on the requested device.
"""

import random

import numpy as np
import torch

from poker_solver.cfr.buffers import ReservoirBuffer
from poker_solver.cfr.networks import InfosetNet, regret_matching
from poker_solver.games.base import Game


class DeepCFR:
    def __init__(
        self,
        game: Game,
        hidden: int = 128,
        layers: int = 3,
        advantage_capacity: int = 200_000,
        strategy_capacity: int = 400_000,
        train_device: str = "cpu",
        seed: int = 0,
    ):
        assert game.feature_dim is not None and game.max_actions is not None, (
            "game must implement the Deep CFR interface "
            "(feature_dim, max_actions, infoset_features, legal_action_indices)"
        )
        self.game = game
        self.hidden = hidden
        self.layers = layers
        self.train_device = torch.device(train_device)
        self._rng = random.Random(seed)
        torch.manual_seed(seed)

        self.advantage_nets = [self._new_net() for _ in range(game.num_players)]
        self.advantage_memories = [
            ReservoirBuffer(advantage_capacity, seed=seed + 1 + p)
            for p in range(game.num_players)
        ]
        self.strategy_memory = ReservoirBuffer(strategy_capacity, seed=seed + 101)
        self.strategy_net: InfosetNet | None = None
        self.iteration = 0

    def _new_net(self) -> InfosetNet:
        return InfosetNet(
            self.game.feature_dim, self.game.max_actions, self.hidden, self.layers
        )

    def _mask_for(self, h) -> np.ndarray:
        mask = np.zeros(self.game.max_actions, dtype=np.float32)
        for idx in self.game.legal_action_indices(h):
            mask[idx] = 1.0
        return mask

    def _current_strategy(self, net: InfosetNet, features: np.ndarray, mask: np.ndarray) -> np.ndarray:
        with torch.no_grad():
            adv = net(torch.from_numpy(features))
        sigma = regret_matching(adv, torch.from_numpy(mask))
        return sigma.numpy()

    def _traverse(self, h, traverser: int) -> float:
        game = self.game

        if game.is_terminal(h):
            return float(game.returns(h)[traverser])

        if game.is_chance(h):
            outcomes = game.chance_outcomes(h)
            actions, probs = zip(*outcomes)
            a = self._rng.choices(actions, weights=probs, k=1)[0]
            return self._traverse(game.next_history(h, a), traverser)

        player = game.current_player(h)
        actions = game.legal_actions(h)
        indices = game.legal_action_indices(h)
        features = game.infoset_features(h)
        mask = self._mask_for(h)
        sigma_full = self._current_strategy(self.advantage_nets[player], features, mask)

        if player == traverser:
            child_values = np.zeros(game.max_actions, dtype=np.float64)
            node_value = 0.0
            for a, idx in zip(actions, indices):
                v = self._traverse(game.next_history(h, a), traverser)
                child_values[idx] = v
                node_value += sigma_full[idx] * v
            regrets = np.zeros(game.max_actions, dtype=np.float32)
            for idx in indices:
                regrets[idx] = child_values[idx] - node_value
            self.advantage_memories[traverser].add(
                features, mask, regrets, self.iteration
            )
            return node_value

        # Opponent node: record the strategy sample, then sample one action.
        self.strategy_memory.add(
            features, mask, sigma_full.astype(np.float32), self.iteration
        )
        legal_probs = [sigma_full[idx] for idx in indices]
        a = self._rng.choices(actions, weights=legal_probs, k=1)[0]
        return self._traverse(game.next_history(h, a), traverser)

    def _train_net(
        self,
        net: InfosetNet,
        memory: ReservoirBuffer,
        sgd_steps: int,
        batch_size: int,
        lr: float,
    ):
        net.to(self.train_device)
        net.train()
        optimizer = torch.optim.Adam(net.parameters(), lr=lr)
        for _ in range(sgd_steps):
            features, masks, targets, weights = memory.sample_batch(
                batch_size, self.train_device
            )
            preds = net(features)
            per_sample = ((preds - targets) ** 2 * masks).sum(dim=1)
            loss = (weights / weights.mean() * per_sample).mean()
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
        net.to("cpu")
        net.eval()

    def run_iteration(
        self,
        traversals_per_player: int = 300,
        sgd_steps: int = 300,
        batch_size: int = 256,
        lr: float = 1e-3,
    ):
        self.iteration += 1
        for p in range(self.game.num_players):
            for _ in range(traversals_per_player):
                self._traverse(self.game.initial_history(), p)
            # Fresh network each iteration, per the paper: it must fit the
            # cumulative (reservoir-sampled) regrets, not chase the latest.
            self.advantage_nets[p] = self._new_net()
            self._train_net(
                self.advantage_nets[p], self.advantage_memories[p], sgd_steps, batch_size, lr
            )

    def train_strategy_net(
        self, sgd_steps: int = 1000, batch_size: int = 512, lr: float = 1e-3
    ) -> InfosetNet:
        net = self._new_net()
        self._train_net(net, self.strategy_memory, sgd_steps, batch_size, lr)
        self.strategy_net = net
        return net

    # ---- Strategy extraction (small games only) ----

    def strategy_probs(self, h) -> np.ndarray:
        """Average-strategy action probabilities (over legal actions, in
        legal_actions(h) order) at h, from the trained strategy network."""
        assert self.strategy_net is not None, "call train_strategy_net() first"
        features = self.game.infoset_features(h)
        mask = self._mask_for(h)
        with torch.no_grad():
            logits = self.strategy_net(torch.from_numpy(features))
        clipped = torch.clamp(logits, min=0.0) * torch.from_numpy(mask)
        indices = self.game.legal_action_indices(h)
        probs = np.array([float(clipped[i]) for i in indices])
        if probs.sum() <= 0:
            return np.full(len(indices), 1 / len(indices))
        return probs / probs.sum()

    def extract_full_strategy(self) -> dict[str, list[float]]:
        """Enumerate every reachable infoset (tractable for Kuhn/Leduc) and
        query the strategy net, producing the dict format the exact
        exploitability calculator consumes."""
        strategy: dict[str, list[float]] = {}

        def walk(h):
            game = self.game
            if game.is_terminal(h):
                return
            if game.is_chance(h):
                for a, _ in game.chance_outcomes(h):
                    walk(game.next_history(h, a))
                return
            key = game.infoset_key(h)
            if key not in strategy:
                strategy[key] = list(self.strategy_probs(h))
            for a in game.legal_actions(h):
                walk(game.next_history(h, a))

        walk(self.game.initial_history())
        return strategy
