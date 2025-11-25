import { generatePracticeHand, savePracticeResult } from "./practice";
import { createClient } from "@/lib/supabase/server";
import { calculateHandStrength } from "@/lib/calculator";

// Mock Supabase
jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

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

  describe("savePracticeResult", () => {
    let mockSupabase: {
      auth: { getUser: jest.Mock };
      from: jest.Mock;
    };

    beforeEach(() => {
      mockSupabase = {
        auth: {
          getUser: jest.fn(),
        },
        from: jest.fn(() => ({
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              single: jest.fn(),
            })),
          })),
          insert: jest.fn(),
        })),
      };
      (createClient as jest.Mock).mockResolvedValue(mockSupabase);
    });

    it("should return success with message if user is not logged in", async () => {
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user: null } });

      const result = await savePracticeResult(
        {
          heroHand: [
            { rank: "A", suit: "spades" },
            { rank: "K", suit: "spades" },
          ],
          villainHands: [],
          opponentCount: 1,
          board: [],
          pot: 100,
          bet: 50,
          id: "test-id",
        },
        "call",
        { equity: 0.5, ev: 10, correct: true },
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe("User not logged in");
    });

    it("should save result if user is logged in", async () => {
      const user = { id: "user-123", email: "test@example.com" };
      mockSupabase.auth.getUser.mockResolvedValue({ data: { user } });

      // Mock profile check
      const mockSelect = jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          single: jest
            .fn()
            .mockResolvedValue({ data: { id: user.id }, error: null }),
        }),
      });

      // Mock insert
      const mockInsert = jest.fn().mockResolvedValue({ error: null });

      mockSupabase.from.mockImplementation((table: string) => {
        if (table === "profiles")
          return { select: mockSelect, insert: jest.fn() };
        if (table === "practice_logs") return { insert: mockInsert };
        return {};
      });

      const result = await savePracticeResult(
        {
          heroHand: [
            { rank: "A", suit: "spades" },
            { rank: "K", suit: "spades" },
          ],
          villainHands: [],
          opponentCount: 1,
          board: [],
          pot: 100,
          bet: 50,
          id: "test-id",
        },
        "call",
        { equity: 0.5, ev: 10, correct: true },
      );

      expect(result.success).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: user.id,
          user_decision: "call",
          is_correct: true,
          ev: 10,
        }),
      );
    });
  });
});
