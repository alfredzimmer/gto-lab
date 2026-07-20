import parity from "./parity-vectors.json";
import type { History } from "./holdem";
import { getStrategy } from "./strategy";

type DecisionVector = {
  history: (number | string)[];
  legalActions: string[];
  legalIndices: number[];
};

// getStrategy's own network-facing logic (ReLU-clip legal logits, normalize
// to a probability distribution, uniform fallback when every legal logit is
// non-positive) has no test coverage today -- only the downstream
// breakEvenEquity math is tested. Mock the ONNX runtime so these three
// branches can be driven directly with known logits.
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

function fixtureWithFiveLegalActions(): DecisionVector {
  const v = (
    parity.vectors as (DecisionVector | { terminalReturns: unknown })[]
  ).find(
    (v): v is DecisionVector =>
      "legalActions" in v && v.legalActions.length === 5,
  );
  if (!v) throw new Error("expected a fixture with all 5 actions legal");
  return v;
}

function mockLogits(logits: number[]) {
  mockRun.mockResolvedValueOnce({
    action_logits: { data: Float32Array.from(logits) },
  });
}

describe("getStrategy", () => {
  beforeEach(() => {
    mockRun.mockReset();
  });

  it("renormalizes positive legal logits proportionally", async () => {
    const v = fixtureWithFiveLegalActions();
    // logits indexed f=0,c=1,b0=2,b1=3,a=4 (ACTION_ORDER); all positive.
    mockLogits([1, 2, 3, 4, 10]);
    const probs = await getStrategy(v.history as History);

    const total = 1 + 2 + 3 + 4 + 10;
    const byAction = Object.fromEntries(
      probs.map((p) => [p.action, p.probability]),
    );
    expect(byAction.f).toBeCloseTo(1 / total, 9);
    expect(byAction.c).toBeCloseTo(2 / total, 9);
    expect(byAction.b0).toBeCloseTo(3 / total, 9);
    expect(byAction.b1).toBeCloseTo(4 / total, 9);
    expect(byAction.a).toBeCloseTo(10 / total, 9);
    expect(probs.reduce((s, p) => s + p.probability, 0)).toBeCloseTo(1, 9);
  });

  it("falls back to uniform when every legal logit is non-positive", async () => {
    const v = fixtureWithFiveLegalActions();
    mockLogits([0, -1, -5, 0, -0.001]);
    const probs = await getStrategy(v.history as History);

    for (const p of probs) {
      expect(p.probability).toBeCloseTo(1 / 5, 9);
    }
  });

  it("clips negative logits to zero before normalizing (mixed sign)", async () => {
    const v = fixtureWithFiveLegalActions();
    // Only b0 and a are positive; f, c, b1 must contribute zero probability.
    mockLogits([-3, -1, 2, -0.5, 6]);
    const probs = await getStrategy(v.history as History);

    const byAction = Object.fromEntries(
      probs.map((p) => [p.action, p.probability]),
    );
    expect(byAction.f).toBe(0);
    expect(byAction.c).toBe(0);
    expect(byAction.b1).toBe(0);
    expect(byAction.b0).toBeCloseTo(2 / 8, 9);
    expect(byAction.a).toBeCloseTo(6 / 8, 9);
  });
});
