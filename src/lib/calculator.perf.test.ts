import { calculateHandStrength, calculateOdds } from "./calculator";
import type { Card, Player } from "./types";

describe("Calculator Performance Tests", () => {
  const player1Cards: [Card, Card] = [
    { rank: "A", suit: "spades" },
    { rank: "K", suit: "spades" },
  ];

  const player2Cards: [Card, Card] = [
    { rank: "Q", suit: "hearts" },
    { rank: "Q", suit: "diamonds" },
  ];

  const communityCards: (Card | null)[] = [
    { rank: "J", suit: "spades" },
    { rank: "10", suit: "spades" },
    { rank: "9", suit: "clubs" },
    null,
    null,
  ];

  const players: Player[] = [
    {
      id: "1",
      name: "Player 1",
      cards: [player1Cards[0], player1Cards[1]],
    },
    {
      id: "2",
      name: "Player 2",
      cards: [player2Cards[0], player2Cards[1]],
    },
  ];

  describe("calculateOdds Performance", () => {
    it("should run 2000 simulations (baseline)", () => {
      const startTime = performance.now();
      const result = calculateOdds(players, communityCards, 2000);
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`\n2000 simulations took: ${duration.toFixed(2)}ms`);
      expect(result).toHaveLength(2);
      expect(duration).toBeLessThan(5000);
    });

    it("should run 10000 simulations", () => {
      const startTime = performance.now();
      const result = calculateOdds(players, communityCards, 10000);
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`10000 simulations took: ${duration.toFixed(2)}ms`);
      expect(result).toHaveLength(2);
      expect(duration).toBeLessThan(20000);
    });

    it("should run 50000 simulations", () => {
      const startTime = performance.now();
      const result = calculateOdds(players, communityCards, 50000);
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`50000 simulations took: ${duration.toFixed(2)}ms`);
      expect(result).toHaveLength(2);
      expect(duration).toBeLessThan(100000);
    });

    it("should run 100000 simulations", () => {
      const startTime = performance.now();
      const result = calculateOdds(players, communityCards, 100000);
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(`100000 simulations took: ${duration.toFixed(2)}ms`);
      expect(result).toHaveLength(2);
      expect(duration).toBeLessThan(200000);
    });
  });

  describe("calculateHandStrength Performance", () => {
    it("should run 2000 simulations (baseline)", () => {
      const startTime = performance.now();
      const result = calculateHandStrength(
        player1Cards,
        communityCards,
        1,
        2000,
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `\nHand strength 2000 simulations took: ${duration.toFixed(2)}ms`,
      );
      expect(result).toHaveProperty("winPercentage");
      expect(result).toHaveProperty("tiePercentage");
      expect(duration).toBeLessThan(5000);
    });

    it("should run 10000 simulations", () => {
      const startTime = performance.now();
      const result = calculateHandStrength(
        player1Cards,
        communityCards,
        1,
        10000,
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Hand strength 10000 simulations took: ${duration.toFixed(2)}ms`,
      );
      expect(result).toHaveProperty("winPercentage");
      expect(result).toHaveProperty("tiePercentage");
      expect(duration).toBeLessThan(20000);
    });

    it("should run 50000 simulations", () => {
      const startTime = performance.now();
      const result = calculateHandStrength(
        player1Cards,
        communityCards,
        1,
        50000,
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Hand strength 50000 simulations took: ${duration.toFixed(2)}ms`,
      );
      expect(result).toHaveProperty("winPercentage");
      expect(result).toHaveProperty("tiePercentage");
      expect(duration).toBeLessThan(100000);
    });

    it("should run 100000 simulations", () => {
      const startTime = performance.now();
      const result = calculateHandStrength(
        player1Cards,
        communityCards,
        1,
        100000,
      );
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `Hand strength 100000 simulations took: ${duration.toFixed(2)}ms`,
      );
      expect(result).toHaveProperty("winPercentage");
      expect(result).toHaveProperty("tiePercentage");
      expect(duration).toBeLessThan(200000);
    });
  });

  describe("Multi-player Performance", () => {
    const threePlayers: Player[] = [
      {
        id: "1",
        name: "Player 1",
        cards: [
          { rank: "A", suit: "spades" },
          { rank: "K", suit: "spades" },
        ],
      },
      {
        id: "2",
        name: "Player 2",
        cards: [
          { rank: "Q", suit: "hearts" },
          { rank: "Q", suit: "diamonds" },
        ],
      },
      {
        id: "3",
        name: "Player 3",
        cards: [
          { rank: "J", suit: "clubs" },
          { rank: "J", suit: "hearts" },
        ],
      },
    ];

    const emptyBoard: (Card | null)[] = [null, null, null, null, null];

    it("should run 50000 simulations with 3 players", () => {
      const startTime = performance.now();
      const result = calculateOdds(threePlayers, emptyBoard, 50000);
      const endTime = performance.now();
      const duration = endTime - startTime;

      console.log(
        `\n3 players, 50000 simulations took: ${duration.toFixed(2)}ms`,
      );
      expect(result).toHaveLength(3);
      expect(duration).toBeLessThan(150000);
    });
  });

  describe("Performance Summary", () => {
    it("should benchmark different simulation counts", () => {
      const simCounts = [1000, 5000, 10000, 25000, 50000];
      const results: {
        simulations: number;
        duration: number;
        perSim: number;
      }[] = [];

      console.log("\n=== Performance Benchmark Summary ===");

      for (const count of simCounts) {
        const startTime = performance.now();
        calculateOdds(players, communityCards, count);
        const endTime = performance.now();
        const duration = endTime - startTime;
        const perSim = duration / count;

        results.push({
          simulations: count,
          duration,
          perSim,
        });

        console.log(
          `${count.toLocaleString().padStart(7)} sims: ${duration.toFixed(2).padStart(8)}ms (${perSim.toFixed(4)}ms per sim)`,
        );
      }

      expect(results.length).toBe(simCounts.length);
      expect(results.every((r) => r.duration > 0)).toBe(true);
    });
  });
});
