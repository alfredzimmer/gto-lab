"use client";

import type { Player, OddsResult } from "@/lib/types";
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

interface PlayerCardProps {
  player: Player;
  playerIndex: number;
  playerOdds?: OddsResult;
  selectedPosition: CardPosition;
  canRemove: boolean;
  onCardClick: (
    playerIndex: number,
    cardIndex: 0 | 1,
    hasCard: boolean,
  ) => void;
  onRemovePlayer: (playerIndex: number) => void;
}

export default function PlayerCard({
  player,
  playerIndex,
  playerOdds,
  selectedPosition,
  canRemove,
  onCardClick,
  onRemovePlayer,
}: PlayerCardProps) {
  const hasCompleteHand = player.cards[0] && player.cards[1];

  return (
    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
          {player.name}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={() => onRemovePlayer(playerIndex)}
            className="text-slate-400 hover:text-red-500 transition-colors text-sm"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex gap-2 mb-2">
        <div
          className={`cursor-pointer ${selectedPosition && "playerIndex" in selectedPosition && selectedPosition.playerIndex === playerIndex && selectedPosition.cardIndex === 0 ? "ring-1 ring-blue-500 rounded-md" : ""}`}
        >
          <CardDisplay
            card={player.cards[0]}
            onClick={() => onCardClick(playerIndex, 0, !!player.cards[0])}
            isSelectable={true}
          />
        </div>
        <div
          className={`cursor-pointer ${selectedPosition && "playerIndex" in selectedPosition && selectedPosition.playerIndex === playerIndex && selectedPosition.cardIndex === 1 ? "ring-1 ring-blue-500 rounded-md" : ""}`}
        >
          <CardDisplay
            card={player.cards[1]}
            onClick={() => onCardClick(playerIndex, 1, !!player.cards[1])}
            isSelectable={true}
          />
        </div>
      </div>

      {hasCompleteHand && playerOdds && (
        <div className="text-center">
          <span className="text-sm font-bold text-blue-600 dark:text-blue-400">
            {(playerOdds.winPercentage + playerOdds.tiePercentage).toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  );
}
