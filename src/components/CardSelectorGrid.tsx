'use client';

import type { Card, Suit, Rank } from '@/lib/types';
import { SUITS, RANKS } from '@/lib/deck';

interface CardSelectorGridProps {
  usedCards: (Card | null)[];
  onCardSelect: (card: Card) => void;
}

export default function CardSelectorGrid({ usedCards, onCardSelect }: CardSelectorGridProps) {
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

  const isCardUsed = (rank: Rank, suit: Suit) => {
    return usedCards.some(card => 
      card && card.rank === rank && card.suit === suit
    );
  };

  return (
    <div className="grid grid-cols-13 gap-0.5">
      {SUITS.map(suit => (
        RANKS.map(rank => {
          const used = isCardUsed(rank, suit);
          
          return (
            <button
              key={`${rank}-${suit}`}
              type="button"
              onClick={() => !used && onCardSelect({ rank, suit })}
              disabled={used}
              className={`
                h-12 min-w-0 text-[9px] font-medium rounded-sm border transition-all
                ${used ? 
                  'opacity-20 cursor-not-allowed bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700' : 
                  'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-400 hover:scale-110 hover:z-10 cursor-pointer'}
              `}
            >
              <div className="flex flex-col items-center justify-center h-full">
                <span className={`text-[8px] leading-none ${!used ? 'text-slate-600 dark:text-slate-400' : 'text-slate-400 dark:text-slate-600'}`}>
                  {rank}
                </span>
                <span className={`text-base leading-none ${!used ? suitColors[suit] : 'text-slate-400 dark:text-slate-600'}`}>
                  {suitSymbols[suit]}
                </span>
              </div>
            </button>
          );
        })
      ))}
    </div>
  );
}
