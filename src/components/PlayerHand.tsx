"use client";

import type { Card, OddsResult, Player } from "@/lib/types";
import CardPicker from "./CardPicker";

interface PlayerHandProps {
  player: Player;
  usedCards: (Card | null)[];
  onCardSelect: (
    playerIndex: number,
    cardIndex: 0 | 1,
    card: Card | null,
  ) => void;
  onRemove: () => void;
  playerIndex: number;
  canRemove: boolean;
  odds: OddsResult | null;
  isCalculating: boolean;
}

export default function PlayerHand({
  player,
  usedCards,
  onCardSelect,
  onRemove,
  playerIndex,
  canRemove,
  odds,
  isCalculating,
}: PlayerHandProps) {
  const hasCompleteHand = player.cards[0] && player.cards[1];

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {player.name}
        </h3>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 text-sm font-medium"
          >
            Remove
          </button>
        )}
      </div>
      <div className="flex gap-4 items-center">
        <div className="flex gap-3">
          <CardPicker
            label="Card 1"
            selectedCard={player.cards[0]}
            usedCards={usedCards}
            onSelect={(card) => onCardSelect(playerIndex, 0, card)}
          />
          <CardPicker
            label="Card 2"
            selectedCard={player.cards[1]}
            usedCards={usedCards}
            onSelect={(card) => onCardSelect(playerIndex, 1, card)}
          />
        </div>

        {hasCompleteHand && (
          <div className="flex-1 ml-2">
            {isCalculating ? (
              <div className="text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : odds ? (
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {odds.winPercentage.toFixed(1)}%
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    to win
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-linear-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-500"
                    style={{ width: `${odds.winPercentage}%` }}
                  />
                </div>
                {odds.tiePercentage > 0.1 && (
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    Tie: {odds.tiePercentage.toFixed(1)}%
                  </p>
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
