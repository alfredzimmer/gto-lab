"use client";

import type { Card } from "@/lib/types";
import CardDisplay from "./CardDisplay";

type CardPosition =
  | {
      playerIndex: number;
      cardIndex: 0 | 1;
    }
  | {
      type: "community";
      cardIndex: number;
    }
  | null;

interface CommunityBoardProps {
  communityCards: (Card | null)[];
  selectedPosition: CardPosition;
  canAddPlayer: boolean;
  onCardClick: (index: number, hasCard: boolean) => void;
  onAddPlayer: () => void;
  onClearAll: () => void;
}

export default function CommunityBoard({
  communityCards,
  selectedPosition,
  canAddPlayer,
  onCardClick,
  onAddPlayer,
  onClearAll,
}: CommunityBoardProps) {
  return (
    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 mb-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
          Board
        </h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onAddPlayer}
            disabled={!canAddPlayer}
            className="px-2 py-1 text-[10px] font-medium text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50"
          >
            Add Player
          </button>
          <button
            type="button"
            onClick={onClearAll}
            className="px-2 py-1 text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-md transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>
      <div className="flex gap-2">
        {communityCards.map((card, index) => (
          <div
            key={`community-${index}`}
            className={`cursor-pointer ${selectedPosition && "type" in selectedPosition && selectedPosition.type === "community" && selectedPosition.cardIndex === index ? "ring-1 ring-blue-500 rounded-md" : ""}`}
          >
            <CardDisplay
              card={card}
              onClick={() => onCardClick(index, !!card)}
              isSelectable={true}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
