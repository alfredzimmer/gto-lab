import type { PracticeState } from "@/app/actions/practice";

interface DecisionControlsProps {
  gameState: PracticeState;
  onDecision: (decision: "call" | "fold") => void;
}

export default function DecisionControls({
  gameState,
  onDecision,
}: DecisionControlsProps) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs sm:text-sm text-slate-500">
            Amount to Call
          </span>
          <span className="font-mono text-sm sm:text-base font-medium text-slate-900 dark:text-white">
            ${gameState.bet}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs sm:text-sm text-slate-500">
            Total Pot if Called
          </span>
          <span className="font-mono text-sm sm:text-base font-medium text-slate-900 dark:text-white">
            ${gameState.pot + gameState.bet * 2}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => onDecision("fold")}
          className="py-2.5 sm:py-3 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-900 dark:text-white text-sm sm:text-base font-medium rounded-lg transition-colors"
        >
          Fold
        </button>
        <button
          type="button"
          onClick={() => onDecision("call")}
          className="py-2.5 sm:py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base font-medium rounded-lg transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
        >
          Call
        </button>
      </div>
    </div>
  );
}
