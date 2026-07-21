"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GtoTable from "@/components/gto/GtoTable";
import PnlChart from "@/components/play/PnlChart";
import {
  type History,
  isTerminal,
  legalActions,
  parseHistory,
  terminalReturns,
} from "@/lib/gto/holdem";
import {
  type SpotInfo,
  advanceHand,
  describeSpot,
  handRankName,
  intToCard,
  loadStrategySession,
} from "@/lib/gto/strategy";
import {
  type HandReason,
  type PlaySession,
  freshSession,
  loadSession,
  recordHand,
  resetSession,
  winRateBb100,
} from "@/lib/play/session";
import type { Card } from "@/lib/types";

type ModelStatus = "loading" | "ready" | "unavailable";
type Phase = "dealing" | "hero" | "showdown";

interface Outcome {
  delta: number;
  reason: HandReason;
  villainCards: [Card, Card] | null;
  /** Best-hand category names, shown at showdown when the board is complete. */
  heroRank: string | null;
  villainRank: string | null;
  headline: string;
}

const fmtBB = (n: number) =>
  `${n > 0 ? "+" : ""}${Number.isInteger(n) ? n : n.toFixed(1)}`;

/** Table view at a terminal node, from the hero's perspective. */
function describeTerminal(h: History, heroSeat: number): SpotInfo {
  return { ...describeSpot(h, heroSeat), toCallBB: 0 };
}

function buildOutcome(h: History, heroSeat: number, delta: number): Outcome {
  const s = parseHistory(h);
  const reason: HandReason = s.status === "fold" ? "fold" : "showdown";
  const villainSeat = 1 - heroSeat;
  const villainCards: [Card, Card] | null =
    reason === "showdown"
      ? [
          intToCard(h[2 * villainSeat] as number),
          intToCard(h[2 * villainSeat + 1] as number),
        ]
      : null;

  let heroRank: string | null = null;
  let villainRank: string | null = null;
  if (reason === "showdown") {
    heroRank = handRankName([
      h[2 * heroSeat] as number,
      h[2 * heroSeat + 1] as number,
      ...s.board,
    ]);
    villainRank = handRankName([
      h[2 * villainSeat] as number,
      h[2 * villainSeat + 1] as number,
      ...s.board,
    ]);
  }

  let headline: string;
  if (reason === "fold") {
    headline = s.folder === heroSeat ? "You fold" : "Villain folds";
  } else if (delta > 0) {
    headline = "You win at showdown";
  } else if (delta < 0) {
    headline = "Villain wins at showdown";
  } else {
    headline = "Split pot";
  }
  return { delta, reason, villainCards, heroRank, villainRank, headline };
}

export default function Play() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [history, setHistory] = useState<History>([]);
  const [heroSeat, setHeroSeat] = useState(0);
  const [phase, setPhase] = useState<Phase>("dealing");
  const [spot, setSpot] = useState<SpotInfo | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [session, setSession] = useState<PlaySession>(freshSession);
  const startedRef = useRef(false);

  useEffect(() => {
    loadStrategySession()
      .then(() => setModelStatus("ready"))
      .catch(() => setModelStatus("unavailable"));
  }, []);

  // Client-only load so server and first client render agree (fresh session).
  useEffect(() => {
    setSession(loadSession());
  }, []);

  const settle = useCallback((h: History, seat: number) => {
    const delta = terminalReturns(h)[seat];
    setSpot(describeTerminal(h, seat));
    const result = buildOutcome(h, seat, delta);
    setOutcome(result);
    // PnL accumulates continuously; stacks reload to 100 BB every hand.
    setSession((prev) => recordHand(prev, delta, result.reason));
    setPhase("showdown");
  }, []);

  const dealHand = useCallback(
    async (seat: number) => {
      setPhase("dealing");
      setOutcome(null);
      setSpot(null);
      setHeroSeat(seat);
      const h = await advanceHand([], seat);
      setHistory(h);
      if (isTerminal(h)) {
        settle(h, seat); // e.g. bot folds the SB before the hero ever acts
      } else {
        setSpot(describeSpot(h, seat));
        setPhase("hero");
      }
    },
    [settle],
  );

  useEffect(() => {
    if (modelStatus === "ready" && !startedRef.current) {
      startedRef.current = true;
      dealHand(Math.random() < 0.5 ? 0 : 1);
    }
  }, [modelStatus, dealHand]);

  const onHeroAction = useCallback(
    async (action: string) => {
      setPhase("dealing");
      const seat = heroSeat;
      const next = await advanceHand([...history, action], seat);
      // A brief beat so the bot's response reads as a deliberate action.
      await new Promise((r) => setTimeout(r, 300));
      setHistory(next);
      if (isTerminal(next)) {
        settle(next, seat);
      } else {
        setSpot(describeSpot(next, seat));
        setPhase("hero");
      }
    },
    [history, heroSeat, settle],
  );

  const nextHand = useCallback(() => {
    dealHand(1 - heroSeat); // alternate the button, as in real heads-up
  }, [dealHand, heroSeat]);

  const resetPnl = useCallback(() => {
    setSession(resetSession());
  }, []);

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

  const pnlPositive = session.pnlBB >= 0;
  const result: "hero" | "villain" | "split" | null =
    phase === "showdown" && outcome
      ? outcome.delta > 0
        ? "hero"
        : outcome.delta < 0
          ? "villain"
          : "split"
      : null;

  const sessionPanel = (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm">
      <div className="flex items-baseline justify-between mb-4">
        <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
          Session PnL
        </h2>
        <button
          type="button"
          onClick={resetPnl}
          className="text-xs text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div>
          <div
            className={`text-2xl font-bold tabular-nums ${
              session.handsPlayed === 0
                ? "text-slate-900 dark:text-white"
                : pnlPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-red-600 dark:text-red-400"
            }`}
          >
            {fmtBB(session.pnlBB)}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
            BB
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {session.handsPlayed}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
            Hands
          </div>
        </div>
        <div>
          <div className="text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {session.handsPlayed === 0
              ? "—"
              : Math.round(winRateBb100(session))}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
            bb/100
          </div>
        </div>
      </div>
      <PnlChart results={session.results} pnlBB={session.pnlBB} />
    </div>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-[1400px]">
        <div className="mb-4 sm:mb-8 text-center lg:text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Heads-Up vs. the Bot
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Full hands against the Deep CFR–solved strategy. Both reload to 100
            BB each hand (the depth it was solved for); your PnL accumulates
            locally.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
          <div className="lg:col-span-8 flex flex-col gap-4">
            {spot ? (
              <GtoTable
                spot={spot}
                villainCards={
                  phase === "showdown" ? (outcome?.villainCards ?? null) : null
                }
                heroRank={
                  phase === "showdown" ? (outcome?.heroRank ?? null) : null
                }
                villainRank={
                  phase === "showdown" ? (outcome?.villainRank ?? null) : null
                }
                villainThinking={phase === "dealing"}
                result={result}
              />
            ) : (
              <div className="flex min-h-[400px] sm:min-h-[560px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                <div className="text-slate-500">Dealing...</div>
              </div>
            )}
            {spot && spot.lineDescription.length > 0 && (
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

          <div className="lg:col-span-4 flex flex-col gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              {phase === "hero" && spot ? (
                <>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                    Your decision ({spot.streetName})
                  </h2>
                  <div className="space-y-2">
                    {legalActions(history).map((action) => (
                      <button
                        key={action}
                        type="button"
                        onClick={() => onHeroAction(action)}
                        className="w-full py-2.5 sm:py-3 px-4 bg-slate-100 hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:hover:bg-blue-600 text-slate-900 dark:text-white text-sm sm:text-base font-medium rounded-lg transition-all active:scale-[0.98]"
                      >
                        {spot.actionLabels[action] ?? action}
                      </button>
                    ))}
                  </div>
                </>
              ) : phase === "showdown" && outcome ? (
                <>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">
                    {outcome.headline}
                  </h2>
                  <div
                    className={`text-3xl font-bold tabular-nums mb-4 ${
                      outcome.delta > 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : outcome.delta < 0
                          ? "text-red-600 dark:text-red-400"
                          : "text-slate-500"
                    }`}
                  >
                    {fmtBB(outcome.delta)} BB
                  </div>
                  <button
                    type="button"
                    onClick={nextHand}
                    className="w-full py-2.5 sm:py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base font-medium rounded-lg transition-all active:scale-[0.98]"
                  >
                    Next hand
                  </button>
                </>
              ) : (
                <div className="flex min-h-[120px] items-center justify-center text-sm text-slate-500">
                  <span>Villain is acting</span>
                  <span className="thinking-dots ml-0.5 inline-flex">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </div>
              )}
            </div>

            {sessionPanel}
          </div>
        </div>
      </main>
    </div>
  );
}
