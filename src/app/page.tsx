'use client';

import { useState, useEffect, useMemo } from 'react';
import type { Player, Card, OddsResult } from '@/lib/types';
import CardDisplay from '@/components/CardDisplay';
import CardSelectorGrid from '@/components/CardSelectorGrid';
import PieChart from '@/components/PieChart';
import GitHubLink from '@/components/GitHubLink';
import { calculateOdds, calculateHandStrength } from '@/lib/calculator';

type CardPosition = {
  playerIndex: number;
  cardIndex: 0 | 1;
} | {
  type: 'community';
  cardIndex: number;
} | null;

const PLAYER_COLORS = [
  '#2563EB',
  '#DC2626',
  '#059669',
  '#D97706',
  '#7C3AED',
  '#DB2777',
  '#0891B2',
  '#EA580C',
  '#4F46E5',
];

export default function Home() {
  const [players, setPlayers] = useState<Player[]>([
    { id: '1', name: 'Player 1', cards: [null, null] },
    { id: '2', name: 'Player 2', cards: [null, null] }
  ]);
  const [communityCards, setCommunityCards] = useState<(Card | null)[]>([null, null, null, null, null]);
  const [odds, setOdds] = useState<OddsResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<CardPosition>({ playerIndex: 0, cardIndex: 0 });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const cachedPlayers = localStorage.getItem('poker-odds-players');
        const cachedCommunityCards = localStorage.getItem('poker-odds-community-cards');
        
        if (cachedPlayers) {
          const parsedPlayers = JSON.parse(cachedPlayers);
          setPlayers(parsedPlayers);
        }
        
        if (cachedCommunityCards) {
          const parsedCommunityCards = JSON.parse(cachedCommunityCards);
          setCommunityCards(parsedCommunityCards);
        }
      } catch (error) {
        console.error('Error loading cached data:', error);
      }
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        localStorage.setItem('poker-odds-players', JSON.stringify(players));
      } catch (error) {
        console.error('Error saving players to cache:', error);
      }
    }
  }, [players, isLoaded]);

  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      try {
        localStorage.setItem('poker-odds-community-cards', JSON.stringify(communityCards));
      } catch (error) {
        console.error('Error saving community cards to cache:', error);
      }
    }
  }, [communityCards, isLoaded]);

  const usedCards = useMemo(() => {
    const cards: (Card | null)[] = [];
    for (const player of players) {
      cards.push(player.cards[0], player.cards[1]);
    }
    cards.push(...communityCards);
    return cards;
  }, [players, communityCards]);

  const validPlayers = useMemo(() => 
    players.filter(p => p.cards[0] && p.cards[1]), 
    [players]
  );
  const isSingleHandMode = validPlayers.length === 1;

  useEffect(() => {
    const validPlayers = players.filter(p => p.cards[0] && p.cards[1]);
    
    if (validPlayers.length === 0) {
      setOdds([]);
      return;
    }
    
    setIsCalculating(true);
    const timer = setTimeout(() => {
      if (validPlayers.length === 1) {
        const player = validPlayers[0];
        const numOpponents = players.length - 1;
        
        const result = calculateHandStrength(
          [player.cards[0]!, player.cards[1]!],
          communityCards,
          numOpponents,
        );
        setOdds([{
          playerId: player.id,
          playerName: `${player.name} vs ${numOpponents} opponent${numOpponents > 1 ? 's' : ''}`,
          winPercentage: result.winPercentage,
          tiePercentage: result.tiePercentage
        }]);
      } else {
        const result = calculateOdds(players, communityCards);
        setOdds(result);
      }
      setIsCalculating(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [players, communityCards]);

  const handleCardSelect = (card: Card) => {
    if (!selectedPosition) return;

    if ('type' in selectedPosition && selectedPosition.type === 'community') {
      const newCommunityCards = [...communityCards];
      newCommunityCards[selectedPosition.cardIndex] = card;
      setCommunityCards(newCommunityCards);
      setTimeout(() => findNextEmptySlot(newCommunityCards, players), 0);
    } else if ('playerIndex' in selectedPosition) {
      const newPlayers = [...players];
      newPlayers[selectedPosition.playerIndex].cards[selectedPosition.cardIndex] = card;
      setPlayers(newPlayers);
      setTimeout(() => findNextEmptySlot(communityCards, newPlayers), 0);
    }
  };

  const handleCardRemove = (position: CardPosition) => {
    if (!position) return;

    if ('type' in position && position.type === 'community') {
      const newCommunityCards = [...communityCards];
      newCommunityCards[position.cardIndex] = null;
      setCommunityCards(newCommunityCards);
    } else if ('playerIndex' in position) {
      const newPlayers = [...players];
      newPlayers[position.playerIndex].cards[position.cardIndex] = null;
      setPlayers(newPlayers);
    }
    
    setSelectedPosition(position);
  };

  const findNextEmptySlot = (community: (Card | null)[] = communityCards, playersList: Player[] = players) => {
    for (let i = 0; i < playersList.length; i++) {
      if (!playersList[i].cards[0]) {
        setSelectedPosition({ playerIndex: i, cardIndex: 0 });
        return;
      }
      if (!playersList[i].cards[1]) {
        setSelectedPosition({ playerIndex: i, cardIndex: 1 });
        return;
      }
    }
    
    for (let i = 0; i < community.length; i++) {
      if (!community[i]) {
        setSelectedPosition({ type: 'community', cardIndex: i });
        return;
      }
    }
    
    setSelectedPosition(null);
  };

  const clearAll = () => {
    const defaultPlayers: Player[] = [
      { id: '1', name: 'Player 1', cards: [null, null] },
      { id: '2', name: 'Player 2', cards: [null, null] }
    ];
    const defaultCommunityCards: (Card | null)[] = [null, null, null, null, null];
    
    setPlayers(defaultPlayers);
    setCommunityCards(defaultCommunityCards);
    setOdds([]);
    setSelectedPosition({ playerIndex: 0, cardIndex: 0 });
    
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('poker-odds-players');
        localStorage.removeItem('poker-odds-community-cards');
      } catch (error) {
        console.error('Error clearing cache:', error);
      }
    }
  };

  const addPlayer = () => {
    const newId = (Math.max(...players.map(p => Number.parseInt(p.id)), 0) + 1).toString();
    setPlayers([...players, { 
      id: newId, 
      name: `Player ${newId}`, 
      cards: [null, null] 
    }]);
  };

  const removePlayer = (index: number) => {
    if (players.length <= 2) return;
    
    const newPlayers = players.filter((_, i) => i !== index);
    setPlayers(newPlayers);
    
    setSelectedPosition({ playerIndex: 0, cardIndex: 0 });
  };

  return (
    <div className="min-h-screen bg-white dark:bg-[#0a0a0a]">
      <main className="container mx-auto px-6 py-4 max-w-[1400px]">
        <div className="mb-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {players.map((player, playerIndex) => {
                const playerOdds = odds.find(o => o.playerId === player.id);
                const hasCompleteHand = player.cards[0] && player.cards[1];
                
                return (
                  <div 
                    key={player.id} 
                    className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {player.name}
                      </h3>
                      {players.length > 2 && (
                        <button
                          onClick={() => removePlayer(playerIndex)}
                          className="text-slate-400 hover:text-red-500 transition-colors text-sm"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    
                    <div className="flex gap-2 mb-2">
                      <div 
                        onClick={() => {
                          if (player.cards[0]) {
                            handleCardRemove({ playerIndex, cardIndex: 0 });
                          } else {
                            setSelectedPosition({ playerIndex, cardIndex: 0 });
                          }
                        }}
                        className={`cursor-pointer ${selectedPosition && 'playerIndex' in selectedPosition && selectedPosition.playerIndex === playerIndex && selectedPosition.cardIndex === 0 ? 'ring-1 ring-blue-500 rounded-md' : ''}`}
                      >
                        <CardDisplay
                          card={player.cards[0]}
                          onClick={() => {}}
                          isSelectable={true}
                        />
                      </div>
                      <div 
                        onClick={() => {
                          if (player.cards[1]) {
                            handleCardRemove({ playerIndex, cardIndex: 1 });
                          } else {
                            setSelectedPosition({ playerIndex, cardIndex: 1 });
                          }
                        }}
                        className={`cursor-pointer ${selectedPosition && 'playerIndex' in selectedPosition && selectedPosition.playerIndex === playerIndex && selectedPosition.cardIndex === 1 ? 'ring-1 ring-blue-500 rounded-md' : ''}`}
                      >
                        <CardDisplay
                          card={player.cards[1]}
                          onClick={() => {}}
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
              })}
            </div>
          </div>

          <div className="p-6 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <PieChart
                data={
                  odds.length === 0 
                    ? [{ label: 'Tie', value: 100, color: '#64748B' }]
                    : isSingleHandMode
                      ? [
                          {
                            label: odds[0].playerName.split(' vs ')[0],
                            value: odds[0].winPercentage,
                            color: '#3b82f6'
                          },
                          ...(odds[0].tiePercentage > 0.1 ? [{
                            label: 'Tie',
                            value: odds[0].tiePercentage,
                            color: '#64748B'
                          }] : []),
                          {
                            label: 'Opponent Wins',
                            value: 100 - odds[0].winPercentage - odds[0].tiePercentage,
                            color: '#94a3b8'
                          }
                        ]
                      : [
                          ...odds.map((playerOdds, index) => ({
                            label: playerOdds.playerName,
                            value: playerOdds.winPercentage,
                            color: ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#f43f5e', '#14b8a6'][players.findIndex(p => p.id === playerOdds.playerId) % 9]
                          })),
                          ...(odds.length > 0 && odds[0].tiePercentage > 0.1 ? [{
                            label: 'Tie',
                            value: odds[0].tiePercentage,
                            color: '#64748B'
                          }] : [])
                        ]
                }
              />
          </div>
        </div>

        <div>
          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 mb-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-slate-900 dark:text-white">
                Board
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={addPlayer}
                  disabled={players.length >= 9}
                  className="px-2 py-1 text-[10px] font-medium text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-md transition-colors disabled:opacity-50"
                >
                  Add Player
                </button>
                <button
                  onClick={clearAll}
                  className="px-2 py-1 text-[10px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white border border-slate-200 dark:border-slate-700 rounded-md transition-colors"
                >
                  Clear All
                </button>
              </div>
            </div>
            <div className="flex gap-2">
              {communityCards.map((card, index) => (
                <div 
                  key={index}
                  onClick={() => {
                    if (card) {
                      handleCardRemove({ type: 'community', cardIndex: index });
                    } else {
                      setSelectedPosition({ type: 'community', cardIndex: index });
                    }
                  }}
                  className={`cursor-pointer ${selectedPosition && 'type' in selectedPosition && selectedPosition.type === 'community' && selectedPosition.cardIndex === index ? 'ring-1 ring-blue-500 rounded-md' : ''}`}
                >
                  <CardDisplay
                    card={card}
                    onClick={() => {}}
                    isSelectable={true}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
            <p className="text-[10px] text-slate-600 dark:text-slate-400 mb-2 text-center">
              {selectedPosition && 'type' in selectedPosition && selectedPosition.type === 'community' 
                ? `Select Board Card ${selectedPosition.cardIndex + 1}`
                : selectedPosition && 'playerIndex' in selectedPosition
                ? `Select ${players[selectedPosition.playerIndex].name}'s Card ${selectedPosition.cardIndex + 1}`
                : 'Click any empty card position above to select'}
            </p>
            <CardSelectorGrid
              usedCards={usedCards}
              onCardSelect={handleCardSelect}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
