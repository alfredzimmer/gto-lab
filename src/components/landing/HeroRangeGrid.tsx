import grid from "@/lib/gto/landing-grid.json";

/** action token -> validated palette CSS var (see globals.css) */
const ACTION_COLORS: Record<string, string> = {
  f: "var(--gto-fold)",
  c: "var(--gto-call)",
  b0: "var(--gto-raise-half)",
  b1: "var(--gto-raise-pot)",
  a: "var(--gto-allin)",
};

const ACTION_NAMES: Record<string, string> = {
  f: "Fold",
  c: "Call",
  b0: "Raise ½ pot",
  b1: "Raise pot",
  a: "All-in",
};

/**
 * The landing hero's 13x13 matrix, rendered as pure static markup from
 * solver output baked at generation time (src/lib/gto/landing-grid.json,
 * produced by solver/scripts/gen_landing_grid.py). No model load, no JS.
 */
export default function HeroRangeGrid() {
  return (
    <figure className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl shadow-slate-200/60 dark:shadow-black/40 p-4 sm:p-5">
      <figcaption className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          Button opening strategy
        </span>
        <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
          preflop · 100 BB
        </span>
      </figcaption>

      <div
        className="grid gap-px select-none"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
        role="img"
        aria-label="13 by 13 grid of starting hands colored by the solver's mix of fold, call, and raise at the Button's first preflop decision"
      >
        {grid.cells.map((cell) => (
          <div
            key={cell.label}
            className="relative aspect-square rounded-[2px] overflow-hidden"
          >
            <div className="absolute inset-0 flex">
              {cell.probs.map(
                (p, i) =>
                  p > 0.001 && (
                    <div
                      key={grid.actions[i]}
                      style={{
                        width: `${p * 100}%`,
                        background: ACTION_COLORS[grid.actions[i]],
                      }}
                    />
                  ),
              )}
            </div>
            <span
              className="absolute inset-0 hidden min-[400px]:flex items-center justify-center text-[8px] sm:text-[9px] font-bold text-white pointer-events-none"
              style={{
                textShadow:
                  "0 1px 2px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)",
              }}
            >
              {cell.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3">
        {grid.actions.map((a, i) => (
          <span
            key={a}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-400"
          >
            <span
              className="w-2.5 h-2.5 rounded-[2px] inline-block"
              style={{ background: ACTION_COLORS[a] }}
            />
            {ACTION_NAMES[a]}
            <span className="font-mono text-slate-400 dark:text-slate-500">
              {(grid.aggregate[i] * 100).toFixed(0)}%
            </span>
          </span>
        ))}
      </div>

      {/*<p className="mt-3 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
        Unedited output of the shipped model, baked at generation time — the
        same network answers live in the{" "}
        <span className="text-slate-500 dark:text-slate-400">
          GTO Ranges
        </span>
        .
      </p>*/}
    </figure>
  );
}
