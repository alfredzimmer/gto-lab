interface ResultFeedbackProps {
  result: {
    correct: boolean;
    equity: number;
    potOdds: number;
    ev: number;
    message: string;
  };
  onNextHand: () => void;
}

export default function ResultFeedback({
  result,
  onNextHand,
}: ResultFeedbackProps) {
  return (
    <div className="space-y-4 sm:space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div
        className={`p-3 sm:p-4 rounded-lg border ${
          result.correct
            ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-900 dark:text-green-300"
            : "bg-red-50 border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-900 dark:text-red-300"
        }`}
      >
        <div className="font-bold text-base sm:text-lg mb-1">
          {result.message}
        </div>
        <div className="text-xs sm:text-sm opacity-90">
          {result.ev > 0 ? "Call was +EV" : "Fold was +EV"}
        </div>
      </div>

      <div className="space-y-2 sm:space-y-3">
        <div className="flex justify-between items-center p-2 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <span className="text-xs sm:text-sm text-slate-500">Your Equity</span>
          <span className="font-mono text-sm sm:text-base font-medium text-slate-900 dark:text-white">
            {result.equity.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between items-center p-2 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <span className="text-xs sm:text-sm text-slate-500">Pot Odds</span>
          <span className="font-mono text-sm sm:text-base font-medium text-slate-900 dark:text-white">
            {result.potOdds.toFixed(1)}%
          </span>
        </div>
        <div className="flex justify-between items-center p-2 sm:p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <span className="text-xs sm:text-sm text-slate-500">
            Expected Value
          </span>
          <span
            className={`font-mono text-sm sm:text-base font-medium ${result.ev > 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}
          >
            {result.ev > 0 ? "+" : ""}
            {result.ev.toFixed(2)}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onNextHand}
        className="w-full py-2.5 sm:py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 text-sm sm:text-base font-medium rounded-lg transition-colors"
      >
        Next Hand
      </button>
    </div>
  );
}
