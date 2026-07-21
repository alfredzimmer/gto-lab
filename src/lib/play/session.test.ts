import {
  freshSession,
  loadSession,
  recordHand,
  resetSession,
  winRateBb100,
} from "./session";

beforeEach(() => {
  window.localStorage.clear();
});

describe("play session PnL accumulation", () => {
  it("starts empty", () => {
    const s = freshSession();
    expect(s.pnlBB).toBe(0);
    expect(s.handsPlayed).toBe(0);
    expect(s.results).toHaveLength(0);
  });

  it("accumulates deltas into a running cumulative curve", () => {
    let s = freshSession();
    s = recordHand(s, 5, "showdown");
    s = recordHand(s, -2, "fold");
    s = recordHand(s, 10.5, "showdown");

    expect(s.handsPlayed).toBe(3);
    expect(s.pnlBB).toBeCloseTo(13.5);
    expect(s.results.map((r) => r.cumBB)).toEqual([5, 3, 13.5]);
    expect(s.results.map((r) => r.hand)).toEqual([1, 2, 3]);
    expect(s.results[1].reason).toBe("fold");
  });

  it("computes win rate in bb/100", () => {
    let s = freshSession();
    expect(winRateBb100(s)).toBe(0);
    s = recordHand(s, 4, "showdown");
    s = recordHand(s, 4, "showdown");
    expect(winRateBb100(s)).toBeCloseTo(400);
  });
});

describe("play session persistence", () => {
  it("survives a reload via localStorage", () => {
    let s = freshSession();
    s = recordHand(s, 7, "showdown");
    s = recordHand(s, -3, "fold");

    const reloaded = loadSession();
    expect(reloaded.pnlBB).toBeCloseTo(4);
    expect(reloaded.handsPlayed).toBe(2);
    expect(reloaded.results).toHaveLength(2);
  });

  it("returns a fresh session when nothing is stored", () => {
    const s = loadSession();
    expect(s.handsPlayed).toBe(0);
  });

  it("recovers from corrupt stored data", () => {
    window.localStorage.setItem("gto-lab:play:v1", "{not valid json");
    const s = loadSession();
    expect(s.handsPlayed).toBe(0);
  });

  it("reset clears persisted state", () => {
    let s = freshSession();
    s = recordHand(s, 12, "showdown");
    expect(loadSession().handsPlayed).toBe(1);

    const cleared = resetSession();
    expect(cleared.handsPlayed).toBe(0);
    expect(loadSession().handsPlayed).toBe(0);
  });
});
