import {
  cardsEqual,
  cardToPokerEvaluatorString,
  createDeck,
  shuffleArray,
} from "./deck";
import { evalHand } from "./pokerEvaluator";
import type { Card, OddsResult, Player } from "./types";

interface SimulationResult {
  wins: number[];
  ties: number[];
}

export function calculateOdds(
  players: Player[],
  communityCards: (Card | null)[],
  simulations = 70000,
): OddsResult[] {
  const validPlayers = players.filter((p) => p.cards[0] && p.cards[1]);

  if (validPlayers.length < 2) {
    return players.map((p) => ({
      playerId: p.id,
      playerName: p.name,
      winPercentage: 0,
      tiePercentage: 0,
    }));
  }

  const usedCards: Card[] = [];
  for (const player of validPlayers) {
    if (player.cards[0]) usedCards.push(player.cards[0]);
    if (player.cards[1]) usedCards.push(player.cards[1]);
  }
  for (const card of communityCards) {
    if (card) usedCards.push(card);
  }

  const result = runSimulation(
    validPlayers,
    communityCards,
    usedCards,
    simulations,
  );

  return validPlayers.map((player, index) => ({
    playerId: player.id,
    playerName: player.name,
    winPercentage: (result.wins[index] / simulations) * 100,
    tiePercentage: (result.ties[index] / simulations) * 100,
  }));
}

export function calculateHandStrength(
  playerCards: [Card, Card],
  communityCards: (Card | null)[],
  numOpponents: number = 1,
  simulations: number = 70000,
): { winPercentage: number; tiePercentage: number } {
  const usedCards: Card[] = [playerCards[0], playerCards[1]];
  for (const card of communityCards) {
    if (card) usedCards.push(card);
  }

  let wins = 0;
  let ties = 0;

  const fullDeck = createDeck();
  const availableDeck = fullDeck.filter(
    (card) => !usedCards.some((used) => cardsEqual(card, used)),
  );

  for (let sim = 0; sim < simulations; sim++) {
    const shuffled = shuffleArray(availableDeck);
    let deckIndex = 0;

    const finalCommunity: Card[] = [];
    for (let i = 0; i < 5; i++) {
      if (communityCards[i]) {
        finalCommunity.push(communityCards[i]!);
      } else {
        finalCommunity.push(shuffled[deckIndex++]);
      }
    }

    const opponents: [Card, Card][] = [];
    for (let i = 0; i < numOpponents; i++) {
      opponents.push([shuffled[deckIndex++], shuffled[deckIndex++]]);
    }

    const playerHand = evalHand([
      cardToPokerEvaluatorString(playerCards[0]),
      cardToPokerEvaluatorString(playerCards[1]),
      ...finalCommunity.map(cardToPokerEvaluatorString),
    ]);

    const opponentHands = opponents.map((oppCards) => {
      try {
        return evalHand([
          cardToPokerEvaluatorString(oppCards[0]),
          cardToPokerEvaluatorString(oppCards[1]),
          ...finalCommunity.map(cardToPokerEvaluatorString),
        ]);
      } catch (_e) {
        return {
          value: 10000,
          rank: -1,
          name: "High Card" as const,
          cards: [],
        };
      }
    });

    const bestOpponentValue = Math.min(...opponentHands.map((h) => h.value));

    if (playerHand.value < bestOpponentValue) {
      wins++;
    } else if (playerHand.value === bestOpponentValue) {
      ties++;
    }
  }

  return {
    winPercentage: (wins / simulations) * 100,
    tiePercentage: (ties / simulations) * 100,
  };
}

function runSimulation(
  players: Player[],
  communityCards: (Card | null)[],
  usedCards: Card[],
  simulations: number,
): SimulationResult {
  const wins = new Array(players.length).fill(0);
  const ties = new Array(players.length).fill(0);

  const fullDeck = createDeck();
  const availableDeck = fullDeck.filter(
    (card) => !usedCards.some((used) => cardsEqual(card, used)),
  );

  for (let sim = 0; sim < simulations; sim++) {
    const shuffled = shuffleArray(availableDeck);

    const finalCommunity: Card[] = [];
    let deckIndex = 0;

    for (let i = 0; i < 5; i++) {
      if (communityCards[i]) {
        finalCommunity.push(communityCards[i]!);
      } else {
        finalCommunity.push(shuffled[deckIndex++]);
      }
    }

    const handStrengths = players.map((player) => {
      try {
        const playerCards = [
          cardToPokerEvaluatorString(player.cards[0]!),
          cardToPokerEvaluatorString(player.cards[1]!),
        ];
        const communityCardsStr = finalCommunity.map(
          cardToPokerEvaluatorString,
        );
        const allCards = [...playerCards, ...communityCardsStr];

        return evalHand(allCards);
      } catch (_e) {
        return {
          value: 10000,
          rank: -1,
          name: "High Card" as const,
          cards: [],
        };
      }
    });

    const bestValue = Math.min(...handStrengths.map((h) => h.value));
    const winners = handStrengths
      .map((h, i) => ({ strength: h.value, index: i }))
      .filter((h) => h.strength === bestValue);

    if (winners.length === 1) {
      wins[winners[0].index]++;
    } else {
      for (const winner of winners) {
        ties[winner.index]++;
      }
    }
  }

  return { wins, ties };
}
