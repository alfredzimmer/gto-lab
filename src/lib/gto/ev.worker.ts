/**
 * Web Worker host for the trainer's two background estimates: the per-action
 * EV rollout and the hero-vs-range showdown equity.
 *
 * Both are pure wasm-session number crunching that resolves without ever
 * yielding to the event loop, so on the main thread each one landed as a
 * single freeze — the EV rollout at ~200-850ms, and the equity's villain
 * posterior at up to 1225 network rows on a preflop node. Running them here
 * keeps the UI thread free no matter how many samples or combos they touch.
 *
 * The worker gets its own ORT session: module registries are per-worker, so
 * `loadStrategySession` here builds a second wasm runtime rather than sharing
 * the page's. That costs one extra (HTTP-cached) fetch of the ~1MB model and
 * one more wasm instance, and buys complete isolation from the UI thread.
 */

import { type EvReport, evaluateActions } from "./ev";
import type { History } from "./holdem";
import {
  type ActionProb,
  heroEquityVsRange,
  loadStrategySession,
} from "./strategy";

export interface EvRequest {
  kind: "ev";
  id: number;
  history: History;
  heroSeat: number;
  strategy: ActionProb[];
  samples?: number;
  stack?: number;
}

export interface EquityRequest {
  kind: "equity";
  id: number;
  history: History;
  heroSeat: number;
  stack?: number;
  samples?: number;
}

export type WorkerRequest = EvRequest | EquityRequest;

export type WorkerResponse =
  | { id: number; ok: true; kind: "ev"; report: EvReport }
  | { id: number; ok: true; kind: "equity"; equity: number }
  | { id: number; ok: false; error: string };

// The project's tsconfig ships the `dom` lib, not `webworker`, and the two
// conflict if both are loaded — so describe the two members of the worker
// scope this file touches rather than pulling in the whole lib.
const ctx = self as unknown as {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<WorkerRequest>) => void,
  ): void;
  postMessage(message: WorkerResponse): void;
};

// Start fetching and compiling the model the moment the worker is constructed,
// so the client's warm-up call overlaps model load with the user reading the
// first spot instead of paying for it on the first graded decision.
loadStrategySession().catch(() => {
  /* surfaced per-request below; a bare rejection here must not kill the worker */
});

async function handle(req: WorkerRequest): Promise<WorkerResponse> {
  if (req.kind === "equity") {
    const equity = await heroEquityVsRange(
      req.history,
      req.heroSeat,
      req.stack,
      req.samples,
    );
    return { id: req.id, ok: true, kind: "equity", equity };
  }
  const report = await evaluateActions(
    req.history,
    req.heroSeat,
    req.strategy,
    {
      samples: req.samples,
      stack: req.stack,
    },
  );
  return { id: req.id, ok: true, kind: "ev", report };
}

ctx.addEventListener("message", async (event: MessageEvent<WorkerRequest>) => {
  const req = event.data;
  try {
    ctx.postMessage(await handle(req));
  } catch (err) {
    ctx.postMessage({
      id: req.id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
