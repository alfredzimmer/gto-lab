import CardDisplay from "@/components/cards/CardDisplay";
import type { SpotInfo } from "@/lib/gto/strategy";

interface GtoTableProps {
  spot: SpotInfo;
}

/** Seat badge: in heads-up the Button posts the small blind. */
function PositionBadge({ seat }: { seat: number }) {
  return seat === 0 ? (
    <span
      title="Button / small blind — acts first preflop, last postflop"
      className="px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wide bg-amber-400 text-slate-900"
    >
      BTN
    </span>
  ) : (
    <span
      title="Big blind — acts last preflop, first postflop"
      className="px-1.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-bold uppercase tracking-wide bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
    >
      BB
    </span>
  );
}

function HiddenCard() {
  return (
    <div className="w-14 h-20 sm:w-20 sm:h-28 bg-white dark:bg-slate-800 rounded-md border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
      <div className="w-10 h-16 sm:w-16 sm:h-24 bg-slate-100 dark:bg-slate-700/50 rounded-sm" />
    </div>
  );
}

export default function GtoTable({ spot }: GtoTableProps) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-8 min-h-[400px] sm:min-h-[560px] flex flex-col justify-between gap-4 sm:gap-8 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-slate-900 via-transparent to-transparent" />

      <div className="flex flex-col items-center gap-3 z-10 w-full">
        <div className="flex gap-1 sm:gap-3">
          <HiddenCard />
          <HiddenCard />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] sm:text-xs font-bold text-slate-600 dark:text-slate-300">
            V
          </div>
          <span className="text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-400">
            Villain · {spot.villainStackBB} BB behind
          </span>
          <PositionBadge seat={1 - spot.heroSeat} />
        </div>
      </div>

      <div className="flex flex-col items-center gap-6 z-10 w-full">
        {spot.board.length > 0 ? (
          <div className="flex gap-2 sm:gap-3 p-2 sm:p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 backdrop-blur-sm max-w-full overflow-x-auto">
            {spot.board.map((card, i) => (
              <CardDisplay key={`${card.rank}-${card.suit}-${i}`} card={card} />
            ))}
          </div>
        ) : (
          <div className="text-xs sm:text-sm text-slate-400 uppercase tracking-wider">
            Preflop
          </div>
        )}

        <div className="flex items-center gap-4 sm:gap-8">
          <div className="flex flex-col items-center">
            <span className="text-[10px] sm:text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Pot
            </span>
            <span className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
              {spot.potBB} BB
            </span>
          </div>
          {spot.toCallBB > 0 && (
            <>
              <div className="w-px h-6 sm:h-8 bg-slate-200 dark:bg-slate-700" />
              <div className="flex flex-col items-center">
                <span className="text-[10px] sm:text-xs font-medium text-red-500 uppercase tracking-wider mb-1">
                  To Call
                </span>
                <span className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">
                  {spot.toCallBB} BB
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 z-10">
        <div className="flex gap-3">
          <CardDisplay card={spot.heroCards[0]} />
          <CardDisplay card={spot.heroCards[1]} />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
            YOU
          </div>
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            Hero · {spot.heroStackBB} BB behind
          </span>
          <PositionBadge seat={spot.heroSeat} />
        </div>
      </div>
    </div>
  );
}
