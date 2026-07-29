/**
 * The strategy-net readout, factored out of the browser-bound getStrategy in
 * src/lib/gto/strategy.ts so it can run over any `BatchRunner` (native or
 * wasm). Identical clip-and-normalize (uniform fallback when a row has no
 * positive legal logit) — the same rule the range grid and the LBR exploiter
 * use.
 */

import {
  ACTION_INDEX,
  type History,
  STACK,
  infosetFeatures,
  legalActions,
} from "../src/lib/gto/holdem";
import type { BatchRunner } from "../src/lib/gto/ranges";

export interface ActionProb {
  action: string;
  probability: number;
}

/** GTO action distribution at a decision node (legal actions only). */
export async function getStrategy(
  runBatch: BatchRunner,
  h: History,
  stack: number = STACK,
): Promise<ActionProb[]> {
  const features = infosetFeatures(h, stack);
  const logits = await runBatch(features, 1);
  const actions = legalActions(h, stack);
  const clipped = actions.map((a) => Math.max(logits[ACTION_INDEX[a]], 0));
  const total = clipped.reduce((s, v) => s + v, 0);
  if (total <= 0) {
    return actions.map((action) => ({
      action,
      probability: 1 / actions.length,
    }));
  }
  return actions.map((action, i) => ({
    action,
    probability: clipped[i] / total,
  }));
}
