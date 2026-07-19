"""Generic extensive-form game interface shared by tabular CFR, Deep CFR, and
best-response/exploitability code.

A `History` is just a tuple of actions (including chance draws) from the root.
Each game interprets its own tuple however it likes -- the algorithms in
`poker_solver.cfr` only ever call the methods below, so any two-player
zero-sum extensive-form game with perfect recall can plug in here.
"""

from abc import ABC, abstractmethod
from typing import Sequence


History = tuple


class Game(ABC):
    num_players = 2

    @abstractmethod
    def initial_history(self) -> History:
        ...

    @abstractmethod
    def is_chance(self, h: History) -> bool:
        ...

    @abstractmethod
    def chance_outcomes(self, h: History) -> list[tuple[object, float]]:
        """List of (action, probability) pairs. Probabilities must sum to 1."""

    @abstractmethod
    def is_terminal(self, h: History) -> bool:
        ...

    @abstractmethod
    def returns(self, h: History) -> Sequence[float]:
        """Utility to each player at a terminal history. Must sum to 0."""

    @abstractmethod
    def current_player(self, h: History) -> int:
        ...

    @abstractmethod
    def legal_actions(self, h: History) -> list:
        ...

    @abstractmethod
    def infoset_key(self, h: History) -> str:
        """Key identifying the current player's information set at h.

        Two histories must map to the same key iff the acting player cannot
        distinguish between them given their private information and the
        public action history.
        """

    def next_history(self, h: History, action) -> History:
        return h + (action,)

    # ---- Optional neural-net interface (required only by Deep CFR) ----
    #
    # A game that wants to be solvable by Deep CFR additionally exposes a
    # fixed-size feature encoding of the acting player's information set and
    # a canonical, game-wide action indexing so one network head can cover
    # every infoset (illegal actions are masked out by the caller).

    feature_dim: int | None = None
    max_actions: int | None = None

    def infoset_features(self, h: History):
        """np.ndarray of shape (feature_dim,) encoding the acting player's
        infoset at h. Must be a function of infoset_key(h) only -- two
        histories in the same infoset must encode identically."""
        raise NotImplementedError

    def legal_action_indices(self, h: History) -> list[int]:
        """Canonical indices (into the network's max_actions-wide output)
        aligned 1:1 with legal_actions(h)."""
        raise NotImplementedError
