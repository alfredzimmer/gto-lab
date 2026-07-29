import { evaluateActions } from "./ev";
import {
  type History,
  currentPlayer,
  legalActions,
  parseHistory,
} from "./holdem";
import parity from "./parity-vectors.json";
import { getStrategy } from "./strategy";

type DecisionVector = { history: (number | string)[]; legalActions: string[] };

// The rollout is Monte-Carlo, so most of what it produces can only be checked
// statistically. These tests pin the parts that are exact by construction:
// the fold branch has no variance at all, and the mix anchor is a fixed convex
// combination of the very same per-sample returns, so losses must cancel under
// it regardless of what the network says or how the deck falls.
const mockRun = jest.fn();
jest.mock("onnxruntime-web/wasm", () => ({
  env: { wasm: {} },
  Tensor: jest.fn((_type: string, data: unknown, dims: unknown) => ({
    data,
    dims,
  })),
  InferenceSession: {
    create: jest.fn(async () => ({ run: mockRun })),
  },
}));

/** A postflop node where the hero faces a bet, so folding is legal. */
function postflopNodeFacingBet(): History {
  const v = (
    parity.vectors as (DecisionVector | { terminalReturns: unknown })[]
  ).find(
    (v): v is DecisionVector =>
      "legalActions" in v &&
      v.legalActions.includes("f") &&
      parseHistory(v.history as History).board.length >= 3,
  );
  if (!v) throw new Error("expected a postflop fixture facing a bet");
  return v.history as History;
}

describe("evaluateActions", () => {
  const SAMPLES = 25;

  beforeEach(() => {
    mockRun.mockReset();
    // Flat logits: every legal action is equally likely at every node, which
    // keeps rollouts terminating (the raise cap closes each street) without
    // making the test depend on the shipped model's weights.
    mockRun.mockImplementation(
      async (feeds: { features: { dims: number[] } }) => ({
        action_logits: {
          data: new Float32Array(feeds.features.dims[0] * 6).fill(1),
        },
      }),
    );
  });

  it("reports one entry per legal action, in engine order", async () => {
    const h = postflopNodeFacingBet();
    const heroSeat = currentPlayer(h);
    const report = await evaluateActions(h, heroSeat, await getStrategy(h), {
      samples: SAMPLES,
    });

    expect(report.actions.map((a) => a.action)).toEqual(legalActions(h));
    expect(report.samples).toBe(SAMPLES);
    for (const a of report.actions) {
      expect(Number.isFinite(a.evBB)).toBe(true);
      expect(Number.isFinite(a.lossBB)).toBe(true);
      expect(a.lossSeBB).toBeGreaterThanOrEqual(0);
    }
  });

  it("prices a fold at exactly the chips already committed, with no variance", async () => {
    const h = postflopNodeFacingBet();
    const heroSeat = currentPlayer(h);
    // Folding forfeits the hero's contribution so far and adds nothing, so its
    // return is identical in every world — a closed-form check on the rollout's
    // terminal accounting and on the BB unit conversion.
    const committedBB = parseHistory(h).contrib[heroSeat] / 2;

    const report = await evaluateActions(h, heroSeat, await getStrategy(h), {
      samples: SAMPLES,
    });
    const fold = report.actions.find((a) => a.action === "f");

    expect(fold).toBeDefined();
    expect(fold?.evBB).toBeCloseTo(-committedBB, 10);
  });

  it("anchors losses on the solver's mix, so they cancel under it", async () => {
    const h = postflopNodeFacingBet();
    const heroSeat = currentPlayer(h);
    const strategy = await getStrategy(h);
    const report = await evaluateActions(h, heroSeat, strategy, {
      samples: SAMPLES,
    });

    const byAction = Object.fromEntries(
      strategy.map((s) => [s.action, s.probability]),
    );
    const weightedLoss = report.actions.reduce(
      (sum, a) => sum + byAction[a.action] * a.lossBB,
      0,
    );
    // sum pi(a) * (mixEV - EV(a)) == mixEV - mixEV == 0 by construction.
    expect(weightedLoss).toBeCloseTo(0, 10);

    const weightedEv = report.actions.reduce(
      (sum, a) => sum + byAction[a.action] * a.evBB,
      0,
    );
    expect(report.mixEvBB).toBeCloseTo(weightedEv, 10);
  });

  it("takes the expectation of a called all-in instead of dealing one river", async () => {
    // Hero (seat 0) holds A(s) A(h) on a A(d) A(c) K(s) 7(h) turn, so it has
    // four aces and the board holds the other two — no villain combo and no
    // river can beat it. Calling the villain's jam is therefore worth exactly
    // the villain's stack in EVERY runout, which pins the averaged all-in
    // branch's stake accounting to a closed form rather than a tolerance.
    // Card ints are suit * 13 + rank, rank 0 = deuce.
    const A_S = 3 * 13 + 12;
    const A_H = 2 * 13 + 12;
    const A_D = 1 * 13 + 12;
    const A_C = 0 * 13 + 12;
    const K_S = 3 * 13 + 11;
    const SEVEN_H = 2 * 13 + 5;
    const h: History = [
      A_S,
      A_H,
      0, // villain hole cards are marginalized away by the posterior anyway
      14,
      "c",
      "c", // preflop limp / check
      A_D,
      A_C,
      K_S,
      "c",
      "c", // flop checks through
      SEVEN_H,
      "a", // villain jams the turn
    ];
    expect(parseHistory(h).status).toBe("act");
    expect(parseHistory(h).toAct).toBe(0);

    const report = await evaluateActions(h, 0, await getStrategy(h), {
      samples: 8,
    });
    const byAction = Object.fromEntries(
      report.actions.map((a) => [a.action, a]),
    );

    // Calling wins the villain's whole 100 BB stack on every river.
    expect(byAction.c.evBB).toBeCloseTo(100, 10);
    expect(byAction.c.lossSeBB).toBeLessThan(1e-9);
    // Folding forfeits only the 1 BB limped in preflop.
    expect(byAction.f.evBB).toBeCloseTo(-1, 10);
  });

  it("rejects a node that is not the given seat's decision", async () => {
    const h = postflopNodeFacingBet();
    const villainSeat = 1 - currentPlayer(h);
    await expect(
      evaluateActions(h, villainSeat, await getStrategy(h), {
        samples: SAMPLES,
      }),
    ).rejects.toThrow(/hero decision node/);
  });
});
