"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import {
  generatePracticeHand,
  savePracticeResult,
  type PracticeState,
  type PracticeSettings,
} from "@/app/actions/practice";
import { calculateHandStrength } from "@/lib/calculator";
import PracticeTable from "@/components/practice/PracticeTable";
import DecisionControls from "@/components/practice/DecisionControls";
import ResultFeedback from "@/components/practice/ResultFeedback";
import PracticeSettingsPanel from "@/components/practice/PracticeSettingsPanel";

export default function PracticePage() {
  const [gameState, setGameState] = useState<PracticeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<PracticeSettings>({
    minOpponents: 1,
    maxOpponents: 2,
    difficulty: "medium",
  });
  const [result, setResult] = useState<{
    correct: boolean;
    equity: number;
    potOdds: number;
    ev: number;
    message: string;
  } | null>(null);
  const [_, startTransition] = useTransition();

  const startNewHand = useCallback(() => {
    setLoading(true);
    setResult(null);
    startTransition(async () => {
      const newState = await generatePracticeHand(settings);
      setGameState(newState);
      setLoading(false);
    });
  }, [settings]);

  useEffect(() => {
    startNewHand();
  }, [startNewHand]);

  const handleDecision = (decision: "call" | "fold") => {
    if (!gameState) return;

    const { heroHand, board, pot, bet, opponentCount } = gameState;

    const { winPercentage, tiePercentage } = calculateHandStrength(
      heroHand,
      board,
      opponentCount,
      100000, // As most users would likely think for a while before making their call
    );

    const equity = (winPercentage + tiePercentage / 2) / 100;

    // Pot Odds = Amount to Call / (Total Pot + Amount to Call)
    // Total Pot = Current Pot + Villain Bet + Hero Call
    const callAmount = bet;
    const totalPotAfterCall = pot + opponentCount * bet;
    const potOdds = callAmount / totalPotAfterCall;

    // EV = (Equity * TotalPotAfterCall) - CallAmount
    // If EV > 0, Call is correct.
    const ev = equity * totalPotAfterCall - callAmount;

    const shouldCall = ev > 0;
    const isCorrect =
      (decision === "call" && shouldCall) ||
      (decision === "fold" && !shouldCall);

    const resultData = {
      correct: isCorrect,
      equity: equity * 100,
      potOdds: potOdds * 100,
      ev,
      message: isCorrect ? "Correct!" : "Incorrect.",
    };

    setResult(resultData);

    savePracticeResult(gameState, decision, {
      equity: resultData.equity,
      ev: resultData.ev,
      correct: resultData.correct,
    }).then((res) => {
      if (res.success) {
        console.log("Practice result saved to DB");
      } else {
        console.error("Failed to save practice result:", res.error);
      }
    });
  };

  if (loading || !gameState) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="text-slate-500">Loading practice hand...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-4 sm:px-6 py-4 sm:py-8 max-w-[1400px]">
        <div className="mb-4 sm:mb-8 text-center lg:text-left">
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            Equity Practice
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Make the right decision based on pot odds and equity.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-8">
          <div className="lg:col-span-8 flex flex-col gap-4 sm:gap-8">
            <PracticeTable gameState={gameState} revealHands={!!result} />
          </div>

          <div className="lg:col-span-4 flex flex-col gap-4 sm:gap-6">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Your Decision
              </h2>

              {!result ? (
                <DecisionControls
                  gameState={gameState}
                  onDecision={handleDecision}
                />
              ) : (
                <ResultFeedback result={result} onNextHand={startNewHand} />
              )}
            </div>

            <PracticeSettingsPanel
              settings={settings}
              setSettings={setSettings}
              onApply={startNewHand}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
