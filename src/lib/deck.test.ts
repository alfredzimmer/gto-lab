import {
  createDeck,
  shuffleArray,
  cardsEqual,
  cardToString,
  cardToPokerEvaluatorString,
} from "./deck";
import type { Card } from "./types";

describe("Deck Utilities", () => {
  describe("createDeck", () => {
    it("should create a deck with 52 cards", () => {
      const deck = createDeck();
      expect(deck).toHaveLength(52);
    });

    it("should have unique cards", () => {
      const deck = createDeck();
      const uniqueCards = new Set(
        deck.map((card) => `${card.rank}-${card.suit}`),
      );
      expect(uniqueCards.size).toBe(52);
    });

    it("should have 13 cards of each suit", () => {
      const deck = createDeck();
      const suits = { hearts: 0, diamonds: 0, clubs: 0, spades: 0 };
      deck.forEach((card) => {
        suits[card.suit]++;
      });
      expect(suits.hearts).toBe(13);
      expect(suits.diamonds).toBe(13);
      expect(suits.clubs).toBe(13);
      expect(suits.spades).toBe(13);
    });
  });

  describe("shuffleArray", () => {
    it("should shuffle the deck", () => {
      const deck = createDeck();
      const shuffled = shuffleArray([...deck]);
      expect(shuffled).toHaveLength(52);
      // It's statistically possible but highly unlikely that a shuffled deck is exactly the same
      expect(shuffled).not.toEqual(deck);
    });

    it("should contain the same cards after shuffle", () => {
      const deck = createDeck();
      const shuffled = shuffleArray([...deck]);

      const deckStrings = deck.map((c) => `${c.rank}-${c.suit}`).sort();
      const shuffledStrings = shuffled.map((c) => `${c.rank}-${c.suit}`).sort();

      expect(shuffledStrings).toEqual(deckStrings);
    });
  });

  describe("cardsEqual", () => {
    it("should return true for identical cards", () => {
      const card1: Card = { rank: "A", suit: "spades" };
      const card2: Card = { rank: "A", suit: "spades" };
      expect(cardsEqual(card1, card2)).toBe(true);
    });

    it("should return false for different cards", () => {
      const card1: Card = { rank: "A", suit: "spades" };
      const card2: Card = { rank: "K", suit: "spades" };
      const card3: Card = { rank: "A", suit: "hearts" };
      expect(cardsEqual(card1, card2)).toBe(false);
      expect(cardsEqual(card1, card3)).toBe(false);
    });
  });

  describe("cardToString", () => {
    it("should format card correctly", () => {
      expect(cardToString({ rank: "A", suit: "spades" })).toBe("A♠");
      expect(cardToString({ rank: "10", suit: "hearts" })).toBe("10♥");
    });
  });

  describe("cardToPokerEvaluatorString", () => {
    it("should format card for evaluator", () => {
      expect(cardToPokerEvaluatorString({ rank: "A", suit: "spades" })).toBe(
        "As",
      );
      expect(cardToPokerEvaluatorString({ rank: "10", suit: "hearts" })).toBe(
        "Th",
      );
      expect(cardToPokerEvaluatorString({ rank: "2", suit: "clubs" })).toBe(
        "2c",
      );
    });
  });
});
