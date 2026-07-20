/**
 * Targeted (non-random) parity edge cases: solver/scripts/gen_edge_parity_vectors.py
 * constructs specific histories that ~300 randomly-sampled lines in
 * parity-vectors.json essentially never reach -- the raise-cap boundary,
 * the min-raise-clamp-to-all-in collapse, and showdown ties/wheel
 * straights/split pots/kickers. See that script's module docstring for why
 * a banker's-rounding tie vector isn't included: this game's betting
 * structure makes that tie unreachable (proven in
 * solver/tests/test_holdem.py::test_pot_after_call_is_always_even), so
 * there is nothing for a parity vector to cover on that axis.
 */

import edge from "./parity-vectors-edge.json";
import {
  type History,
  compareScores,
  currentPlayer,
  infosetFeatures,
  isTerminal,
  legalActions,
  legalActionIndices,
  parseHistory,
  terminalReturns,
} from "./holdem";

type DecisionVector = {
  history: (number | string)[];
  player: number;
  legalActions: string[];
  legalIndices: number[];
  street: number;
  pot: number;
  toCall: number;
  features: Record<string, number>;
};

type TerminalVector = {
  history: (number | string)[];
  terminalReturns: [number, number];
  note: string;
};

const vectors = edge.vectors as (DecisionVector | TerminalVector)[];
const decisionVectors = vectors.filter(
  (v): v is DecisionVector => "features" in v,
);
const terminalVectors = vectors.filter(
  (v): v is TerminalVector => "terminalReturns" in v,
);

describe("holdem TS/Python parity -- edge cases", () => {
  it("has both decision and terminal edge vectors", () => {
    expect(decisionVectors.length).toBeGreaterThan(0);
    expect(terminalVectors.length).toBe(4);
  });

  it("matches player, legal actions, and canonical indices at edge decisions", () => {
    for (const v of decisionVectors) {
      expect(currentPlayer(v.history)).toBe(v.player);
      expect(legalActions(v.history)).toEqual(v.legalActions);
      expect(legalActionIndices(v.history)).toEqual(v.legalIndices);
    }
  });

  it("matches street, pot, and to-call accounting at edge decisions", () => {
    for (const v of decisionVectors) {
      const s = parseHistory(v.history);
      expect(s.street).toBe(v.street);
      expect(s.contrib[0] + s.contrib[1]).toBe(v.pot);
      expect(s.streetContrib[1 - s.toAct] - s.streetContrib[s.toAct]).toBe(
        v.toCall,
      );
    }
  });

  it("matches the feature encoding exactly at edge decisions", () => {
    for (const v of decisionVectors) {
      const feats = infosetFeatures(v.history as History);
      const nonzero: Record<string, number> = {};
      feats.forEach((val, i) => {
        if (val !== 0) nonzero[String(i)] = Math.round(val * 1e6) / 1e6;
      });
      expect(nonzero).toEqual(v.features);
    }
  });

  it("excludes b0/b1 but keeps all-in legal, exactly at the raise cap", () => {
    // Two distinct decision vectors are generated: one right before the cap
    // (2 raises taken, b0/b1 still legal) and one at the cap (3 raises
    // taken). Both must be present so the boundary is actually exercised,
    // not just "eventually" true somewhere in the vector set.
    const beforeCap = decisionVectors.find((v) =>
      v.legalActions.includes("b0"),
    );
    const atCap = decisionVectors.find(
      (v) => !v.legalActions.includes("b0") && v.legalActions.includes("a"),
    );
    expect(beforeCap).toBeDefined();
    expect(atCap).toBeDefined();
  });

  it("matches terminal payouts on showdown edge cases (wheel/kicker/split/full-house)", () => {
    for (const v of terminalVectors) {
      expect(isTerminal(v.history as History)).toBe(true);
      const r = terminalReturns(v.history as History);
      expect(r[0]).toBeCloseTo(v.terminalReturns[0], 9);
      expect(r[1]).toBeCloseTo(v.terminalReturns[1], 9);
    }
  });

  it("covers an exact split pot among the showdown edge cases", () => {
    const split = terminalVectors.find((v) => v.note.includes("split"));
    expect(split).toBeDefined();
    expect(split!.terminalReturns).toEqual([0, 0]);
  });
});

describe("compareScores", () => {
  // evaluate7 always returns same-length tuples for hands of the same
  // category, so the -Infinity-padding branch for unequal-length inputs is
  // never actually exercised by real showdowns today -- this pins down its
  // intended contract directly so a future change can't silently alter it.
  it("treats a longer higher-category score as strictly greater", () => {
    // [4, 10] (straight, ace-high top) vs [1, 9, 8, 7] (pair) -- category
    // compared first, so length never matters when categories differ.
    expect(compareScores([4, 10], [1, 9, 8, 7])).toBeGreaterThan(0);
  });

  it("pads a missing trailing entry with -Infinity when categories tie", () => {
    // Same leading category+tiebreak, but `a` has one fewer entry: the
    // missing slot must lose to any real value, never compare as equal.
    expect(compareScores([1, 9, 8], [1, 9, 8, 7])).toBeLessThan(0);
    expect(compareScores([1, 9, 8, 7], [1, 9, 8])).toBeGreaterThan(0);
  });

  it("returns 0 for identical scores (exact tie)", () => {
    expect(compareScores([2, 10, 8, 3], [2, 10, 8, 3])).toBe(0);
  });
});
