"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import BoardSelector from "@/components/gto/BoardSelector";
import RangeGrid from "@/components/gto/RangeGrid";
import {
  type HistoryToken,
  aggressiveAmounts,
  isChance,
  isTerminal,
  legalActions,
  parseHistory,
} from "@/lib/gto/holdem";
import {
  type RangeGrid as RangeGridData,
  boardCardsOf,
  computeRangeGrid,
  navigationHistory,
  nodeSummary,
} from "@/lib/gto/ranges";
import { ACTION_INDEX } from "@/lib/gto/holdem";
import {
  intToCard,
  loadStrategySession,
  runStrategyBatch,
} from "@/lib/gto/strategy";

const SUIT_SYMBOLS: Record<string, string> = {
  clubs: "♣",
  diamonds: "♦",
  hearts: "♥",
  spades: "♠",
};

function cardText(c: number) {
  const card = intToCard(c);
  return `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}

function isRedSuit(c: number) {
  const s = intToCard(c).suit;
  return s === "hearts" || s === "diamonds";
}

/** Button labels at the current node, mirroring the trainer's wording. */
function actionLabelsFor(tokens: HistoryToken[]): Record<string, string> {
  const s = parseHistory(navigationHistory(tokens));
  const p = s.toAct;
  const toCall = (s.streetContrib[1 - p] - s.streetContrib[p]) / 2;
  const labels: Record<string, string> = {
    f: "Fold",
    c: toCall > 0 ? `Call ${toCall} BB` : "Check",
  };
  for (const [token, amount] of Object.entries(aggressiveAmounts(s))) {
    const verb = toCall > 0 ? "Raise to" : "Bet";
    labels[token] =
      token === "a"
        ? `All-in (${(amount - s.streetContrib[p]) / 2} BB)`
        : `${verb} ${amount / 2} BB (${token === "b0" ? "½ pot" : token === "b1" ? "pot" : "2× pot"})`;
  }
  return labels;
}

const STREET_NAMES = ["Preflop", "Flop", "Turn", "River"];
const SEAT_NAMES = ["Button / SB", "Big Blind"];

type ModelStatus = "loading" | "ready" | "unavailable";

export default function RangeExplorer() {
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const [tokens, setTokens] = useState<HistoryToken[]>([]);
  const [grid, setGrid] = useState<RangeGridData | null>(null);
  const [computing, setComputing] = useState(false);
  const [selectingBoard, setSelectingBoard] = useState(false);

  useEffect(() => {
    loadStrategySession()
      .then(() => setModelStatus("ready"))
      .catch(() => setModelStatus("unavailable"));
  }, []);

  const nav = useMemo(() => navigationHistory(tokens), [tokens]);
  const atChance = isChance(nav);
  const atTerminal = isTerminal(nav);
  const summary = useMemo(() => nodeSummary(tokens), [tokens]);
  const labels = useMemo(
    () => (!atChance && !atTerminal ? actionLabelsFor(tokens) : {}),
    [tokens, atChance, atTerminal],
  );
  const board = boardCardsOf(tokens);

  useEffect(() => {
    if (modelStatus !== "ready" || atChance || atTerminal) {
      setGrid(null);
      return;
    }
    let cancelled = false;
    setComputing(true);
    computeRangeGrid(tokens, runStrategyBatch, ACTION_INDEX)
      .then((g) => {
        if (!cancelled) setGrid(g);
      })
      .finally(() => {
        if (!cancelled) setComputing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tokens, modelStatus, atChance, atTerminal]);

  const takeAction = useCallback((a: string) => {
    setTokens((t) => [...t, a]);
  }, []);

  const confirmBoard = useCallback((cards: number[]) => {
    setTokens((t) => [...t, ...cards]);
    setSelectingBoard(false);
  }, []);

  const undo = useCallback(() => {
    setTokens((t) => {
      if (t.length === 0) return t;
      let cut = t.length - 1;
      if (typeof t[cut] === "number") {
        // Board cards were dealt as a group; remove the whole street deal.
        while (cut > 0 && typeof t[cut - 1] === "number") cut--;
      }
      return t.slice(0, cut);
    });
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
            Train and export it first — see the{" "}
            <code className="font-mono">README</code> in{" "}
            <code className="font-mono">solver/</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-[1500px]">
        <div className="mb-4 sm:mb-6 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              GTO Ranges
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Walk the action tree; the grid shows the solved strategy for every
              starting hand of the player to act.
            </p>
          </div>
        </div>

        {/* Node header: street, pot, board, line breadcrumb */}
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-semibold text-slate-900 dark:text-white">
            {STREET_NAMES[summary.street]}
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Pot <span className="font-mono">{summary.potBB} BB</span>
          </span>
          {board.length > 0 && (
            <span className="text-slate-600 dark:text-slate-400 inline-flex items-center gap-1">
              Board:
              {board.map((c) => (
                <span
                  key={c}
                  className={`font-mono font-semibold ${
                    isRedSuit(c)
                      ? "text-red-600 dark:text-red-400"
                      : "text-slate-900 dark:text-white"
                  }`}
                >
                  {cardText(c)}
                </span>
              ))}
            </span>
          )}
          {!atChance && !atTerminal && (
            <span className="text-slate-600 dark:text-slate-400">
              <span className="font-semibold text-slate-900 dark:text-white">
                {SEAT_NAMES[summary.actingSeat]}
              </span>{" "}
              to act
              {summary.toCallBB > 0 && (
                <>
                  {" "}
                  · <span className="font-mono">{summary.toCallBB} BB</span> to
                  call
                </>
              )}
            </span>
          )}
          <span className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={undo}
              disabled={tokens.length === 0}
              className="px-3 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={() => setTokens([])}
              disabled={tokens.length === 0}
              className="px-3 py-1 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Reset
            </button>
          </span>
        </div>

        {/* Decision buttons / chance / terminal */}
        <div className="mb-4 flex flex-wrap gap-2">
          {atTerminal ? (
            <span className="text-sm text-slate-500 dark:text-slate-400 py-2">
              Hand over — use Undo to step back.
            </span>
          ) : atChance ? (
            <button
              type="button"
              onClick={() => setSelectingBoard(true)}
              className="py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Select {STREET_NAMES[summary.street]}…
            </button>
          ) : (
            legalActions(nav).map((a, i) => (
              <button
                key={a}
                type="button"
                onClick={() => takeAction(a)}
                className="py-2 px-4 bg-slate-100 hover:bg-blue-600 hover:text-white dark:bg-slate-800 dark:hover:bg-blue-600 text-slate-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
              >
                {labels[a] ?? a}
                {grid && (
                  <span className="ml-2 font-mono text-xs opacity-70">
                    {(grid.aggregate[i] * 100).toFixed(0)}%
                  </span>
                )}
              </button>
            ))
          )}
        </div>

        {computing && (
          <div className="text-sm text-slate-500 py-8 text-center">
            Evaluating 1,326 combos…
          </div>
        )}
        {grid && !computing && <RangeGrid grid={grid} />}

        {selectingBoard && atChance && (
          <BoardSelector
            streetName={STREET_NAMES[summary.street]}
            count={board.length === 0 ? 3 : 1}
            usedCards={board}
            onConfirm={confirmBoard}
            onClose={() => setSelectingBoard(false)}
          />
        )}
      </main>
    </div>
  );
}
