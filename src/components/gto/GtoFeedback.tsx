import type { EvReport } from "@/lib/gto/ev";
import {
  type ActionProb,
  type SpotInfo,
  breakEvenEquity,
} from "@/lib/gto/strategy";

interface GtoFeedbackProps {
  spot: SpotInfo;
  strategy: ActionProb[];
  userAction: string;
  /** Per-action EV rollout for this spot, or null if not (yet) known. */
  ev: EvReport | null;
  /** True while the EV rollout is still running. */
  evPending: boolean;
  /** Hero's showdown equity vs the villain's range, or null if not (yet) known. */
  equity: number | null;
  /** True while the equity estimate is being computed. */
  equityPending: boolean;
  onNextSpot: () => void;
}

/**
 * Grade a decision by the chips it gives up, not by how often the solver
 * plays it: in a mixed equilibrium every action in the support is worth the
 * same, so frequency says nothing about cost. Thresholds are a share of the
 * pot rather than absolute BB, so a verdict means the same thing in a 4 BB
 * preflop pot as in a 60 BB river pot. Below two standard errors the rollout
 * genuinely cannot separate the action from the mix, and saying so beats
 * inventing a leak out of Monte-Carlo noise.
 *
 * `potBB` is both players' contributions, so it is always at least the blinds
 * at a real decision node — no zero-pot guard, and a caller that passes one
 * anyway gets the loud answer rather than a silent "Solid".
 */
export function verdict(lossBB: number, lossSeBB: number, potBB: number) {
  const share = lossBB / potBB;
  if (lossBB <= 2 * lossSeBB || share < 0.01) {
    return {
      label: "Solid",
      detail: "Gives up nothing measurable against the solver's mix.",
      className:
        "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-800",
    };
  }
  if (share < 0.05) {
    return {
      label: "Slight leak",
      detail: "Marginally -EV — the solver's mix does a little better here.",
      className:
        "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800",
    };
  }
  if (share < 0.15) {
    return {
      label: "Leak",
      detail: "Costs a real slice of the pot every time you take this line.",
      className:
        "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    };
  }
  return {
    label: "Big mistake",
    detail: "Burns a large fraction of the pot versus the equilibrium.",
    className:
      "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800",
  };
}

/** Signed BB, e.g. "+1.24" / "−3.00" (U+2212 so digits stay aligned). */
function fmtBB(bb: number): string {
  return `${bb >= 0 ? "+" : "−"}${Math.abs(bb).toFixed(2)}`;
}

export default function GtoFeedback({
  spot,
  strategy,
  userAction,
  ev,
  evPending,
  equity,
  equityPending,
  onNextSpot,
}: GtoFeedbackProps) {
  const sorted = [...strategy].sort((a, b) => b.probability - a.probability);
  const evByAction = new Map(ev?.actions.map((a) => [a.action, a]) ?? []);
  const userEv = evByAction.get(userAction);
  const v = userEv ? verdict(userEv.lossBB, userEv.lossSeBB, spot.potBB) : null;

  const requiredEquity =
    spot.toCallBB > 0 ? breakEvenEquity(spot.potBB, spot.toCallBB) : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      {v && userEv ? (
        <div className={`px-3 py-2 sm:p-3 rounded-lg border ${v.className}`}>
          <div className="flex items-baseline justify-between gap-2">
            <div className="font-semibold text-sm sm:text-base">{v.label}</div>
            {/* The headline number is what the decision cost, not how often
                the solver plays it. Carrying the ± keeps the rollout's own
                Monte-Carlo error visible instead of implying false precision. */}
            <div className="font-mono tabular-nums text-xs sm:text-sm whitespace-nowrap">
              {fmtBB(-userEv.lossBB)} ± {userEv.lossSeBB.toFixed(2)} BB
            </div>
          </div>
          <div className="text-[11px] sm:text-sm mt-0.5 leading-snug">
            {v.detail}
          </div>
        </div>
      ) : evPending ? (
        <div className="px-3 py-2 sm:p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="font-semibold text-sm sm:text-base text-slate-500 dark:text-slate-400">
            Scoring your decision…
          </div>
          <div className="text-[11px] sm:text-sm mt-0.5 leading-snug text-slate-400 dark:text-slate-500">
            Rolling the hand out against the villain&apos;s range.
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 sm:p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="text-[11px] sm:text-sm leading-snug text-slate-400 dark:text-slate-500">
            EV estimate unavailable for this spot — the solver frequencies below
            still apply.
          </div>
        </div>
      )}

      <div>
        <h3 className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5 sm:mb-2">
          {ev ? "EV (BB) and GTO frequency" : "GTO frequencies at this spot"}
        </h3>
        <div className="space-y-1.5 sm:space-y-2">
          {sorted.map(({ action, probability }) => {
            const rowEv = evByAction.get(action);
            return (
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
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white whitespace-nowrap">
                    {rowEv && (
                      <span className="text-slate-400 dark:text-slate-500 mr-2">
                        {fmtBB(rowEv.evBB)}
                      </span>
                    )}
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
            );
          })}
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
