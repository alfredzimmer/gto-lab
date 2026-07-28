"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ActionButtons from "@/components/gto/ActionButtons";
import ActionLine from "@/components/gto/ActionLine";
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
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-6 shadow-sm">
      <div className="flex items-baseline justify-between mb-2 sm:mb-4">
        <h2 className="text-xs sm:text-sm font-medium text-slate-400 uppercase tracking-wider">
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
      <div className="grid grid-cols-3 gap-2 mb-2 sm:mb-4">
        <div>
          <div
            className={`text-xl sm:text-2xl font-bold tabular-nums ${
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
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {session.handsPlayed}
          </div>
          <div className="text-[10px] text-slate-400 uppercase tracking-wider">
            Hands
          </div>
        </div>
        <div>
          <div className="text-xl sm:text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
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
    <div className="min-h-[calc(100dvh-3rem)] sm:min-h-[calc(100vh-4rem)] bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-3 sm:px-6 py-3 sm:py-8 max-w-[1400px]">
        {/* On a phone the header nav already marks the page, so the title
            block collapses to nothing and gives its ~70px to the table. */}
        <div className="sm:mb-8 text-center lg:text-left">
          <h1 className="sr-only sm:not-sr-only text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Heads-Up vs. the Bot
          </h1>
          <p className="hidden sm:block text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Full hands against the Deep CFR–solved strategy. Both reload to 100
            BB each hand (the depth it was solved for); your PnL accumulates
            locally.
          </p>
        </div>

        {/* `contents` dissolves the two columns on a phone so their four
            panels become direct grid items and `order-*` can interleave them
            as table -> decision -> recap -> session, putting the buttons in
            reach without scrolling past the recap. From `lg` the wrappers
            become blocks again and the original 8/4 columns are restored. */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:gap-8 items-start">
          <div className="contents lg:block lg:col-span-8 lg:space-y-4">
            <div className="order-1">
              {spot ? (
                <GtoTable
                  spot={spot}
                  villainCards={
                    phase === "showdown"
                      ? (outcome?.villainCards ?? null)
                      : null
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
                <div className="flex min-h-[280px] sm:min-h-[560px] items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                  <div className="text-slate-500">Dealing...</div>
                </div>
              )}
            </div>
            {spot && (
              <ActionLine lines={spot.lineDescription} className="order-3" />
            )}
          </div>

          <div className="contents lg:block lg:col-span-4 lg:space-y-4">
            <div className="order-2 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 shadow-sm">
              {phase === "hero" && spot ? (
                <>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-3 sm:mb-4">
                    Your decision ({spot.streetName})
                  </h2>
                  <ActionButtons
                    actions={legalActions(history)}
                    labels={spot.actionLabels}
                    onAction={onHeroAction}
                  />
                </>
              ) : phase === "showdown" && outcome ? (
                <>
                  <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white mb-1">
                    {outcome.headline}
                  </h2>
                  <div
                    className={`text-2xl sm:text-3xl font-bold tabular-nums mb-3 sm:mb-4 ${
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
                <div className="flex min-h-[64px] sm:min-h-[120px] items-center justify-center text-sm text-slate-500">
                  <span>Villain is acting</span>
                  <span className="thinking-dots ml-0.5 inline-flex">
                    <span>.</span>
                    <span>.</span>
                    <span>.</span>
                  </span>
                </div>
              )}
            </div>

            <div className="order-4">{sessionPanel}</div>
          </div>
        </div>
      </main>
    </div>
  );
}
