"use client";

import type { OddsResult, Player } from "@/lib/types";
import PlayerCard from "./PlayerCard";

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

interface PlayersGridProps {
  players: Player[];
  odds: OddsResult[];
  selectedPosition: CardPosition;
  onCardClick: (
    playerIndex: number,
    cardIndex: 0 | 1,
    hasCard: boolean,
  ) => void;
  onRemovePlayer: (playerIndex: number) => void;
}

export default function PlayersGrid({
  players,
  odds,
  selectedPosition,
  onCardClick,
  onRemovePlayer,
}: PlayersGridProps) {
  return (
    <div className="lg:col-span-2">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {players.map((player, playerIndex) => {
          const playerOdds = odds.find((o) => o.playerId === player.id);

          return (
            <PlayerCard
              key={player.id}
              player={player}
              playerIndex={playerIndex}
              playerOdds={playerOdds}
              selectedPosition={selectedPosition}
              canRemove={players.length > 2}
              onCardClick={onCardClick}
              onRemovePlayer={onRemovePlayer}
            />
          );
        })}
      </div>
    </div>
  );
}
