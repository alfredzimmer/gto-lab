import { ACTION_INDEX, STACK, currentPlayer } from "../src/lib/gto/holdem";
import { computeRangeGrid, nodeSummary } from "../src/lib/gto/ranges";
import { describeSpot } from "../src/lib/gto/strategy";
import { buildHistory, buildPublicTokens } from "./notation";
import { runStrategyBatch } from "./runner-node";
import { getStrategy } from "./strategy-core";

async function main() {
  // 1) Preflop: hero BTN/SB with AKs, first decision.
  {
    const { history, heroSeat } = buildHistory({
      hero: "As Ks",
      heroSeat: 0,
      stack: STACK,
    });
    const probs = await getStrategy(runStrategyBatch, history, STACK);
    const info = describeSpot(history, heroSeat, STACK);
    console.log("[1] Preflop AKs SB open:");
    console.log("    seat", heroSeat, "toAct", currentPlayer(history));
    for (const p of probs)
      console.log(
        `    ${info.actionLabels[p.action]}: ${(p.probability * 100).toFixed(1)}%`,
      );
  }

  // 2) A postflop line: SB opens, BB calls, flop, BB checks -> SB to act.
  {
    const { history, heroSeat } = buildHistory({
      hero: "Ah Kd",
      heroSeat: 0,
      board: "Jh 7c 2s",
      line: ["SB raise 6", "BB call", "BB check"],
      stack: STACK,
    });
    const probs = await getStrategy(runStrategyBatch, history, STACK);
    const info = describeSpot(history, heroSeat, STACK);
    console.log("\n[2] Flop Jh7c2s, AKo SB after BB check:");
    console.log(
      "    pot",
      info.potBB,
      "toCall",
      info.toCallBB,
      "line",
      info.lineDescription,
    );
    console.log("    toAct seat", currentPlayer(history), "hero", heroSeat);
    for (const p of probs)
      console.log(
        `    ${info.actionLabels[p.action]}: ${(p.probability * 100).toFixed(1)}%`,
      );
  }

  // 3) Range grid: preflop, SB to act (empty line).
  {
    const tokens = buildPublicTokens({ stack: STACK });
    const grid = await computeRangeGrid(tokens, runStrategyBatch, ACTION_INDEX);
    const sum = nodeSummary(tokens);
    console.log("\n[3] Preflop range grid, acting seat", sum.actingSeat);
    console.log("    actions", grid.actions);
    console.log(
      "    aggregate",
      grid.aggregate.map((v) => v.toFixed(3)),
    );
    const show = (label: string) => {
      const c = grid.cells.find((x) => x.label === label);
      console.log(
        `    ${label}: ${c?.probs?.map((v) => v.toFixed(2)).join(" / ")}`,
      );
    };
    show("AA");
    show("AKs");
    show("72o");
    show("K9o");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
