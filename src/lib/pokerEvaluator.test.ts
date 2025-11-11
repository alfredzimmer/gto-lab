import { evalHand } from "./pokerEvaluator";

describe("Poker Evaluator", () => {
  describe("Royal Flush", () => {
    it("should identify a royal flush", () => {
      const hand = ["As", "Ks", "Qs", "Js", "Ts", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("Royal Flush");
      expect(result.rank).toBe(9);
      expect(result.value).toBe(1);
    });

    it("should identify royal flush in different suits", () => {
      const hand = ["Ah", "Kh", "Qh", "Jh", "Th", "2s", "3d"];
      const result = evalHand(hand);
      expect(result.name).toBe("Royal Flush");
    });
  });

  describe("Straight Flush", () => {
    it("should identify a king-high straight flush", () => {
      const hand = ["Kd", "Qd", "Jd", "Td", "9d", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight Flush");
      expect(result.rank).toBe(8);
      expect(result.value).toBeGreaterThan(1);
      expect(result.value).toBeLessThanOrEqual(10);
    });

    it("should identify a five-high straight flush (wheel)", () => {
      const hand = ["5c", "4c", "3c", "2c", "Ac", "Kh", "Qs"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight Flush");
    });

    it("should identify a six-high straight flush", () => {
      const hand = ["6h", "5h", "4h", "3h", "2h", "Kd", "Qc"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight Flush");
    });
  });

  describe("Four of a Kind", () => {
    it("should identify four aces", () => {
      const hand = ["As", "Ah", "Ad", "Ac", "Ks", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("Four of a Kind");
      expect(result.rank).toBe(7);
    });

    it("should identify four twos", () => {
      const hand = ["2s", "2h", "2d", "2c", "Ks", "Qh", "Jc"];
      const result = evalHand(hand);
      expect(result.name).toBe("Four of a Kind");
    });

    it("should rank higher four of a kind better", () => {
      const handAces = ["As", "Ah", "Ad", "Ac", "Ks", "2h", "3c"];
      const handKings = ["Ks", "Kh", "Kd", "Kc", "As", "2h", "3c"];
      const resultAces = evalHand(handAces);
      const resultKings = evalHand(handKings);
      expect(resultAces.value).toBeLessThan(resultKings.value);
    });
  });

  describe("Full House", () => {
    it("should identify aces full of kings", () => {
      const hand = ["As", "Ah", "Ad", "Ks", "Kh", "2c", "3d"];
      const result = evalHand(hand);
      expect(result.name).toBe("Full House");
      expect(result.rank).toBe(6);
    });

    it("should identify twos full of threes", () => {
      const hand = ["2s", "2h", "2d", "3s", "3h", "Kc", "Qd"];
      const result = evalHand(hand);
      expect(result.name).toBe("Full House");
    });

    it("should rank higher trips better in full house", () => {
      const handAces = ["As", "Ah", "Ad", "Ks", "Kh", "2c", "3d"];
      const handKings = ["Ks", "Kh", "Kd", "As", "Ah", "2c", "3d"];
      const resultAces = evalHand(handAces);
      const resultKings = evalHand(handKings);
      expect(resultAces.value).toBeLessThan(resultKings.value);
    });
  });

  describe("Flush", () => {
    it("should identify an ace-high flush", () => {
      const hand = ["As", "Ks", "Qs", "9s", "7s", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("Flush");
      expect(result.rank).toBe(5);
    });

    it("should identify a seven-high flush", () => {
      const hand = ["7d", "6d", "5d", "3d", "2d", "Ah", "Kc"];
      const result = evalHand(hand);
      expect(result.name).toBe("Flush");
    });

    it("should not identify a flush when cards are mixed suits", () => {
      const hand = ["As", "Kh", "Qd", "Jc", "9s", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).not.toBe("Flush");
    });
  });

  describe("Straight", () => {
    it("should identify an ace-high straight", () => {
      const hand = ["As", "Kh", "Qd", "Jc", "Ts", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight");
      expect(result.rank).toBe(4);
    });

    it("should identify a five-high straight (wheel)", () => {
      const hand = ["5s", "4h", "3d", "2c", "As", "Kh", "Qd"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight");
    });

    it("should identify a six-high straight", () => {
      const hand = ["6s", "5h", "4d", "3c", "2s", "Kh", "Ad"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight");
    });

    it("should identify a seven-high straight", () => {
      const hand = ["7s", "6h", "5d", "4c", "3s", "Ah", "Kd"];
      const result = evalHand(hand);
      expect(result.name).toBe("Straight");
    });
  });

  describe("Three of a Kind", () => {
    it("should identify three aces", () => {
      const hand = ["As", "Ah", "Ad", "Ks", "Qh", "2c", "3d"];
      const result = evalHand(hand);
      expect(result.name).toBe("Three of a Kind");
      expect(result.rank).toBe(3);
    });

    it("should identify three twos", () => {
      const hand = ["2s", "2h", "2d", "As", "Kh", "Qc", "Jd"];
      const result = evalHand(hand);
      expect(result.name).toBe("Three of a Kind");
    });

    it("should rank higher trips better", () => {
      const handAces = ["As", "Ah", "Ad", "Ks", "Qh", "2c", "3d"];
      const handKings = ["Ks", "Kh", "Kd", "As", "Qh", "2c", "3d"];
      const resultAces = evalHand(handAces);
      const resultKings = evalHand(handKings);
      expect(resultAces.value).toBeLessThan(resultKings.value);
    });
  });

  describe("Two Pair", () => {
    it("should identify aces and kings", () => {
      const hand = ["As", "Ah", "Ks", "Kh", "Qd", "2c", "3s"];
      const result = evalHand(hand);
      expect(result.name).toBe("Two Pair");
      expect(result.rank).toBe(2);
    });

    it("should identify threes and twos", () => {
      const hand = ["3s", "3h", "2d", "2c", "As", "Kh", "Qd"];
      const result = evalHand(hand);
      expect(result.name).toBe("Two Pair");
    });

    it("should rank higher top pair better", () => {
      const handAcesKings = ["As", "Ah", "Ks", "Kh", "Qd", "2c", "3s"];
      const handAcesQueens = ["As", "Ah", "Qs", "Qh", "Kd", "2c", "3s"];
      const resultAcesKings = evalHand(handAcesKings);
      const resultAcesQueens = evalHand(handAcesQueens);
      expect(resultAcesKings.value).toBeLessThan(resultAcesQueens.value);
    });
  });

  describe("One Pair", () => {
    it("should identify a pair of aces", () => {
      const hand = ["As", "Ah", "Kd", "Qc", "Js", "2h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("One Pair");
      expect(result.rank).toBe(1);
    });

    it("should identify a pair of twos", () => {
      const hand = ["2s", "2h", "Ad", "Kc", "Qs", "Jh", "9c"];
      const result = evalHand(hand);
      expect(result.name).toBe("One Pair");
    });

    it("should rank higher pairs better", () => {
      const handAces = ["As", "Ah", "Kd", "Qc", "Js", "2h", "3c"];
      const handKings = ["Ks", "Kh", "Ad", "Qc", "Js", "2h", "3c"];
      const resultAces = evalHand(handAces);
      const resultKings = evalHand(handKings);
      expect(resultAces.value).toBeLessThan(resultKings.value);
    });
  });

  describe("High Card", () => {
    it("should identify ace high", () => {
      const hand = ["As", "Kh", "Qd", "Jc", "9s", "7h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("High Card");
      expect(result.rank).toBe(0);
    });

    it("should identify king high when no better hand", () => {
      const hand = ["Ks", "Qh", "Jd", "9c", "7s", "5h", "3c"];
      const result = evalHand(hand);
      expect(result.name).toBe("High Card");
    });

    it("should rank higher card better", () => {
      const handAce = ["As", "Kh", "Qd", "Jc", "9s", "7h", "3c"];
      const handKing = ["Ks", "Qh", "Jd", "Tc", "8s", "7h", "3c"];
      const resultAce = evalHand(handAce);
      const resultKing = evalHand(handKing);
      expect(resultAce.value).toBeLessThan(resultKing.value);
    });
  });

  describe("Hand Comparisons", () => {
    it("should rank straight flush better than four of a kind", () => {
      const straightFlush = ["9s", "8s", "7s", "6s", "5s", "2h", "3c"];
      const fourOfAKind = ["As", "Ah", "Ad", "Ac", "Ks", "2h", "3c"];
      const resultSF = evalHand(straightFlush);
      const resultQuads = evalHand(fourOfAKind);
      expect(resultSF.value).toBeLessThan(resultQuads.value);
    });

    it("should rank four of a kind better than full house", () => {
      const fourOfAKind = ["2s", "2h", "2d", "2c", "As", "Kh", "Qd"];
      const fullHouse = ["As", "Ah", "Ad", "Ks", "Kh", "2c", "3d"];
      const resultQuads = evalHand(fourOfAKind);
      const resultBoat = evalHand(fullHouse);
      expect(resultQuads.value).toBeLessThan(resultBoat.value);
    });

    it("should rank full house better than flush", () => {
      const fullHouse = ["2s", "2h", "2d", "3s", "3h", "Kc", "Qd"];
      const flush = ["As", "Ks", "Qs", "9s", "7s", "2h", "3c"];
      const resultBoat = evalHand(fullHouse);
      const resultFlush = evalHand(flush);
      expect(resultBoat.value).toBeLessThan(resultFlush.value);
    });

    it("should rank flush better than straight", () => {
      const flush = ["7d", "6d", "5d", "3d", "2d", "Ah", "Kc"];
      const straight = ["9s", "8h", "7d", "6c", "5s", "Ah", "Kd"];
      const resultFlush = evalHand(flush);
      const resultStraight = evalHand(straight);
      expect(resultFlush.value).toBeLessThan(resultStraight.value);
    });

    it("should rank straight better than three of a kind", () => {
      const straight = ["6s", "5h", "4d", "3c", "2s", "Ah", "Kd"];
      const trips = ["As", "Ah", "Ad", "Ks", "Qh", "2c", "3d"];
      const resultStraight = evalHand(straight);
      const resultTrips = evalHand(trips);
      expect(resultStraight.value).toBeLessThan(resultTrips.value);
    });

    it("should rank three of a kind better than two pair", () => {
      const trips = ["2s", "2h", "2d", "As", "Kh", "Qc", "Jd"];
      const twoPair = ["As", "Ah", "Ks", "Kh", "Qd", "2c", "3s"];
      const resultTrips = evalHand(trips);
      const resultTwoPair = evalHand(twoPair);
      expect(resultTrips.value).toBeLessThan(resultTwoPair.value);
    });

    it("should rank two pair better than one pair", () => {
      const twoPair = ["3s", "3h", "2d", "2c", "As", "Kh", "Qd"];
      const onePair = ["As", "Ah", "Kd", "Qc", "Js", "2h", "3c"];
      const resultTwoPair = evalHand(twoPair);
      const resultOnePair = evalHand(onePair);
      expect(resultTwoPair.value).toBeLessThan(resultOnePair.value);
    });

    it("should rank one pair better than high card", () => {
      const onePair = ["2s", "2h", "Ad", "Kc", "Qs", "Jh", "9c"];
      const highCard = ["As", "Kh", "Qd", "Jc", "9s", "7h", "3c"];
      const resultOnePair = evalHand(onePair);
      const resultHighCard = evalHand(highCard);
      expect(resultOnePair.value).toBeLessThan(resultHighCard.value);
    });
  });

  describe("Edge Cases", () => {
    it("should handle 7 cards with multiple possible hands", () => {
      const hand = ["As", "Ad", "Kh", "Kd", "Ks", "Qc", "Qs"];
      const result = evalHand(hand);
      expect(result.name).toBe("Full House");
    });

    it("should throw error for incorrect number of cards", () => {
      expect(() => {
        evalHand(["As", "Kh", "Qd", "Jc", "Ts"]);
      }).toThrow("Must provide exactly 7 cards");
    });

    it("should handle cards in any order", () => {
      const hand1 = ["As", "Ks", "Qs", "Js", "Ts", "2h", "3c"];
      const hand2 = ["3c", "2h", "Ts", "Js", "Qs", "Ks", "As"];
      const result1 = evalHand(hand1);
      const result2 = evalHand(hand2);
      expect(result1.value).toBe(result2.value);
      expect(result1.name).toBe(result2.name);
    });
  });

  describe("Return Value Structure", () => {
    it("should return correct structure with all properties", () => {
      const hand = ["As", "Ah", "Kd", "Qc", "Js", "2h", "3c"];
      const result = evalHand(hand);
      expect(result).toHaveProperty("rank");
      expect(result).toHaveProperty("value");
      expect(result).toHaveProperty("name");
      expect(result).toHaveProperty("cards");
      expect(typeof result.rank).toBe("number");
      expect(typeof result.value).toBe("number");
      expect(typeof result.name).toBe("string");
      expect(Array.isArray(result.cards)).toBe(true);
      expect(result.cards.length).toBe(5);
    });

    it("should return the 5 best cards used", () => {
      const hand = ["As", "Ah", "Ad", "Ks", "Kh", "2c", "3d"];
      const result = evalHand(hand);
      expect(result.cards.length).toBe(5);
      expect(result.cards.every((card) => hand.includes(card))).toBe(true);
    });
  });
});
