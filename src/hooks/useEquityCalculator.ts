import { useEffect, useMemo, useState } from "react";
import { calculateHandStrength, calculateOdds } from "@/lib/calculator";
import type { Card, OddsResult, Player } from "@/lib/types";

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

export function useEquityCalculator() {
  const [players, setPlayers] = useState<Player[]>([
    { id: "1", name: "Player 1", cards: [null, null] },
    { id: "2", name: "Player 2", cards: [null, null] },
  ]);
  const [communityCards, setCommunityCards] = useState<(Card | null)[]>([
    null,
    null,
    null,
    null,
    null,
  ]);
  const [odds, setOdds] = useState<OddsResult[]>([]);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<CardPosition>({
    playerIndex: 0,
    cardIndex: 0,
  });
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      try {
        const cachedPlayers = localStorage.getItem("poker-odds-players");
        const cachedCommunityCards = localStorage.getItem(
          "poker-odds-community-cards",
        );

        if (cachedPlayers) {
          const parsedPlayers = JSON.parse(cachedPlayers);
          setPlayers(parsedPlayers);
        }

        if (cachedCommunityCards) {
          const parsedCommunityCards = JSON.parse(cachedCommunityCards);
          setCommunityCards(parsedCommunityCards);
        }
      } catch (error) {
        console.error("Error loading cached data:", error);
      }
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && typeof window !== "undefined") {
      try {
        localStorage.setItem("poker-odds-players", JSON.stringify(players));
      } catch (error) {
        console.error("Error saving players to cache:", error);
      }
    }
  }, [players, isLoaded]);

  useEffect(() => {
    if (isLoaded && typeof window !== "undefined") {
      try {
        localStorage.setItem(
          "poker-odds-community-cards",
          JSON.stringify(communityCards),
        );
      } catch (error) {
        console.error("Error saving community cards to cache:", error);
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

  const validPlayers = useMemo(
    () => players.filter((p) => p.cards[0] && p.cards[1]),
    [players],
  );

  const isSingleHandMode = validPlayers.length === 1;

  useEffect(() => {
    const validPlayers = players.filter((p) => p.cards[0] && p.cards[1]);

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
          [player.cards[0] as Card, player.cards[1] as Card],
          communityCards,
          numOpponents,
        );
        setOdds([
          {
            playerId: player.id,
            playerName: `${player.name} vs ${numOpponents} opponent${numOpponents > 1 ? "s" : ""}`,
            winPercentage: result.winPercentage,
            tiePercentage: result.tiePercentage,
          },
        ]);
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

    if ("type" in selectedPosition && selectedPosition.type === "community") {
      const newCommunityCards = [...communityCards];
      newCommunityCards[selectedPosition.cardIndex] = card;
      setCommunityCards(newCommunityCards);
      setTimeout(() => findNextEmptySlot(newCommunityCards, players), 0);
    } else if ("playerIndex" in selectedPosition) {
      const newPlayers = [...players];
      newPlayers[selectedPosition.playerIndex].cards[
        selectedPosition.cardIndex
      ] = card;
      setPlayers(newPlayers);
      setTimeout(() => findNextEmptySlot(communityCards, newPlayers), 0);
    }
  };

  const handleCardRemove = (position: CardPosition) => {
    if (!position) return;

    if ("type" in position && position.type === "community") {
      const newCommunityCards = [...communityCards];
      newCommunityCards[position.cardIndex] = null;
      setCommunityCards(newCommunityCards);
    } else if ("playerIndex" in position) {
      const newPlayers = [...players];
      newPlayers[position.playerIndex].cards[position.cardIndex] = null;
      setPlayers(newPlayers);
    }

    setSelectedPosition(position);
  };

  const findNextEmptySlot = (
    community: (Card | null)[] = communityCards,
    playersList: Player[] = players,
  ) => {
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
        setSelectedPosition({ type: "community", cardIndex: i });
        return;
      }
    }

    setSelectedPosition(null);
  };

  const clearAll = () => {
    const defaultPlayers: Player[] = [
      { id: "1", name: "Player 1", cards: [null, null] },
      { id: "2", name: "Player 2", cards: [null, null] },
    ];
    const defaultCommunityCards: (Card | null)[] = [
      null,
      null,
      null,
      null,
      null,
    ];

    setPlayers(defaultPlayers);
    setCommunityCards(defaultCommunityCards);
    setOdds([]);
    setSelectedPosition({ playerIndex: 0, cardIndex: 0 });

    if (typeof window !== "undefined") {
      try {
        localStorage.removeItem("poker-odds-players");
        localStorage.removeItem("poker-odds-community-cards");
      } catch (error) {
        console.error("Error clearing cache:", error);
      }
    }
  };

  const addPlayer = () => {
    const newId = (
      Math.max(...players.map((p) => Number.parseInt(p.id, 10)), 0) + 1
    ).toString();
    setPlayers([
      ...players,
      {
        id: newId,
        name: `Player ${newId}`,
        cards: [null, null],
      },
    ]);
  };

  const removePlayer = (index: number) => {
    if (players.length <= 2) return;

    const newPlayers = players.filter((_, i) => i !== index);
    setPlayers(newPlayers);

    setSelectedPosition({ playerIndex: 0, cardIndex: 0 });
  };

  return {
    players,
    communityCards,
    odds,
    isCalculating,
    selectedPosition,
    usedCards,
    isSingleHandMode,
    handleCardSelect,
    handleCardRemove,
    clearAll,
    addPlayer,
    removePlayer,
    setSelectedPosition,
  };
}
