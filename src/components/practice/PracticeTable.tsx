import CardDisplay from "@/components/cards/CardDisplay";
import type { PracticeState } from "@/app/actions/practice";

interface PracticeTableProps {
  gameState: PracticeState;
  revealHands: boolean;
}

export default function PracticeTable({
  gameState,
  revealHands,
}: PracticeTableProps) {
  return (
    <div className="bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 p-8 min-h-[600px] flex flex-col justify-between gap-8 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05] bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-slate-900 via-transparent to-transparent" />

      <div className="flex flex-col items-center gap-3 z-10">
        <div className="flex gap-8">
          {gameState.villainHands.map((hand, index) => (
            <div
              key={`${gameState.id}-opp-${index}`}
              className="flex flex-col items-center gap-2"
            >
              <div className="flex gap-3">
                {revealHands ? (
                  <>
                    <CardDisplay card={hand[0]} />
                    <CardDisplay card={hand[1]} />
                  </>
                ) : (
                  <>
                    <div className="w-16 h-22 sm:w-20 sm:h-28 bg-white dark:bg-slate-800 rounded-md border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                      <div className="w-12 h-18 sm:w-16 sm:h-24 bg-slate-100 dark:bg-slate-700/50 rounded-sm" />
                    </div>
                    <div className="w-16 h-22 sm:w-20 sm:h-28 bg-white dark:bg-slate-800 rounded-md border-2 border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                      <div className="w-12 h-18 sm:w-16 sm:h-24 bg-slate-100 dark:bg-slate-700/50 rounded-sm" />
                    </div>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300">
                  OP{index + 1}
                </div>
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  Opponent {index + 1}
                </span>
              </div>
            </div>
          ))}
        </div>
        {revealHands && (
          <span className="text-xs text-slate-400">(Revealed)</span>
        )}
      </div>

      <div className="flex flex-col items-center gap-6 z-10">
        <div className="flex gap-3 p-4 bg-white/50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-700/50 backdrop-blur-sm">
          {gameState.board.map((card, i) => (
            <CardDisplay key={`${card.rank}-${card.suit}-${i}`} card={card} />
          ))}
        </div>

        <div className="flex items-center gap-8">
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">
              Pot
            </span>
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              ${gameState.pot}
            </span>
          </div>
          <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
          <div className="flex flex-col items-center">
            <span className="text-xs font-medium text-red-500 uppercase tracking-wider mb-1">
              Bet
            </span>
            <span className="text-2xl font-bold text-red-600 dark:text-red-400">
              ${gameState.bet}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-3 z-10">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-xs font-bold text-blue-600 dark:text-blue-400">
            YOU
          </div>
          <span className="text-sm font-medium text-slate-900 dark:text-white">
            Hero
          </span>
        </div>
        <div className="flex gap-3">
          <CardDisplay card={gameState.heroHand[0]} />
          <CardDisplay card={gameState.heroHand[1]} />
        </div>
      </div>
    </div>
  );
}
