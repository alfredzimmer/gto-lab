import CardDisplay from "@/components/cards/CardDisplay";
import type { SpotInfo } from "@/lib/gto/strategy";
import type { Card } from "@/lib/types";

interface GtoTableProps {
  spot: SpotInfo;
  /** When set (e.g. at showdown), reveal the villain's hole cards face-up. */
  villainCards?: [Card, Card] | null;
  /** Best-hand category names, shown under each seat at showdown. */
  heroRank?: string | null;
  villainRank?: string | null;
  /** Pulse the villain seat while the bot is deciding. */
  villainThinking?: boolean;
  /** Glow the winning seat at showdown. */
  result?: "hero" | "villain" | "split" | null;
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
    <div className="w-11 h-16 sm:w-20 sm:h-28 bg-white dark:bg-slate-800 rounded-md border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
      <div className="w-8 h-12 sm:w-16 sm:h-24 bg-slate-100 dark:bg-slate-700/50 rounded-sm" />
    </div>
  );
}

/** Emerald ring on the winner, blue on a split, nothing on the loser. */
function ringFor(
  seat: "hero" | "villain",
  result: GtoTableProps["result"],
): string {
  if (result === seat) return "result-win";
  if (result === "split") return "result-split";
  return "";
}

/**
 * Seat name, stack and (at showdown) made-hand category. Sits beside the
 * cards on a phone and under them from `sm` up, so each seat costs one
 * line instead of three on a small screen.
 */
function SeatMeta({
  name,
  stackBB,
  seat,
  rank,
  emphasis,
}: {
  name: string;
  stackBB: number;
  seat: number;
  rank: string | null;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col items-start sm:items-center gap-0.5 sm:gap-3">
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span
          className={`text-xs sm:text-sm font-medium ${
            emphasis
              ? "text-slate-900 dark:text-white"
              : "text-slate-600 dark:text-slate-400"
          }`}
        >
          {name} · {stackBB} BB
          <span className="hidden sm:inline"> behind</span>
        </span>
        <PositionBadge seat={seat} />
      </div>
      {rank && (
        <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {rank}
        </span>
      )}
    </div>
  );
}

/** One pot figure. Inline label on a phone, stacked from `sm` up. */
function PotStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5 sm:flex-col sm:items-center sm:gap-0">
      <span
        className={`text-[10px] sm:text-xs font-medium uppercase tracking-wider sm:mb-1 ${
          accent ? "text-red-500" : "text-slate-400"
        }`}
      >
        {label}
      </span>
      <span
        className={`text-lg sm:text-2xl font-bold ${
          accent
            ? "text-red-600 dark:text-red-400"
            : "text-slate-900 dark:text-white"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

export default function GtoTable({
  spot,
  villainCards = null,
  heroRank = null,
  villainRank = null,
  villainThinking = false,
  result = null,
}: GtoTableProps) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-8 sm:min-h-[560px] flex flex-col justify-between gap-3 sm:gap-8 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-slate-900 via-transparent to-transparent" />
      {/* Ambient felt glow — slow, low-opacity blue breathing so the table isn't static. */}
      <div className="felt-drift absolute inset-0 pointer-events-none bg-[radial-gradient(55%_45%_at_50%_42%,rgba(37,99,235,0.10),transparent_70%)]" />

      <div className="flex items-center justify-center gap-3 sm:flex-col sm:gap-3 z-10 w-full">
        <div
          className={`card-perspective flex gap-1 sm:gap-3 rounded-xl p-1 ${
            villainCards
              ? ringFor("villain", result)
              : villainThinking
                ? "thinking-ring"
                : ""
          }`}
        >
          {villainCards ? (
            villainCards.map((card, i) => (
              <div
                key={`v-${card.rank}-${card.suit}`}
                className="animate-flip"
                style={{ animationDelay: `${i * 0.1}s` }}
              >
                <CardDisplay card={card} compact />
              </div>
            ))
          ) : (
            <>
              <div className="animate-deal">
                <HiddenCard />
              </div>
              <div className="animate-deal" style={{ animationDelay: "0.06s" }}>
                <HiddenCard />
              </div>
            </>
          )}
        </div>
        <SeatMeta
          name="Villain"
          stackBB={spot.villainStackBB}
          seat={1 - spot.heroSeat}
          rank={villainRank}
        />
      </div>

      <div className="flex flex-col items-center gap-2 sm:gap-6 z-10 w-full">
        {/* Fixed-height board slot — reserves room for the flop cards so the
            table doesn't jump vertically between preflop and postflop. */}
        <div className="flex min-h-[4.75rem] sm:min-h-[9.5rem] items-center justify-center max-w-full">
          {spot.board.length > 0 ? (
            <div className="flex gap-1 sm:gap-3 p-1.5 sm:p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl sm:rounded-2xl border border-slate-100 dark:border-slate-700/50 backdrop-blur-sm max-w-full overflow-x-auto">
              {spot.board.map((card, i) => (
                <div
                  key={`${card.rank}-${card.suit}-${i}`}
                  className="animate-deal"
                  style={{ animationDelay: `${Math.min(i, 2) * 0.07}s` }}
                >
                  <CardDisplay card={card} compact />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-xs sm:text-sm text-slate-400 uppercase tracking-wider">
              Preflop
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 sm:gap-8">
          <span key={spot.potBB} className="animate-pot-pop">
            <PotStat label="Pot" value={`${spot.potBB} BB`} />
          </span>
          {spot.toCallBB > 0 && (
            <>
              <div className="w-px h-5 sm:h-8 bg-slate-200 dark:bg-slate-700" />
              <PotStat label="To Call" value={`${spot.toCallBB} BB`} accent />
            </>
          )}
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 sm:flex-col sm:gap-3 z-10 w-full">
        <div
          className={`flex gap-1 sm:gap-3 rounded-xl p-1 ${ringFor("hero", result)}`}
        >
          <div className="animate-deal">
            <CardDisplay card={spot.heroCards[0]} compact />
          </div>
          <div className="animate-deal" style={{ animationDelay: "0.06s" }}>
            <CardDisplay card={spot.heroCards[1]} compact />
          </div>
        </div>
        <SeatMeta
          name="Hero"
          stackBB={spot.heroStackBB}
          seat={spot.heroSeat}
          rank={heroRank}
          emphasis
        />
      </div>
    </div>
  );
}
