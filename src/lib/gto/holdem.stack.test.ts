import {
  type History,
  aggressiveAmounts,
  infosetFeatures,
  legalActions,
  parseHistory,
  terminalReturns,
} from "./holdem";

// Ace of clubs / Ace of diamonds for player 0, offsuit 2/7 for player 1.
const HOLES = [12, 25, 26, 31];
// A dry board where AA wins: Kc Qc Jd 3c 4d (no collisions with holes).
const BOARD = [11, 10, 22, 1, 15];
// Preflop: player 0 shoves, player 1 calls, then the board runs out.
const ALLIN_SHOWDOWN: History = [...HOLES, "a", "c", ...BOARD];

describe("effective-stack parameter (carried stacks)", () => {
  it("defaults to the trained 100 BB stack (backward compatible)", () => {
    expect(parseHistory(ALLIN_SHOWDOWN)).toEqual(
      parseHistory(ALLIN_SHOWDOWN, 200),
    );
    expect(terminalReturns(ALLIN_SHOWDOWN)).toEqual(
      terminalReturns(ALLIN_SHOWDOWN, 200),
    );
  });

  it("caps an all-in at the effective stack", () => {
    const short = parseHistory(ALLIN_SHOWDOWN, 40); // 20 BB effective
    expect(short.contrib).toEqual([40, 40]);
    const deep = parseHistory(ALLIN_SHOWDOWN, 200); // 100 BB effective
    expect(deep.contrib).toEqual([200, 200]);
  });

  it("bounds terminal payoff by the effective stack", () => {
    // Player 0 (AA) wins the other player's whole effective stack.
    expect(terminalReturns(ALLIN_SHOWDOWN, 40)).toEqual([20, -20]);
    expect(terminalReturns(ALLIN_SHOWDOWN, 200)).toEqual([100, -100]);
  });

  it("scales the all-in bet size to the effective stack", () => {
    // Preflop, player 0 to act: stack behind is the whole effective stack.
    const s40 = parseHistory(HOLES, 40);
    expect(aggressiveAmounts(s40).a).toBe(40);
    const s200 = parseHistory(HOLES, 200);
    expect(aggressiveAmounts(s200).a).toBe(200);
    // "All-in" is always a legal action preflop.
    expect(legalActions(HOLES, 40)).toContain("a");
  });

  it("normalizes stack features by the effective stack", () => {
    // x[110] = (stack - ownContrib) / stack; player 0 has posted the SB (1).
    const short = infosetFeatures(HOLES, 40)[110];
    const deep = infosetFeatures(HOLES, 200)[110];
    expect(short).toBeCloseTo(39 / 40);
    expect(deep).toBeCloseTo(199 / 200);
    expect(short).not.toBeCloseTo(deep);
  });
});
