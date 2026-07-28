"use client";

/**
 * Splits a spot label like `Raise to 12 BB (½ pot)` into the amount that
 * matters ("Raise to 12 BB") and the sizing hint ("½ pot"), so the hint can
 * ride on a second, quieter line. That keeps the button legible at half
 * width, which is what lets the action list sit two-up on a phone instead
 * of eating six full-width rows.
 */
export function splitActionLabel(label: string): {
  main: string;
  hint: string | null;
} {
  const m = /^(.*?)\s*\(([^)]*)\)$/.exec(label);
  return m ? { main: m[1], hint: m[2] } : { main: label, hint: null };
}

interface ActionButtonsProps {
  actions: string[];
  labels: Record<string, string>;
  onAction: (action: string) => void;
  /**
   * `stack` fills a narrow side panel (one per row from `sm` up); `inline`
   * wraps them in a single row, for a full-width toolbar. Both are a
   * two-column grid on a phone.
   */
  layout?: "stack" | "inline";
  /** Extra per-action annotation, e.g. the solved frequency on /ranges. */
  suffix?: (action: string, index: number) => React.ReactNode;
}

export default function ActionButtons({
  actions,
  labels,
  onAction,
  layout = "stack",
  suffix,
}: ActionButtonsProps) {
  // With an odd count the passive action (fold/check, always first) takes the
  // full row so the aggressive sizes stay paired and no cell is left empty.
  const oddFirst = actions.length % 2 === 1;

  return (
    <div
      className={`grid grid-cols-2 gap-2 ${
        layout === "stack" ? "sm:grid-cols-1" : "sm:flex sm:flex-wrap"
      }`}
    >
      {actions.map((action, i) => {
        const { main, hint } = splitActionLabel(labels[action] ?? action);
        const extra = suffix?.(action, i);
        return (
          <button
            key={action}
            type="button"
            onClick={() => onAction(action)}
            className={`flex flex-col sm:flex-row items-center justify-center gap-x-1.5 leading-tight
              py-2 px-2 sm:px-4 rounded-lg transition-all active:scale-[0.98]
              ${layout === "stack" ? "sm:py-3" : ""}
              bg-slate-100 hover:bg-blue-600 hover:text-white
              dark:bg-slate-800 dark:hover:bg-blue-600 text-slate-900 dark:text-white
              ${oddFirst && i === 0 ? "col-span-2 sm:col-span-1" : ""}`}
          >
            <span
              className={`font-medium ${
                layout === "stack"
                  ? "text-[13px] sm:text-base"
                  : "text-[13px] sm:text-sm"
              }`}
            >
              {main}
            </span>
            {(hint || extra) && (
              <span className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                {hint && <span className="opacity-60">{hint}</span>}
                {extra}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
