/**
 * Main-thread client for the EV rollout worker (./ev.worker.ts).
 *
 * One worker is created lazily and reused for the whole session — spawning per
 * request would re-fetch and re-compile the model every deal, which costs far
 * more than the rollout itself.
 *
 * Every path degrades to running the rollout inline on the main thread: no
 * `Worker` constructor (SSR, ancient browsers), construction throwing, or the
 * worker erroring out. That fallback is the pre-worker behaviour — a ~200ms
 * stall — which is worse than the worker but much better than a trainer that
 * silently stops grading.
 */

import type { EvReport } from "./ev";
import type { EvRequest, EvResponse } from "./ev.worker";
import type { History } from "./holdem";
import type { ActionProb } from "./strategy";

export interface EvOptions {
  stack?: number;
  samples?: number;
}

interface PendingRequest {
  resolve: (report: EvReport) => void;
  reject: (err: unknown) => void;
  /** Kept so a worker that dies mid-flight can be retried on the main thread. */
  request: EvRequest;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/** Run the rollout on the main thread. Loaded on demand so the worker path
 *  doesn't pull the rollout into the page bundle. */
async function runInline(request: EvRequest): Promise<EvReport> {
  const { evaluateActions } = await import("./ev");
  return evaluateActions(request.history, request.heroSeat, request.strategy, {
    samples: request.samples,
    stack: request.stack,
  });
}

/** Give up on the worker and finish everything still in flight inline. */
function abandonWorker() {
  workerUnavailable = true;
  worker?.terminate();
  worker = null;
  const stranded = [...pending.values()];
  pending.clear();
  for (const p of stranded) {
    runInline(p.request).then(p.resolve, p.reject);
  }
}

function getWorker(): Worker | null {
  if (workerUnavailable) return null;
  if (worker) return worker;
  if (typeof Worker === "undefined") {
    workerUnavailable = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./ev.worker.ts", import.meta.url));
  } catch {
    workerUnavailable = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<EvResponse>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return; // superseded by a newer deal; the caller stopped caring
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.report);
    else p.reject(new Error(msg.error));
  };
  // Fires for module-load failures and other uncaught worker errors, which no
  // per-request try/catch inside the worker can see.
  worker.onerror = abandonWorker;
  return worker;
}

/**
 * Construct the worker (and start its model load) before anything needs it, so
 * the first graded decision doesn't pay for compiling the model. Safe to call
 * repeatedly and safe during SSR — it no-ops without a `Worker` constructor.
 */
export function warmUpEvWorker(): void {
  getWorker();
}

/**
 * Per-action EV for a hero decision node, computed off the main thread.
 * Same contract as `evaluateActions`, minus the precomputed-posterior option:
 * a posterior cannot be handed across the worker boundary cheaply, and the
 * worker recomputes it from its own session anyway.
 */
export function evaluateActionsAsync(
  history: History,
  heroSeat: number,
  strategy: ActionProb[],
  options: EvOptions = {},
): Promise<EvReport> {
  const request: EvRequest = {
    id: nextRequestId++,
    history,
    heroSeat,
    strategy,
    samples: options.samples,
    stack: options.stack,
  };
  const w = getWorker();
  if (!w) return runInline(request);

  return new Promise<EvReport>((resolve, reject) => {
    pending.set(request.id, { resolve, reject, request });
    try {
      w.postMessage(request);
    } catch (err) {
      pending.delete(request.id);
      reject(err);
    }
  });
}
