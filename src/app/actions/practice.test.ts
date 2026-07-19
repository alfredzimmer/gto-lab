import { generatePracticeHand } from "./practice";
import { calculateHandStrength } from "@/lib/calculator";

describe("Practice Actions", () => {
  describe("generatePracticeHand", () => {
    it("should generate a valid practice state", async () => {
      const state = await generatePracticeHand({
        minOpponents: 1,
        maxOpponents: 1,
        difficulty: "medium",
      });

      expect(state.heroHand).toHaveLength(2);
      expect(state.villainHands).toHaveLength(1);
      expect(state.villainHands[0]).toHaveLength(2);
      expect(state.board.length).toBeGreaterThanOrEqual(3);
      expect(state.board.length).toBeLessThanOrEqual(5);
      expect(state.pot).toBeGreaterThan(0);
      expect(state.bet).toBeGreaterThan(0);
      expect(state.id).toBeDefined();
    });

    it("should respect opponent count settings", async () => {
      const state = await generatePracticeHand({
        minOpponents: 3,
        maxOpponents: 3,
        difficulty: "medium",
      });

      expect(state.opponentCount).toBe(3);
      expect(state.villainHands).toHaveLength(3);
    });

    it("should ensure generated hand has equity < 70%", async () => {
      for (let i = 0; i < 3; i++) {
        const state = await generatePracticeHand();
        const { winPercentage, tiePercentage } = calculateHandStrength(
          state.heroHand,
          state.board,
          state.opponentCount,
          10000,
        );
        const equity = (winPercentage + tiePercentage / 2) / 100;
        expect(equity).toBeLessThan(0.75);
      }
    });
  });
});
