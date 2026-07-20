import { breakEvenEquity } from "./strategy";

describe("breakEvenEquity", () => {
  // potBB always includes the outstanding bet (sum of both contributions).

  it("pot-size bet needs 1/3 equity", () => {
    // villain bets 6 into 6 -> pot shows 12, 6 to call, final pot 18
    expect(breakEvenEquity(12, 6)).toBeCloseTo(1 / 3, 9);
    // villain bets 36 into 36 -> pot shows 72, 36 to call
    expect(breakEvenEquity(72, 36)).toBeCloseTo(1 / 3, 9);
  });

  it("half-pot bet needs 1/4 equity", () => {
    // villain bets 6 into 12 -> pot shows 18, 6 to call, final pot 24
    expect(breakEvenEquity(18, 6)).toBeCloseTo(0.25, 9);
  });

  it("2x-pot overbet needs 2/5 equity", () => {
    // villain bets 20 into 10 -> pot shows 30, 20 to call, final pot 50
    expect(breakEvenEquity(30, 20)).toBeCloseTo(0.4, 9);
  });
});
