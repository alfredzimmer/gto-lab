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
  onCardClick: (index: number, hasCard: boolean) => void;
  onAddPlayer: () => void;
  onClearAll: () => void;
  canAddPlayer: boolean;
}

export default function CommunityBoard({
  communityCards,
  selectedPosition,
  onCardClick,
}: CommunityBoardProps) {
  return (
    <div className="h-full p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 mb-3">
      <h3 className="text-xs font-semibold text-slate-900 dark:text-white mb-2">
        Board
      </h3>
      <div className="flex gap-3 items-center justify-center h-[calc(100%-2rem)]">
        {communityCards.map((card, index) => (
          <div
            key={`community-${index}`}
            className={`shrink-0 cursor-pointer ${selectedPosition && "type" in selectedPosition && selectedPosition.type === "community" && selectedPosition.cardIndex === index ? "ring-1 ring-blue-500 rounded-md" : ""}`}
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
