import parity from "./parity-vectors.json";
import { type History, parseHistory } from "./holdem";
import { describeSpot } from "./strategy";

type DecisionVector = {
  history: (number | string)[];
  player: number;
  street: number;
  pot: number;
  toCall: number;
};

const decisionVectors = (
  parity.vectors as (DecisionVector | { terminalReturns: unknown })[]
).filter((v): v is DecisionVector => "player" in v);

function pick(street: number, toCallPositive: boolean): DecisionVector {
  const v = decisionVectors.find(
    (v) => v.street === street && v.toCall > 0 === toCallPositive,
  );
  if (!v) throw new Error(`no fixture for street=${street} toCall>0=${toCallPositive}`);
  return v;
}

describe("describeSpot", () => {
  it("converts preflop blinds-only chip units to BB with no action taken", () => {
    // No action tokens yet: contrib is exactly the two blinds by definition,
    // independent of parseHistory -- SB=1, BB=2 chip units (0.5bb each).
    const v = pick(0, true);
    const spot = describeSpot(v.history as History, v.player);
    expect(spot.street).toBe(0);
    expect(spot.streetName).toBe("Preflop");
    expect(spot.potBB).toBeCloseTo(1.5, 9); // (1 + 2) / 2
    expect(spot.toCallBB).toBeCloseTo(0.5, 9); // (2 - 1) / 2
    expect(spot.heroStackBB).toBeCloseTo(99.5, 9); // (200 - 1) / 2
    expect(spot.villainStackBB).toBeCloseTo(99, 9); // (200 - 2) / 2
    expect(spot.actionLabels.c).toBe("Call 0.5 BB");
    expect(spot.actionLabels.f).toBe("Fold");
  });

  it("labels a check when nothing is owed", () => {
    const v = pick(0, false);
    const spot = describeSpot(v.history as History, v.player);
    expect(spot.toCallBB).toBe(0);
    expect(spot.actionLabels.c).toBe("Check");
  });

  it.each([
    [0, true],
    [0, false],
    [1, true],
    [1, false],
    [2, true],
    [2, false],
    [3, true],
    [3, false],
  ] as const)(
    "matches parseHistory's chip accounting on street %i (toCall>0=%s)",
    (street, toCallPositive) => {
      const v = pick(street, toCallPositive);
      const h = v.history as History;
      const s = parseHistory(h);
      const spot = describeSpot(h, v.player);

      // describeSpot must be a faithful /2 (chip -> BB) conversion of
      // parseHistory's state, correctly attributed to hero vs. villain by
      // seat -- this is the conversion logic that had no test coverage.
      expect(spot.potBB).toBeCloseTo((s.contrib[0] + s.contrib[1]) / 2, 9);
      expect(spot.toCallBB).toBeCloseTo(
        (s.streetContrib[1 - v.player] - s.streetContrib[v.player]) / 2,
        9,
      );
      expect(spot.heroStackBB).toBeCloseTo((200 - s.contrib[v.player]) / 2, 9);
      expect(spot.villainStackBB).toBeCloseTo(
        (200 - s.contrib[1 - v.player]) / 2,
        9,
      );

      // Total chips are conserved: both stacks plus the pot always sum to
      // each player's full 100bb starting stack, doubled.
      expect(spot.heroStackBB + spot.villainStackBB + spot.potBB).toBeCloseTo(
        200,
        9,
      );
    },
  );
});
