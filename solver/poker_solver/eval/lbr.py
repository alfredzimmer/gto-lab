"""Local Best Response (Lisý & Bowling 2017) against a Deep CFR strategy
in the abstracted heads-up NLHE game.

LBR is a greedy exploiting agent: it knows the opponent's full strategy
(the trained strategy network), maintains the exact Bayesian posterior
over the opponent's hole cards given every action the opponent has taken,
and at each decision picks the action maximizing a myopic EV estimate
(assuming it check/calls from then on -- the standard "check-down" LBR).

Because LBR is just one particular exploiting policy, its measured
winnings (in bb/hand over many duplicate-dealt hands) are a Monte Carlo
LOWER BOUND on the strategy's true exploitability. That's the honest
direction for a claim of strength: "this specific well-informed exploiter
could only win X bb/hand" -- with the *upper*-bound-style certainty
coming from the exact exploitability results on Kuhn/Leduc where the same
Deep CFR machinery is provably near equilibrium (see tests/).

EV model at an LBR decision (pot P, to call C, LBR win prob vs range W):
  fold:            0            (sunk chips are sunk)
  check/call:      W * (P + C) - C
  bet/raise to b:  F * P + (1 - F) * (W_call * (P + C + 2*b') - C - b')
      where F is the range's fold probability against the bet (queried
      from the strategy net hand-by-hand), W_call the win prob against
      the part of the range that continues, and b' the chips LBR adds
      beyond the call. Opponent raises are treated as calls (this only
      *under*-estimates LBR's options, keeping the bound conservative).

Win probabilities are estimated by sampling board runouts and averaging
showdown results against the current (weighted) range.
"""

import random

import numpy as np
import torch

from poker_solver.games.hand_eval import evaluate7
from poker_solver.games.holdem import (
    ALL_IN,
    CHECK_CALL,
    FOLD,
    STACK,
    HoldemGame,
    _aggressive_amounts,
    _parse,
)


class RangeTracker:
    """Exact posterior over the opponent's hole pair, updated with the
    strategy network's own action probabilities."""

    def __init__(self, game: HoldemGame, strategy_net, my_cards: tuple[int, int], opp_seat: int):
        self.game = game
        self.net = strategy_net
        self.opp_seat = opp_seat
        blocked = set(my_cards)
        self.pairs = [
            (a, b)
            for a in range(52)
            for b in range(a + 1, 52)
            if a not in blocked and b not in blocked
        ]
        self.weights = np.ones(len(self.pairs))

    def remove_board_cards(self, board: set[int]):
        for i, (a, b) in enumerate(self.pairs):
            if a in board or b in board:
                self.weights[i] = 0.0

    def _hypothetical_history(self, h, pair):
        """h with the opponent's hole slots replaced by `pair`."""
        lst = list(h)
        base = 2 * self.opp_seat
        lst[base], lst[base + 1] = pair
        return tuple(lst)

    def action_probs_batch(self, h) -> np.ndarray:
        """For each candidate pair: the strategy's action distribution at
        the opponent's current decision node h (opponent to act).
        Returns (num_pairs, max_actions) over canonical action indices."""
        game = self.game
        feats = np.stack(
            [
                game.infoset_features(self._hypothetical_history(h, pair))
                for pair in self.pairs
            ]
        )
        with torch.no_grad():
            logits = self.net(torch.from_numpy(feats))
        indices = game.legal_action_indices(h)
        mask = torch.zeros(logits.shape[1])
        mask[indices] = 1.0
        clipped = torch.clamp(logits, min=0.0) * mask
        totals = clipped.sum(dim=1, keepdim=True)
        n_legal = len(indices)
        uniform = mask / n_legal
        probs = torch.where(totals > 0, clipped / totals.clamp(min=1e-9), uniform)
        return probs.numpy()

    def observe_action(self, h, action):
        """Bayes update after the opponent takes `action` at history h."""
        probs = self.action_probs_batch(h)
        idx = self.game._ACTION_INDEX[action]
        self.weights *= probs[:, idx]
        total = self.weights.sum()
        if total > 0:
            self.weights /= total

    def sample_pairs(self, rng, k: int) -> list[tuple[int, int]]:
        total = self.weights.sum()
        if total <= 0:
            live = [p for p in self.pairs]
            return rng.choices(live, k=k)
        return rng.choices(self.pairs, weights=self.weights, k=k)


class LBRPolicy:
    """Callable policy for one hand: history -> action for the LBR seat."""

    def __init__(self, game, strategy_net, seat: int, rng, runouts: int = 200):
        self.game = game
        self.net = strategy_net
        self.seat = seat
        self.rng = rng
        self.runouts = runouts
        self.tracker: RangeTracker | None = None
        self._processed_len = 0

    def _my_cards(self, h):
        return (h[2 * self.seat], h[2 * self.seat + 1])

    def _catch_up(self, h):
        """Process everything that happened since our last decision:
        opponent actions -> Bayes updates; board cards -> range pruning."""
        if self.tracker is None:
            self.tracker = RangeTracker(self.game, self.net, self._my_cards(h), 1 - self.seat)
            self._processed_len = 4

        prefix = h[: self._processed_len]
        for i in range(self._processed_len, len(h)):
            tok = h[i]
            if isinstance(tok, int):
                self.tracker.remove_board_cards({tok})
            else:
                actor = self.game.current_player(prefix)
                if actor != self.seat:
                    self.tracker.observe_action(prefix, tok)
            prefix = prefix + (tok,)
        self._processed_len = len(h)

    def _win_prob(self, h, pairs) -> float:
        """Showdown equity of our hand vs the given opponent pairs, board
        run out uniformly at random."""
        s = _parse(h)
        board = list(s.board)
        my = list(self._my_cards(h))
        wins = 0.0
        n = 0
        for pair in pairs:
            dead = set(my) | set(board) | set(pair)
            deck = [c for c in range(52) if c not in dead]
            runout = self.rng.sample(deck, 5 - len(board))
            full_board = board + runout
            mine = evaluate7(my + full_board)
            theirs = evaluate7(list(pair) + full_board)
            if mine > theirs:
                wins += 1
            elif mine == theirs:
                wins += 0.5
            n += 1
        return wins / max(n, 1)

    def __call__(self, h):
        self._catch_up(h)
        game = self.game
        s = _parse(h)
        p = self.seat
        opp = 1 - p

        pot = s.contrib[0] + s.contrib[1]
        to_call = s.street_contrib[opp] - s.street_contrib[p]
        sample = self.tracker.sample_pairs(self.rng, self.runouts)
        w = self._win_prob(h, sample)

        evs: dict[str, float] = {}
        legal = game.legal_actions(h)
        if FOLD in legal:
            evs[FOLD] = 0.0
        evs[CHECK_CALL] = w * (pot + to_call) - to_call

        aggressive = _aggressive_amounts(s, p)
        if aggressive:
            # Response probabilities of each range hand to our bet: build the
            # hypothetical history where we take the action, opponent to act.
            for token, amount in aggressive.items():
                if token not in legal:
                    continue
                h_bet = game.next_history(h, token)
                if game.is_terminal(h_bet) or game.is_chance(h_bet):
                    continue
                probs = self.tracker.action_probs_batch(h_bet)
                fold_p = probs[:, game._ACTION_INDEX[FOLD]]
                weights = self.tracker.weights
                total_w = weights.sum()
                if total_w <= 0:
                    continue
                F = float((weights * fold_p).sum() / total_w)
                cont_weights = weights * (1.0 - fold_p)
                added = amount - s.street_contrib[p]  # chips we add beyond current
                extra = added - to_call  # beyond the call
                if cont_weights.sum() > 0:
                    # Win prob vs the continuing part of the range.
                    cont_pairs = self.rng.choices(
                        self.tracker.pairs, weights=cont_weights, k=self.runouts
                    )
                    w_call = self._win_prob(h, cont_pairs)
                else:
                    w_call = 1.0
                evs[token] = F * pot + (1 - F) * (
                    w_call * (pot + to_call + 2 * extra) - to_call - extra
                )
        # EVs are in chip units; scale is irrelevant for the argmax.
        return max(evs, key=evs.get)
