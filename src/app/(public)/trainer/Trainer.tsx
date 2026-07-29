"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionButtons from "@/components/gto/ActionButtons";
import ActionLine from "@/components/gto/ActionLine";
import GtoFeedback from "@/components/gto/GtoFeedback";
import GtoTable from "@/components/gto/GtoTable";
import {
  evaluateActionsAsync,
  heroEquityVsRangeAsync,
  warmUpEvWorker,
} from "@/lib/gto/ev-client";
import type { EvReport } from "@/lib/gto/ev";
import {
  type ActionProb,
  type GtoScenario,
  type SpotInfo,
  describeSpot,
  generateScenario,
  getStrategy,
  loadStrategySession,
} from "@/lib/gto/strategy";

type ModelStatus = "loading" | "ready" | "unavailable";

const STREET_OPTIONS = ["Preflop", "Flop", "Turn", "River"];

export default function Trainer() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [strategy, setStrategy] = useState<ActionProb[] | null>(null);
  const [userAction, setUserAction] = useState<string | null>(null);
  const [equity, setEquity] = useState<number | null>(null);
  const [equityPending, setEquityPending] = useState(false);
  const [ev, setEv] = useState<EvReport | null>(null);
  const [evPending, setEvPending] = useState(false);
  const [dealing, setDealing] = useState(false);
  const [dealFailed, setDealFailed] = useState(false);
  const [streets, setStreets] = useState<Set<number>>(
    () => new Set([1, 2, 3]), // preflop off by default
  );
  // Guards async equity/EV results so a newer deal supersedes a stale one.
  const reqIdRef = useRef(0);

  useEffect(() => {
    // Spawn the rollout worker alongside the page's own session so both
    // models are compiling while the first spot is being dealt.
    warmUpEvWorker();
    loadStrategySession()
      .then(() => setModelStatus("ready"))
      .catch(() => setModelStatus("unavailable"));
  }, []);

  const nextSpot = useCallback(async () => {
    setDealing(true);
    setUserAction(null);
    setDealFailed(false);
    setEquity(null);
    setEquityPending(false);
    setEv(null);
    setEvPending(false);
    const reqId = ++reqIdRef.current;

    let dealt: { sc: GtoScenario; info: SpotInfo; probs: ActionProb[] } | null =
      null;
    try {
      const sc = await generateScenario(streets);
      if (reqIdRef.current !== reqId) return; // superseded by a newer deal
      const info = describeSpot(sc.history, sc.heroSeat);
      const probs = await getStrategy(sc.history);
      setSpot(info);
      setStrategy(probs);
      dealt = { sc, info, probs };
    } catch {
      if (reqIdRef.current !== reqId) return;
      setSpot(null);
      setDealFailed(true);
    } finally {
      if (reqIdRef.current === reqId) setDealing(false);
    }
    if (!dealt) return;

    // The spot is on screen now — spend the user's thinking time on the two
    // background estimates, so both are already there the moment they act.
    // Neither depends on which action they pick. Both run in the worker, off
    // the UI thread, so a heavy preflop posterior never freezes the page. A
    // newer deal discards stale results via reqId.
    const { sc, info, probs } = dealt;
    const wantEquity = info.toCallBB > 0; // only meaningful facing a bet
    setEquityPending(wantEquity);
    setEvPending(true);

    evaluateActionsAsync(sc.history, sc.heroSeat, probs)
      .then((report) => {
        if (reqIdRef.current === reqId) setEv(report);
      })
      .catch(() => {
        if (reqIdRef.current === reqId) setEv(null);
      })
      .finally(() => {
        if (reqIdRef.current === reqId) setEvPending(false);
      });

    if (!wantEquity) return;
    heroEquityVsRangeAsync(sc.history, sc.heroSeat)
      .then((e) => {
        if (reqIdRef.current === reqId) setEquity(e);
      })
      .catch(() => {
        if (reqIdRef.current === reqId) setEquity(null);
      })
      .finally(() => {
        if (reqIdRef.current === reqId) setEquityPending(false);
      });
  }, [streets]);

  const toggleStreet = useCallback((s: number) => {
    setStreets((prev) => {
      if (prev.has(s) && prev.size === 1) return prev; // keep at least one
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  useEffect(() => {
    if (modelStatus === "ready") {
      nextSpot();
    }
  }, [modelStatus, nextSpot]);

  // The label sits beside the chips on a phone and above them from `sm` up
  // (`sm:w-full` forces its own line), so the whole control is one row on mobile.
  const streetPanel = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2.5 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <div className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider sm:w-full sm:mb-2">
          <span className="sm:hidden">Streets</span>
          <span className="hidden sm:inline">Practice streets</span>
        </div>
        {STREET_OPTIONS.map((name, s) => {
          const active = streets.has(s);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStreet(s)}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                active
                  ? "bg-blue-600 text-white"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>
      <p className="hidden sm:block text-[11px] text-slate-400 dark:text-slate-500 mt-2">
        Spots are dealt only on the selected streets — changing the selection
        deals a new spot. At least one stays on.
      </p>
    </div>
  );

  if (modelStatus === "loading") {
    return (
      <div className="flex min-h-[calc(100dvh-3rem)] sm:min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-slate-500">Loading GTO strategy model...</div>
      </div>
    );
  }

  if (modelStatus === "unavailable") {
    return (
      <div className="flex min-h-[calc(100dvh-3rem)] sm:min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="max-w-lg text-center space-y-3">
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            Strategy model not available
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The trained model file (
            <code className="font-mono">/models/holdem_strategy.onnx</code>) was
            not found. Train it with{" "}
            <code className="font-mono">solver/scripts/train_holdem.py</code>{" "}
            and export it with{" "}
            <code className="font-mono">solver/scripts/export_onnx.py</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100dvh-3rem)] sm:min-h-[calc(100vh-4rem)] bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-3 sm:px-6 py-3 sm:py-8 max-w-[1400px]">
        {/* On a phone the header nav already marks the page, so the title
            block collapses to nothing and gives its ~70px to the table. */}
        <div className="sm:mb-8 text-center lg:text-left">
          <h1 className="sr-only sm:not-sr-only text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            GTO Trainer
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Play spots against a Deep CFR–solved strategy (100 BB, discretized
            bet sizes).
          </p>
        </div>

        {dealFailed ? (
          <div className="flex min-h-[400px] flex-col items-center justify-center gap-3">
            <div className="text-slate-500 text-sm max-w-md text-center">
              Self-play didn&apos;t reach a decision on the selected streets —
              deep streets are rare when hands end early. Try again or widen the
              selection below.
            </div>
            <button
              type="button"
              onClick={nextSpot}
              className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try again
            </button>
            <div className="w-full max-w-md mt-2">{streetPanel}</div>
          </div>
        ) : !spot || !strategy || dealing ? (
          <div className="flex min-h-[400px] items-center justify-center">
            <div className="text-slate-500">Dealing next spot...</div>
          </div>
        ) : (
          // `contents` dissolves the two columns on a phone so their four
          // panels become direct grid items and `order-*` can interleave them
          // as table -> decision -> recap -> streets, putting the buttons in
          // reach without scrolling past the recap. From `lg` the wrappers
          // become blocks again and the original 8/4 columns are restored.
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-8 items-start">
            <div className="contents lg:block lg:col-span-8 lg:space-y-4">
              <div className="order-1">
                <GtoTable spot={spot} />
              </div>
              <ActionLine lines={spot.lineDescription} className="order-3" />
            </div>

            <div className="contents lg:block lg:col-span-4 lg:space-y-4">
              <div className="order-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm">
                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
                  {userAction === null
                    ? `Your decision (${spot.streetName})`
                    : "GTO"}
                </h2>

                {userAction === null ? (
                  <ActionButtons
                    actions={strategy.map((s) => s.action)}
                    labels={spot.actionLabels}
                    onAction={setUserAction}
                  />
                ) : (
                  <GtoFeedback
                    spot={spot}
                    strategy={strategy}
                    userAction={userAction}
                    ev={ev}
                    evPending={evPending}
                    equity={equity}
                    equityPending={equityPending}
                    onNextSpot={nextSpot}
                  />
                )}
              </div>

              <div className="order-4">{streetPanel}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
