/**
 * Main-thread client for the trainer's estimate worker (./ev.worker.ts).
 *
 * One worker is created lazily and reused for the whole session — spawning per
 * request would re-fetch and re-compile the model every deal, which costs far
 * more than the work itself.
 *
 * Every path degrades to running the computation inline on the main thread: no
 * `Worker` constructor (SSR, ancient browsers), construction throwing, or the
 * worker erroring out. That fallback is the pre-worker behaviour — a stall on
 * the UI thread — which is worse than the worker but much better than a trainer
 * that silently stops grading.
 */

import type { EvReport } from "./ev";
import type {
  EquityRequest,
  EvRequest,
  WorkerRequest,
  WorkerResponse,
} from "./ev.worker";
import type { History } from "./holdem";
import type { ActionProb } from "./strategy";

export interface EvOptions {
  stack?: number;
  samples?: number;
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (err: unknown) => void;
  /** Redo this request inline if the worker dies mid-flight. */
  rerun: () => Promise<unknown>;
}

let worker: Worker | null = null;
let workerUnavailable = false;
let nextRequestId = 1;
const pending = new Map<number, PendingRequest>();

/** Run a request on the main thread. The rollout and equity modules are loaded
 *  on demand so the worker path doesn't pull them into the page bundle. */
async function runInline(request: WorkerRequest): Promise<unknown> {
  if (request.kind === "equity") {
    const { heroEquityVsRange } = await import("./strategy");
    return heroEquityVsRange(
      request.history,
      request.heroSeat,
      request.stack,
      request.samples,
    );
  }
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
    p.rerun().then(p.resolve, p.reject);
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
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const msg = event.data;
    const p = pending.get(msg.id);
    if (!p) return; // superseded by a newer deal; the caller stopped caring
    pending.delete(msg.id);
    if (!msg.ok) p.reject(new Error(msg.error));
    else p.resolve(msg.kind === "equity" ? msg.equity : msg.report);
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

/** Dispatch a request to the worker, or run it inline when there is no worker.
 *  `rerun` is how to redo it inline if the worker dies after we hand it off. */
function dispatch<T>(
  request: WorkerRequest,
  rerun: () => Promise<unknown>,
): Promise<T> {
  const w = getWorker();
  if (!w) return rerun() as Promise<T>;
  return new Promise<T>((resolve, reject) => {
    pending.set(request.id, {
      resolve: resolve as (value: unknown) => void,
      reject,
      rerun,
    });
    try {
      w.postMessage(request);
    } catch (err) {
      pending.delete(request.id);
      reject(err);
    }
  });
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
    kind: "ev",
    id: nextRequestId++,
    history,
    heroSeat,
    strategy,
    samples: options.samples,
    stack: options.stack,
  };
  return dispatch<EvReport>(request, () => runInline(request));
}

/**
 * Hero showdown equity vs the villain's posterior range at a decision node,
 * computed off the main thread. Same contract as `heroEquityVsRange`.
 * Preflop is its heaviest case — the villain posterior queries the net for
 * every unblocked combo (up to 1225 rows) — which is exactly the work this
 * keeps off the UI thread.
 */
export function heroEquityVsRangeAsync(
  history: History,
  heroSeat: number,
  options: EvOptions = {},
): Promise<number> {
  const request: EquityRequest = {
    kind: "equity",
    id: nextRequestId++,
    history,
    heroSeat,
    samples: options.samples,
    stack: options.stack,
  };
  return dispatch<number>(request, () => runInline(request));
}
