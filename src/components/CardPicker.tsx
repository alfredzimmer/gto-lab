"use client";

import { useCallback, useState } from "react";
import { RANKS, SUITS } from "@/lib/deck";
import type { Card, Rank, Suit } from "@/lib/types";

interface CardPickerProps {
  selectedCard: Card | null;
  usedCards: (Card | null)[];
  onSelect: (card: Card | null) => void;
  label: string;
}

export default function CardPicker({
  selectedCard,
  usedCards,
  onSelect,
  label,
}: CardPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const suitSymbols: Record<Suit, string> = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
  };

  const suitColors: Record<Suit, string> = {
    hearts: "text-red-600",
    diamonds: "text-red-600",
    clubs: "text-gray-900 dark:text-white",
    spades: "text-gray-900 dark:text-white",
  };

  const isCardUsed = useCallback(
    (rank: Rank, suit: Suit) => {
      return usedCards.some(
        (card) =>
          card &&
          card.rank === rank &&
          card.suit === suit &&
          !(selectedCard?.rank === rank && selectedCard?.suit === suit),
      );
    },
    [usedCards, selectedCard],
  );

  const isCardSelected = (rank: Rank, suit: Suit) => {
    return selectedCard?.rank === rank && selectedCard?.suit === suit;
  };

  const handleCardSelect = (card: Card) => {
    onSelect(card);
    setIsOpen(false);
  };

  const handleClear = () => {
    onSelect(null);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <span className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-20 h-28 flex items-center justify-center bg-white dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-600 rounded-lg shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        {selectedCard ? (
          <span
            className={`text-3xl font-bold ${suitColors[selectedCard.suit]}`}
          >
            {selectedCard.rank}
            {suitSymbols[selectedCard.suit]}
          </span>
        ) : (
          <span className="text-4xl text-gray-400">?</span>
        )}
      </button>

      {isOpen && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
            aria-label="Close card selector"
          />
          <div className="absolute z-20 mt-1 p-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-xl">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Select Card
              </span>
              <button
                type="button"
                onClick={handleClear}
                className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Clear
              </button>
            </div>
            <div className="space-y-2">
              {SUITS.map((suit) => (
                <div key={suit} className="flex gap-1">
                  {RANKS.map((rank) => {
                    const used = isCardUsed(rank, suit);
                    const selected = isCardSelected(rank, suit);

                    return (
                      <button
                        key={`${rank}-${suit}`}
                        type="button"
                        onClick={() =>
                          !used && handleCardSelect({ rank, suit })
                        }
                        disabled={used}
                        className={`
                          w-8 h-10 text-sm font-bold rounded transition-all
                          ${
                            used
                              ? "opacity-25 cursor-not-allowed bg-gray-200 dark:bg-gray-700"
                              : selected
                                ? "bg-blue-500 text-white ring-2 ring-blue-600"
                                : "bg-gray-50 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 hover:scale-110"
                          }
                          ${!used && !selected ? suitColors[suit] : ""}
                        `}
                      >
                        <div className="flex flex-col items-center">
                          <span className="text-xs">{rank}</span>
                          <span>{suitSymbols[suit]}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
