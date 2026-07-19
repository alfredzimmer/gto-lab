"use client";

import { useState } from "react";
import type { RangeCell, RangeGrid as RangeGridData } from "@/lib/gto/ranges";

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
  c: "Check / Call",
  b0: "Bet/Raise ½ pot",
  b1: "Bet/Raise pot",
  a: "All-in",
};

interface RangeGridProps {
  grid: RangeGridData;
}

function CellFill({ cell, actions }: { cell: RangeCell; actions: string[] }) {
  if (!cell.probs) {
    return (
      <div
        className="absolute inset-0"
        style={{ background: "var(--gto-blocked)" }}
      />
    );
  }
  return (
    <div className="absolute inset-0 flex" style={{ gap: "1px" }}>
      {cell.probs.map((p, i) =>
        p > 0.001 ? (
          <div
            key={actions[i]}
            style={{
              width: `${p * 100}%`,
              background: ACTION_COLORS[actions[i]],
            }}
          />
        ) : null,
      )}
    </div>
  );
}

export default function RangeGrid({ grid }: RangeGridProps) {
  const [focus, setFocus] = useState<RangeCell | null>(null);
  // Cells arrive in row-major order (13 x 13, A -> 2 on both axes).
  const detail = focus ?? grid.cells.find((c) => c.label === "AA") ?? null;

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      <div className="flex-1 min-w-0">
        <div
          className="grid gap-[2px] select-none"
          style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
          onMouseLeave={() => setFocus(null)}
        >
          {grid.cells.map((cell) => (
            <button
              key={cell.label}
              type="button"
              onMouseEnter={() => setFocus(cell)}
              onFocus={() => setFocus(cell)}
              onClick={() => setFocus(cell)}
              className="relative aspect-square rounded-[3px] overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-blue-500 cursor-crosshair"
              style={{ containerType: "inline-size" }}
              aria-label={cell.label}
            >
              <CellFill cell={cell} actions={grid.actions} />
              <span
                className="absolute inset-0 flex items-center justify-center font-bold text-white pointer-events-none"
                style={{
                  fontSize: "clamp(8px, 34cqw, 26px)",
                  textShadow:
                    "0 1px 3px rgba(0,0,0,0.85), 0 0 2px rgba(0,0,0,0.9)",
                }}
              >
                {cell.label}
              </span>
            </button>
          ))}
        </div>

        {/* Legend — identity is never color-alone */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3">
          {grid.actions.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400"
            >
              <span
                className="w-3 h-3 rounded-[2px] inline-block"
                style={{ background: ACTION_COLORS[a] }}
              />
              {ACTION_NAMES[a]}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
            <span
              className="w-3 h-3 rounded-[2px] inline-block"
              style={{ background: "var(--gto-blocked)" }}
            />
            Blocked by board
          </span>
        </div>
      </div>

      {/* Hover / tap detail panel — the tooltip layer plus table view */}
      <div className="lg:w-56 shrink-0">
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-100 dark:border-slate-800 p-3 sticky top-20">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">
            Range total
          </div>
          <div
            className="h-3 flex rounded-full overflow-hidden mb-1"
            style={{ gap: "1px" }}
          >
            {grid.aggregate.map((p, i) =>
              p > 0.001 ? (
                <div
                  key={grid.actions[i]}
                  style={{
                    width: `${p * 100}%`,
                    background: ACTION_COLORS[grid.actions[i]],
                  }}
                />
              ) : null,
            )}
          </div>
          <table className="w-full text-xs mb-3">
            <tbody>
              {grid.actions.map((a, i) => (
                <tr key={a}>
                  <td className="py-0.5 text-slate-600 dark:text-slate-400">
                    <span
                      className="w-2 h-2 rounded-[2px] inline-block mr-1.5"
                      style={{ background: ACTION_COLORS[a] }}
                    />
                    {ACTION_NAMES[a]}
                  </td>
                  <td className="py-0.5 text-right font-mono text-slate-900 dark:text-white">
                    {(grid.aggregate[i] * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {detail && (
            <>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
                {detail.label}
                <span className="ml-2 normal-case font-normal">
                  {detail.combos} combo{detail.combos === 1 ? "" : "s"}
                </span>
              </div>
              {detail.probs ? (
                <table className="w-full text-xs">
                  <tbody>
                    {grid.actions.map((a, i) => (
                      <tr key={a}>
                        <td className="py-0.5 text-slate-600 dark:text-slate-400">
                          <span
                            className="w-2 h-2 rounded-[2px] inline-block mr-1.5"
                            style={{ background: ACTION_COLORS[a] }}
                          />
                          {ACTION_NAMES[a]}
                        </td>
                        <td className="py-0.5 text-right font-mono text-slate-900 dark:text-white">
                          {((detail.probs?.[i] ?? 0) * 100).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-xs text-slate-500">
                  No live combos — all blocked by the board.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
