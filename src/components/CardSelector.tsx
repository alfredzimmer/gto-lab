"use client";

import type { Card, Player } from "@/lib/types";
import CardSelectorGrid from "./CardSelectorGrid";

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

interface CardSelectorProps {
  selectedPosition: CardPosition;
  players: Player[];
  usedCards: (Card | null)[];
  onCardSelect: (card: Card) => void;
}

export default function CardSelector({
  selectedPosition,
  players,
  usedCards,
  onCardSelect,
}: CardSelectorProps) {
  const getSelectionMessage = () => {
    if (
      selectedPosition &&
      "type" in selectedPosition &&
      selectedPosition.type === "community"
    ) {
      return `Select Board Card ${selectedPosition.cardIndex + 1}`;
    }
    if (selectedPosition && "playerIndex" in selectedPosition) {
      return `Select ${players[selectedPosition.playerIndex].name}'s Card ${selectedPosition.cardIndex + 1}`;
    }
    return "Click any empty card position above to select";
  };

  return (
    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 mb-8">
      <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-2 text-center">
        {getSelectionMessage()}
      </p>
      <CardSelectorGrid usedCards={usedCards} onCardSelect={onCardSelect} />
    </div>
  );
}
