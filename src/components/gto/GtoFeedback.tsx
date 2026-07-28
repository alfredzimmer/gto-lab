import {
  type ActionProb,
  type SpotInfo,
  breakEvenEquity,
} from "@/lib/gto/strategy";

interface GtoFeedbackProps {
  spot: SpotInfo;
  strategy: ActionProb[];
  userAction: string;
  /** Hero's showdown equity vs the villain's range, or null if not (yet) known. */
  equity: number | null;
  /** True while the equity estimate is being computed. */
  equityPending: boolean;
  onNextSpot: () => void;
}

export function verdict(userProb: number, bestProb: number) {
  if (userProb >= bestProb * 0.9 || userProb >= 0.33) {
    return {
      label: "Solid",
      detail: "This is a primary GTO action in this spot.",
      className:
        "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    };
  }
  if (userProb >= 0.15) {
    return {
      label: "Part of the mix",
      detail: "GTO plays this at a meaningful frequency, but not most often.",
      className:
        "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    };
  }
  if (userProb >= 0.05) {
    return {
      label: "Marginal",
      detail: "GTO takes this line only rarely here.",
      className:
        "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    };
  }
  return {
    label: "Mistake",
    detail: "The equilibrium strategy (almost) never takes this action here.",
    className:
      "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  };
}

export default function GtoFeedback({
  spot,
  strategy,
  userAction,
  equity,
  equityPending,
  onNextSpot,
}: GtoFeedbackProps) {
  const sorted = [...strategy].sort((a, b) => b.probability - a.probability);
  const bestProb = sorted[0].probability;
  const userProb =
    strategy.find((s) => s.action === userAction)?.probability ?? 0;
  const v = verdict(userProb, bestProb);

  const requiredEquity =
    spot.toCallBB > 0 ? breakEvenEquity(spot.potBB, spot.toCallBB) : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className={`px-3 py-2 sm:p-3 rounded-lg border ${v.className}`}>
        <div className="font-semibold text-sm sm:text-base">{v.label}</div>
        <div className="text-[11px] sm:text-sm mt-0.5 leading-snug">
          {v.detail}
        </div>
      </div>

      <div>
        <h3 className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">
          GTO frequencies at this spot
        </h3>
        <div className="space-y-1.5 sm:space-y-2">
          {sorted.map(({ action, probability }) => (
            <div key={action}>
              <div className="flex justify-between gap-2 text-[11px] sm:text-sm mb-0.5">
                <span
                  className={
                    action === userAction
                      ? "font-semibold text-slate-900 dark:text-white"
                      : "text-slate-600 dark:text-slate-400"
                  }
                >
                  {spot.actionLabels[action] ?? action}
                  {action === userAction && " ← you"}
                </span>
                <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                  {(probability * 100).toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 sm:h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${
                    action === userAction
                      ? "bg-blue-600"
                      : "bg-slate-300 dark:bg-slate-600"
                  }`}
                  style={{ width: `${Math.max(probability * 100, 1)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two stats side by side rather than two sentences: the comparison is
          the point, and it costs one line instead of three. */}
      {requiredEquity !== null && (
        <div className="grid grid-cols-2 gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800">
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Pot odds
            </div>
            <div className="font-mono tabular-nums text-sm sm:text-base text-slate-900 dark:text-white">
              {(requiredEquity * 100).toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">
              Your equity
            </div>
            {equityPending ? (
              <div className="text-xs text-slate-400 dark:text-slate-500 py-0.5">
                Estimating…
              </div>
            ) : equity !== null ? (
              <div
                className={`font-mono tabular-nums font-semibold text-sm sm:text-base ${
                  equity >= requiredEquity
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {(equity * 100).toFixed(1)}%
              </div>
            ) : (
              <div className="font-mono text-sm sm:text-base text-slate-400">
                —
              </div>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={onNextSpot}
        className="w-full py-2.5 sm:py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm sm:text-base font-medium rounded-lg transition-colors shadow-sm shadow-blue-200 dark:shadow-none"
      >
        Next Spot
      </button>
    </div>
  );
}
