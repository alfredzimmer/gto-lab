"use client";

import { useMemo } from "react";
import CardSelector from "@/components/CardSelector";
import CommunityBoard from "@/components/CommunityBoard";
import PieChart from "@/components/PieChart";
import PlayersGrid from "@/components/PlayersGrid";
import type { Card } from "@/lib/types";
import { useGameStore } from "@/store/useGameStore";

export default function Home() {
  const {
    players,
    communityCards,
    odds,
    selectedPosition,
    handleCardSelect,
    handleCardRemove,
    clearAll,
    addPlayer,
    removePlayer,
    setSelectedPosition,
  } = useGameStore();

  const usedCards = useMemo(() => {
    const cards: (Card | null)[] = [];
    for (const player of players) {
      cards.push(player.cards[0], player.cards[1]);
    }
    cards.push(...communityCards);
    return cards;
  }, [players, communityCards]);

  const isSingleHandMode = useMemo(() => {
    const validPlayers = players.filter((p) => p.cards[0] && p.cards[1]);
    return validPlayers.length === 1;
  }, [players]);

  const handlePlayerCardClick = (
    playerIndex: number,
    cardIndex: 0 | 1,
    hasCard: boolean,
  ) => {
    if (hasCard) {
      handleCardRemove({ playerIndex, cardIndex });
    } else {
      setSelectedPosition({ playerIndex, cardIndex });
    }
  };

  const handleCommunityCardClick = (index: number, hasCard: boolean) => {
    if (hasCard) {
      handleCardRemove({ type: "community", cardIndex: index });
    } else {
      setSelectedPosition({ type: "community", cardIndex: index });
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-6 py-4 max-w-[1400px]">
        <div className="mb-4">
          <PlayersGrid
            players={players}
            odds={odds}
            selectedPosition={selectedPosition}
            onCardClick={handlePlayerCardClick}
            onRemovePlayer={removePlayer}
          />
        </div>

        <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <CommunityBoard
              communityCards={communityCards}
              selectedPosition={selectedPosition}
              onCardClick={handleCommunityCardClick}
              onAddPlayer={addPlayer}
              onClearAll={clearAll}
              canAddPlayer={players.length < 9}
            />
          </div>

          <div className="flex gap-4 items-start">
            <div className="flex-1 min-w-[320px]">
              <PieChart
                odds={odds}
                players={players}
                isSingleHandMode={isSingleHandMode}
              />
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <button
                type="button"
                onClick={addPlayer}
                disabled={players.length >= 9}
                className="px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
              >
                Add Player
              </button>
              <button
                type="button"
                onClick={clearAll}
                className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>

        <div>
          <CardSelector
            selectedPosition={selectedPosition}
            players={players}
            usedCards={usedCards}
            onCardSelect={handleCardSelect}
          />
        </div>
      </main>
    </div>
  );
}
