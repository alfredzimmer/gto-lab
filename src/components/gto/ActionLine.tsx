import type { SpotInfo } from "@/lib/gto/strategy";

/**
 * The hand's action so far, one line per street. On a phone the section
 * label is dropped — each line already opens with its street name — and the
 * type tightens, so the recap costs a couple of lines rather than a block.
 */
export default function ActionLine({
  lines,
  className = "",
}: {
  lines: SpotInfo["lineDescription"];
  /** Placement classes — the component is its own grid cell, so an empty
      line list leaves no gap behind. */
  className?: string;
}) {
  if (lines.length === 0) return null;

  return (
    <div
      className={`${className} bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 px-3 py-2 sm:p-4 text-[11px] sm:text-sm text-slate-600 dark:text-slate-400 space-y-0.5 sm:space-y-1`}
    >
      <div className="hidden sm:block text-xs font-medium text-slate-400 uppercase tracking-wider">
        Action so far
      </div>
      {lines.map((line) => (
        <div key={line}>{line}</div>
      ))}
    </div>
  );
}
