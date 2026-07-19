"""Vanilla tabular CFR (Zinkevich et al., 2007) with exact chance-node
expectation (no sampling) -- appropriate for game trees small enough to
enumerate fully, like Kuhn and Leduc poker.

Regret-matching + averaged strategy over iterations is the standard
construction proven to converge to a Nash equilibrium in two-player
zero-sum games as the number of iterations grows.
"""

import numpy as np

from poker_solver.games.base import Game


class InfoSetData:
    __slots__ = ("regret_sum", "strategy_sum", "num_actions")

    def __init__(self, num_actions: int):
        self.regret_sum = np.zeros(num_actions)
        self.strategy_sum = np.zeros(num_actions)
        self.num_actions = num_actions

    def get_strategy(self, reach_prob: float) -> np.ndarray:
        pos = np.maximum(self.regret_sum, 0)
        total = pos.sum()
        if total > 0:
            strategy = pos / total
        else:
            strategy = np.full(self.num_actions, 1 / self.num_actions)
        self.strategy_sum += reach_prob * strategy
        return strategy

    def average_strategy(self) -> np.ndarray:
        total = self.strategy_sum.sum()
        if total > 0:
            return self.strategy_sum / total
        return np.full(self.num_actions, 1 / self.num_actions)


class TabularCFR:
    def __init__(self, game: Game):
        self.game = game
        self.infosets: dict[str, InfoSetData] = {}

    def _get_infoset(self, key: str, num_actions: int) -> InfoSetData:
        info = self.infosets.get(key)
        if info is None:
            info = InfoSetData(num_actions)
            self.infosets[key] = info
        return info

    def _cfr(self, h, reach0: float, reach1: float, chance_reach: float) -> np.ndarray:
        game = self.game

        if game.is_terminal(h):
            return np.array(game.returns(h), dtype=float)

        if game.is_chance(h):
            value = np.zeros(game.num_players)
            for action, prob in game.chance_outcomes(h):
                value += prob * self._cfr(
                    game.next_history(h, action), reach0, reach1, chance_reach * prob
                )
            return value

        player = game.current_player(h)
        actions = game.legal_actions(h)
        key = game.infoset_key(h)
        info = self._get_infoset(key, len(actions))

        reach_self = reach0 if player == 0 else reach1
        strategy = info.get_strategy(reach_self)

        action_values = np.zeros((len(actions), game.num_players))
        node_value = np.zeros(game.num_players)
        for i, a in enumerate(actions):
            if player == 0:
                av = self._cfr(
                    game.next_history(h, a), reach0 * strategy[i], reach1, chance_reach
                )
            else:
                av = self._cfr(
                    game.next_history(h, a), reach0, reach1 * strategy[i], chance_reach
                )
            action_values[i] = av
            node_value += strategy[i] * av

        opp_reach = reach1 if player == 0 else reach0
        cf_reach = opp_reach * chance_reach
        for i in range(len(actions)):
            regret = action_values[i][player] - node_value[player]
            info.regret_sum[i] += cf_reach * regret

        return node_value

    def train(self, iterations: int) -> np.ndarray:
        total_util = np.zeros(self.game.num_players)
        for _ in range(iterations):
            total_util += self._cfr(self.game.initial_history(), 1.0, 1.0, 1.0)
        return total_util / iterations

    def average_strategy(self) -> dict[str, np.ndarray]:
        return {key: info.average_strategy() for key, info in self.infosets.items()}
