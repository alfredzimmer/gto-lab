"use client";

import CardSelector from "@/components/CardSelector";
import CommunityBoard from "@/components/CommunityBoard";
import PieChart from "@/components/PieChart";
import PlayersGrid from "@/components/PlayersGrid";
import { useEquityCalculator } from "@/hooks/useEquityCalculator";

export default function Home() {
  const {
    players,
    communityCards,
    odds,
    selectedPosition,
    usedCards,
    isSingleHandMode,
    handleCardSelect,
    handleCardRemove,
    clearAll,
    addPlayer,
    removePlayer,
    setSelectedPosition,
  } = useEquityCalculator();

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
        <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <PlayersGrid
            players={players}
            odds={odds}
            selectedPosition={selectedPosition}
            onCardClick={handlePlayerCardClick}
            onRemovePlayer={removePlayer}
          />

          <PieChart
            odds={odds}
            players={players}
            isSingleHandMode={isSingleHandMode}
          />
        </div>

        <div>
          <CommunityBoard
            communityCards={communityCards}
            selectedPosition={selectedPosition}
            canAddPlayer={players.length < 9}
            onCardClick={handleCommunityCardClick}
            onAddPlayer={addPlayer}
            onClearAll={clearAll}
          />

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
