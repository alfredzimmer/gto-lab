import type { Card, Rank, Suit } from "./types";

export const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
export const RANKS: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];

export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

export function cardToString(card: Card): string {
  const suitSymbols: Record<Suit, string> = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
  };
  return `${card.rank}${suitSymbols[card.suit]}`;
}

export function cardToPokerEvaluatorString(card: Card): string {
  const suitMap: Record<Suit, string> = {
    hearts: "h",
    diamonds: "d",
    clubs: "c",
    spades: "s",
  };
  const rankMap: Record<Rank, string> = {
    "2": "2",
    "3": "3",
    "4": "4",
    "5": "5",
    "6": "6",
    "7": "7",
    "8": "8",
    "9": "9",
    "10": "T",
    J: "J",
    Q: "Q",
    K: "K",
    A: "A",
  };
  return `${rankMap[card.rank]}${suitMap[card.suit]}`;
}

export function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function cardsEqual(card1: Card | null, card2: Card | null): boolean {
  if (!card1 || !card2) return false;
  return card1.rank === card2.rank && card1.suit === card2.suit;
}

export function getAvailableCards(usedCards: (Card | null)[]): Card[] {
  const deck = createDeck();
  return deck.filter(
    (card) =>
      !usedCards.some((usedCard) => usedCard && cardsEqual(card, usedCard)),
  );
}
