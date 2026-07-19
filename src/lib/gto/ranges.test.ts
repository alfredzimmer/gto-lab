import { ACTION_INDEX, MAX_ACTIONS } from "./holdem";
import {
  boardCardsOf,
  combosFor,
  computeRangeGrid,
  handClasses,
  navigationHistory,
  nodeSummary,
} from "./ranges";

describe("hand class enumeration", () => {
  const classes = handClasses();

  it("covers all 169 classes with the right kinds", () => {
    expect(classes).toHaveLength(169);
    expect(classes.filter((c) => c.kind === "pair")).toHaveLength(13);
    expect(classes.filter((c) => c.kind === "suited")).toHaveLength(78);
    expect(classes.filter((c) => c.kind === "offsuit")).toHaveLength(78);
  });

  it("expands to the standard 1326 combos with no dead cards", () => {
    const total = classes.reduce(
      (s, c) => s + combosFor(c, new Set()).length,
      0,
    );
    expect(total).toBe(1326);
  });

  it("gives 6 combos per pair, 4 per suited, 12 per offsuit", () => {
    const byLabel = new Map(classes.map((c) => [c.label, c]));
    const counts = ["AA", "AKs", "AKo"].map(
      (label) => combosFor(byLabel.get(label) ?? classes[0], new Set()).length,
    );
    expect(counts).toEqual([6, 4, 12]);
  });

  it("removes combos blocked by dead cards", () => {
    const aa = classes.find((c) => c.label === "AA") ?? classes[0];
    // one ace dead: only 3 aces remain -> C(3,2) = 3 combos
    const aceOfClubs = 12; // suit 0, rank 12
    expect(combosFor(aa, new Set([aceOfClubs])).length).toBe(3);
  });
});

describe("navigation with placeholder holes", () => {
  it("root node is the SB decision", () => {
    const s = nodeSummary([]);
    expect(s.actingSeat).toBe(0);
    expect(s.street).toBe(0);
    expect(s.potBB).toBe(1.5);
    expect(s.toCallBB).toBe(0.5);
  });

  it("placeholders avoid board cards", () => {
    const tokens = ["c", "c", 0, 1, 2]; // limped pot, flop = cards 0,1,2
    const nav = navigationHistory(tokens);
    const holes = nav.slice(0, 4) as number[];
    for (const c of [0, 1, 2]) {
      expect(holes).not.toContain(c);
    }
    expect(boardCardsOf(tokens)).toEqual([0, 1, 2]);
  });
});

describe("computeRangeGrid", () => {
  it("aggregates a fake uniform strategy to uniform range frequencies", async () => {
    // Fake runner: equal positive logit everywhere -> uniform probs.
    const runner = async (_f: Float32Array, rows: number) =>
      new Float32Array(rows * MAX_ACTIONS).fill(1);

    const grid = await computeRangeGrid([], runner, ACTION_INDEX);
    expect(grid.actingSeat).toBe(0);
    expect(grid.actions).toEqual(["f", "c", "b0", "b1", "a"]);
    expect(grid.cells).toHaveLength(169);

    for (const cell of grid.cells) {
      expect(cell.combos).toBeGreaterThan(0);
      for (const p of cell.probs ?? []) {
        expect(p).toBeCloseTo(1 / 5, 9);
      }
      expect(cell.probs).toHaveLength(5);
    }
    for (const p of grid.aggregate) {
      expect(p).toBeCloseTo(1 / 5, 9);
    }
  });

  it("blocks classes that collide with the board", async () => {
    const runner = async (_f: Float32Array, rows: number) =>
      new Float32Array(rows * MAX_ACTIONS).fill(1);

    // Flop with three aces: AA has zero live combos.
    const tokens = ["c", "c", 12, 25, 38];
    const grid = await computeRangeGrid(tokens, runner, ACTION_INDEX);
    const aa = grid.cells.find((c) => c.label === "AA");
    expect(aa?.combos).toBe(0);
    expect(aa?.probs).toBeNull();

    const kk = grid.cells.find((c) => c.label === "KK");
    expect(kk?.combos).toBe(6);
  });

  it("throws on non-decision nodes", async () => {
    const runner = async (_f: Float32Array, rows: number) =>
      new Float32Array(rows * MAX_ACTIONS).fill(1);
    // After a call+check the preflop street closes -> chance node.
    await expect(
      computeRangeGrid(["c", "c"], runner, ACTION_INDEX),
    ).rejects.toThrow("not a decision node");
  });
});
