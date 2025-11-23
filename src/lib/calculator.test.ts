import { calculateOdds, calculateHandStrength } from "./calculator";
import type { Card, Player } from "./types";

describe("Calculator", () => {
  describe("calculateOdds", () => {
    it("should return 0% win/tie for invalid players", () => {
      const players: Player[] = [
        { id: "1", name: "P1", cards: [null, null] },
        { id: "2", name: "P2", cards: [null, null] },
      ];
      const communityCards = [null, null, null, null, null];
      const result = calculateOdds(players, communityCards, 100);

      expect(result[0].winPercentage).toBe(0);
      expect(result[1].winPercentage).toBe(0);
    });

    it("should calculate odds for a simple heads-up scenario", () => {
      // AA vs KK pre-flop
      const players: Player[] = [
        {
          id: "1",
          name: "P1",
          cards: [
            { rank: "A", suit: "spades" },
            { rank: "A", suit: "hearts" },
          ],
        },
        {
          id: "2",
          name: "P2",
          cards: [
            { rank: "K", suit: "spades" },
            { rank: "K", suit: "hearts" },
          ],
        },
      ];
      const communityCards = [null, null, null, null, null];

      // Run a small number of simulations for speed, but enough to be roughly correct
      // AA is ~82% favorite over KK
      const result = calculateOdds(players, communityCards, 1000);

      expect(result[0].winPercentage).toBeGreaterThan(70);
      expect(result[1].winPercentage).toBeLessThan(30);
    });
  });

  describe("calculateHandStrength", () => {
    it("should calculate strength for a strong hand", () => {
      const heroHand: [Card, Card] = [
        { rank: "A", suit: "spades" },
        { rank: "A", suit: "hearts" },
      ];
      const communityCards = [null, null, null, null, null];

      // AA vs 1 random opponent
      const { winPercentage } = calculateHandStrength(
        heroHand,
        communityCards,
        1,
        1000,
      );

      // AA is roughly 85% vs random hand
      expect(winPercentage).toBeGreaterThan(75);
    });

    it("should calculate strength on the river", () => {
      const heroHand: [Card, Card] = [
        { rank: "A", suit: "spades" },
        { rank: "K", suit: "spades" },
      ];
      // Royal Flush board
      const communityCards: (Card | null)[] = [
        { rank: "Q", suit: "spades" },
        { rank: "J", suit: "spades" },
        { rank: "10", suit: "spades" },
        { rank: "2", suit: "hearts" }, // Irrelevant
        { rank: "3", suit: "diamonds" }, // Irrelevant
      ];

      const { winPercentage } = calculateHandStrength(
        heroHand,
        communityCards,
        1,
        100,
      );

      // Should be 100% win (unless opponent has same royal flush, which is impossible with 1 deck)
      expect(winPercentage).toBe(100);
    });
  });
});
