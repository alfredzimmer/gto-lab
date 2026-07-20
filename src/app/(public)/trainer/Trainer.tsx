"use client";

import { useCallback, useEffect, useState } from "react";
import GtoFeedback from "@/components/gto/GtoFeedback";
import GtoTable from "@/components/gto/GtoTable";
import {
  type ActionProb,
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
  const [dealing, setDealing] = useState(false);
  const [dealFailed, setDealFailed] = useState(false);
  const [streets, setStreets] = useState<Set<number>>(
    () => new Set([1, 2, 3]), // preflop off by default
  );

  useEffect(() => {
    loadStrategySession()
      .then(() => setModelStatus("ready"))
      .catch(() => setModelStatus("unavailable"));
  }, []);

  const nextSpot = useCallback(async () => {
    setDealing(true);
    setUserAction(null);
    setDealFailed(false);
    try {
      const sc = await generateScenario(streets);
      setSpot(describeSpot(sc.history, sc.heroSeat));
      setStrategy(await getStrategy(sc.history));
    } catch {
      setSpot(null);
      setDealFailed(true);
    } finally {
      setDealing(false);
    }
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

  const streetPanel = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
      <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
        Practice streets
      </div>
      <div className="flex flex-wrap gap-2">
        {STREET_OPTIONS.map((name, s) => {
          const active = streets.has(s);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={active}
              onClick={() => toggleStreet(s)}
              className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
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
      <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-2">
        Spots are dealt only on the selected streets — changing the selection
        deals a new spot. At least one stays on.
      </p>
    </div>
  );

  if (modelStatus === "loading") {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-slate-500">Loading GTO strategy model...</div>
      </div>
    );
  }

  if (modelStatus === "unavailable") {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
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
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-[1400px]">
        <div className="mb-4 sm:mb-8 text-center lg:text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            GTO Trainer — Heads-Up
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
            <div className="lg:col-span-8 flex flex-col gap-4">
              <GtoTable spot={spot} />
              {spot.lineDescription.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs sm:text-sm text-slate-600 dark:text-slate-400 space-y-1">
                  <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Action so far
                  </div>
                  {spot.lineDescription.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              )}
            </div>

            <div className="lg:col-span-4">
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                  {userAction === null
                    ? `Your decision (${spot.streetName})`
                    : "GTO"}
                </h2>

                {userAction === null ? (
                  <div className="space-y-2">
                    {strategy.map(({ action }) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => setUserAction(action)}
                        className="w-full py-2.5 sm:py-3 px-4 bg-slate-100 hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:hover:bg-blue-600 text-slate-900 dark:text-white text-sm sm:text-base font-medium rounded-lg transition-colors"
                      >
                        {spot.actionLabels[action] ?? action}
                      </button>
                    ))}
                  </div>
                ) : (
                  <GtoFeedback
                    spot={spot}
                    strategy={strategy}
                    userAction={userAction}
                    onNextSpot={nextSpot}
                  />
                )}
              </div>

              <div className="mt-4">{streetPanel}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
