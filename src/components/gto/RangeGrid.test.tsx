import { render, screen } from "@testing-library/react";
import RangeGrid from "./RangeGrid";
import {
  type RangeGrid as RangeGridData,
  combosFor,
  handClasses,
} from "@/lib/gto/ranges";

const ACTIONS = ["f", "c", "b0", "b1"];
const FLAT = [0.25, 0.25, 0.25, 0.25];

/**
 * A full 13x13 grid whose AA cell's combos can be given a custom per-combo
 * strategy. Every other cell plays FLAT with one entry per live combo.
 */
function buildGrid(aaCombos: number[][]): RangeGridData {
  const cells = handClasses().map((cls) => {
    const combos = combosFor(cls, new Set());
    if (cls.label === "AA") {
      return {
        ...cls,
        combos: aaCombos.length,
        probs: FLAT,
        comboList: combos
          .slice(0, aaCombos.length)
          .map((cards, i) => ({ cards, probs: aaCombos[i] })),
      };
    }
    return {
      ...cls,
      combos: combos.length,
      probs: FLAT,
      comboList: combos.map((cards) => ({ cards, probs: FLAT })),
    };
  });
  return { cells, actions: ACTIONS, aggregate: FLAT, actingSeat: 0 };
}

describe("RangeGrid combo breakdown", () => {
  it("lists every combo when the exact suits change the play", () => {
    // AA on a flush-relevant board: the three A-of-the-flush-suit combos bet
    // where the others check -> two distinct strategies across six combos.
    const draw = [0.1, 0.3, 0.5, 0.1];
    const noDraw = [0.6, 0.4, 0.0, 0.0];
    const { container } = render(
      <RangeGrid
        grid={buildGrid([draw, noDraw, noDraw, draw, noDraw, draw])}
      />,
    );

    // The section is present and titled "Combos" (not the old "By suit").
    expect(screen.getByText("Combos")).toBeTruthy();
    expect(screen.queryByText("By suit")).toBeNull();

    // Every one of AA's six combos gets its own row (each renders one MixBar).
    const comboBars = container.querySelectorAll('[class*="h-2.5"]');
    expect(comboBars).toHaveLength(6);
  });

  it("hides the breakdown when every combo plays identically", () => {
    render(
      <RangeGrid grid={buildGrid([FLAT, FLAT, FLAT, FLAT, FLAT, FLAT])} />,
    );
    expect(screen.queryByText("Combos")).toBeNull();
  });
});
