"use client";

import type { Card, Suit } from "@/lib/types";

interface CardDisplayProps {
  card: Card | null;
  onClick?: () => void;
  isSelectable?: boolean;
  /**
   * Shrink the card on small screens so a full seat row (or a five-card
   * board) fits one phone line. Desktop sizing is unchanged either way.
   */
  compact?: boolean;
}

/** [box, rank text, suit glyph, inner gap] per size, mobile -> sm. */
const SIZES = {
  default: [
    "w-14 h-20 sm:w-20 sm:h-28",
    "text-[10px] sm:text-sm",
    "text-2xl sm:text-4xl",
    "gap-1",
  ],
  compact: [
    "w-11 h-16 sm:w-20 sm:h-28",
    "text-[9px] sm:text-sm",
    "text-xl sm:text-4xl",
    "gap-0.5 sm:gap-1",
  ],
} as const;

export default function CardDisplay({
  card,
  onClick,
  isSelectable = false,
  compact = false,
}: CardDisplayProps) {
  const [box, rankText, suitText, gap] = SIZES[compact ? "compact" : "default"];

  const suitSymbols: Record<Suit, string> = {
    hearts: "♥",
    diamonds: "♦",
    clubs: "♣",
    spades: "♠",
  };

  const suitColors: Record<Suit, string> = {
    hearts: "text-red-600 dark:text-red-500",
    diamonds: "text-red-600 dark:text-red-500",
    clubs: "text-slate-900 dark:text-white",
    spades: "text-slate-900 dark:text-white",
  };

  if (!card) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={!isSelectable}
        className={`
          ${box} bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700
          rounded-md flex items-center justify-center
          ${isSelectable ? "hover:border-slate-400 dark:hover:border-slate-600 cursor-pointer" : "cursor-default"}
          transition-colors
        `}
      >
        <span className="text-xl sm:text-3xl text-slate-400 dark:text-slate-600">
          ?
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        ${box} bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700
        rounded-md flex flex-col items-center justify-center ${gap}
        ${onClick ? "hover:border-red-500 dark:hover:border-red-500 cursor-pointer" : "cursor-default"}
        transition-colors
      `}
    >
      <span
        className={`${rankText} font-semibold text-slate-600 dark:text-slate-400`}
      >
        {card.rank}
      </span>
      <span className={`${suitText} ${suitColors[card.suit]}`}>
        {suitSymbols[card.suit]}
      </span>
    </button>
  );
}
