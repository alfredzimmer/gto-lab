/**
 * Web Worker host for the EV rollout.
 *
 * The rollout runs entirely inside one macrotask — ORT's wasm session resolves
 * without ever yielding to the event loop — so on the main thread its whole
 * cost landed as a single freeze (measured ~200ms at 1000 samples, ~850ms at
 * 6000). That freeze is why the sample count had a ceiling: more accuracy
 * bought a longer stall. Off the main thread the stall becomes invisible and
 * the only limit left is how long the user is willing to wait.
 *
 * The worker gets its own ORT session: module registries are per-worker, so
 * `loadStrategySession` here builds a second wasm runtime rather than sharing
 * the page's. That costs one extra (HTTP-cached) fetch of the ~1MB model and
 * one more wasm instance, and buys complete isolation from the UI thread.
 */

import { type EvReport, evaluateActions } from "./ev";
import type { History } from "./holdem";
import { type ActionProb, loadStrategySession } from "./strategy";

export interface EvRequest {
  id: number;
  history: History;
  heroSeat: number;
  strategy: ActionProb[];
  samples?: number;
  stack?: number;
}

export type EvResponse =
  | { id: number; ok: true; report: EvReport }
  | { id: number; ok: false; error: string };

// The project's tsconfig ships the `dom` lib, not `webworker`, and the two
// conflict if both are loaded — so describe the two members of the worker
// scope this file touches rather than pulling in the whole lib.
const ctx = self as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<EvRequest>) => void,
  ): void;
  postMessage(message: EvResponse): void;
};

// Start fetching and compiling the model the moment the worker is constructed,
// so the client's warm-up call overlaps model load with the user reading the
// first spot instead of paying for it on the first graded decision.
loadStrategySession().catch(() => {
  /* surfaced per-request below; a bare rejection here must not kill the worker */
});

ctx.addEventListener("message", async (event: MessageEvent<EvRequest>) => {
  const { id, history, heroSeat, strategy, samples, stack } = event.data;
  try {
    const report = await evaluateActions(history, heroSeat, strategy, {
      samples,
      stack,
    });
    ctx.postMessage({ id, ok: true, report } satisfies EvResponse);
  } catch (err) {
    ctx.postMessage({
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    } satisfies EvResponse);
  }
});
