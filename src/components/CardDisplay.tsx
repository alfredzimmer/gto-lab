'use client';

import type { Card, Suit, Rank } from '@/lib/types';
import { SUITS, RANKS } from '@/lib/deck';

interface CardDisplayProps {
  card: Card | null;
  onClick?: () => void;
  isSelectable?: boolean;
}

export default function CardDisplay({ card, onClick, isSelectable = false }: CardDisplayProps) {
  const suitSymbols: Record<Suit, string> = {
    hearts: '♥',
    diamonds: '♦',
    clubs: '♣',
    spades: '♠'
  };

  const suitColors: Record<Suit, string> = {
    hearts: 'text-red-600 dark:text-red-500',
    diamonds: 'text-red-600 dark:text-red-500',
    clubs: 'text-slate-900 dark:text-white',
    spades: 'text-slate-900 dark:text-white'
  };

  if (!card) {
    return (
      <button
        onClick={onClick}
        disabled={!isSelectable}
        className={`
          w-20 h-28 bg-white dark:bg-slate-900 border-2 border-dashed border-slate-300 dark:border-slate-700
          rounded-md flex items-center justify-center
          ${isSelectable ? 'hover:border-slate-400 dark:hover:border-slate-600 cursor-pointer' : 'cursor-default'}
          transition-colors
        `}
      >
        <span className="text-3xl text-slate-400 dark:text-slate-600">?</span>
      </button>
    );
  }

  return (
    <button
      onClick={onClick}
      className={`
        w-20 h-28 bg-white dark:bg-slate-900 border-2 border-slate-300 dark:border-slate-700
        rounded-md flex flex-col items-center justify-center gap-1
        ${onClick ? 'hover:border-red-500 dark:hover:border-red-500 cursor-pointer' : 'cursor-default'}
        transition-colors
      `}
    >
      <span className="text-sm font-semibold text-slate-600 dark:text-slate-400">{card.rank}</span>
      <span className={`text-4xl ${suitColors[card.suit]}`}>
        {suitSymbols[card.suit]}
      </span>
    </button>
  );
}
