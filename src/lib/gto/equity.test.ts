import { compareScores, evaluate7 } from "./holdem";
import { candidatePairs, equityVsRange } from "./strategy";

// Card int = suit*13 + rank (rank 0..12 = 2..A; suit 0..3 = clubs,d,h,s).
// The spot from the bug report: hero 6d 6c on K♠ Q♦ 4♦ T♠ 3♦ (river) — a
// pair of sixes, which the trainer wrongly showed as 64% "calling equity".
const HERO: [number, number] = [17, 4]; // 6d, 6c
const BOARD = [50, 23, 15, 47, 14]; // Ks, Qd, 4d, Ts, 3d

/** Exact showdown equity vs a uniform range, by brute force over every combo. */
function exactEquityVsUniform(
  hero: [number, number],
  board: number[],
  pairs: [number, number][],
): number {
  let score = 0;
  const heroScore = evaluate7([hero[0], hero[1], ...board]);
  for (const [va, vb] of pairs) {
    const cmp = compareScores(heroScore, evaluate7([va, vb, ...board]));
    if (cmp > 0) score += 1;
    else if (cmp === 0) score += 0.5;
  }
  return score / pairs.length;
}

describe("equityVsRange", () => {
  const pairs = candidatePairs(new Set<number>([...HERO, ...BOARD]));
  const uniform = new Float32Array(pairs.length).fill(1);

  it("matches a brute-force showdown count against a uniform range", () => {
    const exact = exactEquityVsUniform(HERO, BOARD, pairs);
    const mc = equityVsRange(HERO, BOARD, pairs, uniform, 40000);
    expect(Math.abs(mc - exact)).toBeLessThan(0.02);
  });

  it("compares hand tuples numerically, not as strings", () => {
    // Regression for the 64% bug: evaluate7 returns [category, ...kickers], so
    // comparing results with `>`/`===` coerces the arrays to strings and makes
    // a pair of sixes "beat" a pair of kings. Against a range of exactly one
    // hand — Kc Kd (which flops trips on this board) — the hero's pair of sixes
    // must have 0 equity.
    const kk: [number, number][] = [[11, 24]]; // Kc, Kd
    const eq = equityVsRange(HERO, BOARD, kk, new Float32Array([1]), 200);
    expect(eq).toBe(0);
  });
});
