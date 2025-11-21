import { create } from "zustand";
import { persist } from "zustand/middleware";
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

interface GameState {
  players: Player[];
  communityCards: (Card | null)[];
  odds: OddsResult[];
  isCalculating: boolean;
  selectedPosition: CardPosition;

  setSelectedPosition: (position: CardPosition) => void;
  handleCardSelect: (card: Card) => void;
  handleCardRemove: (position: CardPosition) => void;
  clearAll: () => void;
  addPlayer: () => void;
  removePlayer: (index: number) => void;
}

const DEFAULT_PLAYERS: Player[] = [
  { id: "1", name: "Player 1", cards: [null, null] },
  { id: "2", name: "Player 2", cards: [null, null] },
];

const DEFAULT_COMMUNITY_CARDS: (Card | null)[] = [null, null, null, null, null];

export const useGameStore = create<GameState>()(
  persist(
    (set, get) => ({
      players: DEFAULT_PLAYERS,
      communityCards: DEFAULT_COMMUNITY_CARDS,
      odds: [],
      isCalculating: false,
      selectedPosition: { playerIndex: 0, cardIndex: 0 },

      setSelectedPosition: (position) => set({ selectedPosition: position }),

      handleCardSelect: (card) => {
        const { selectedPosition, communityCards, players } = get();
        if (!selectedPosition) return;

        if (
          "type" in selectedPosition &&
          selectedPosition.type === "community"
        ) {
          const newCommunityCards = [...communityCards];
          newCommunityCards[selectedPosition.cardIndex] = card;
          set({ communityCards: newCommunityCards });

          calculateGameOdds(players, newCommunityCards, set);

          setTimeout(() => {
            const nextPos = findNextEmptySlot(newCommunityCards, players);
            set({ selectedPosition: nextPos });
          }, 0);
        } else if ("playerIndex" in selectedPosition) {
          const newPlayers = [...players];
          newPlayers[selectedPosition.playerIndex] = {
            ...newPlayers[selectedPosition.playerIndex],
            cards: [...newPlayers[selectedPosition.playerIndex].cards] as [
              Card | null,
              Card | null,
            ],
          };

          newPlayers[selectedPosition.playerIndex].cards[
            selectedPosition.cardIndex
          ] = card;
          set({ players: newPlayers });

          calculateGameOdds(newPlayers, communityCards, set);

          setTimeout(() => {
            const nextPos = findNextEmptySlot(communityCards, newPlayers);
            set({ selectedPosition: nextPos });
          }, 0);
        }
      },

      handleCardRemove: (position) => {
        if (!position) return;
        const { communityCards, players } = get();

        if ("type" in position && position.type === "community") {
          const newCommunityCards = [...communityCards];
          newCommunityCards[position.cardIndex] = null;
          set({ communityCards: newCommunityCards });
          calculateGameOdds(players, newCommunityCards, set);
        } else if ("playerIndex" in position) {
          const newPlayers = [...players];
          newPlayers[position.playerIndex] = {
            ...newPlayers[position.playerIndex],
            cards: [...newPlayers[position.playerIndex].cards] as [
              Card | null,
              Card | null,
            ],
          };
          newPlayers[position.playerIndex].cards[position.cardIndex] = null;
          set({ players: newPlayers });
          calculateGameOdds(newPlayers, communityCards, set);
        }

        set({ selectedPosition: position });
      },

      clearAll: () => {
        set({
          players: DEFAULT_PLAYERS,
          communityCards: DEFAULT_COMMUNITY_CARDS,
          odds: [],
          selectedPosition: { playerIndex: 0, cardIndex: 0 },
        });
      },

      addPlayer: () => {
        const { players, communityCards } = get();
        const newId = (
          Math.max(...players.map((p) => Number.parseInt(p.id, 10)), 0) + 1
        ).toString();
        const newPlayers = [
          ...players,
          {
            id: newId,
            name: `Player ${newId}`,
            cards: [null, null] as [Card | null, Card | null],
          },
        ];
        set({ players: newPlayers });
        calculateGameOdds(newPlayers, communityCards, set);
      },

      removePlayer: (index) => {
        const { players, communityCards } = get();
        if (players.length <= 2) return;

        const newPlayers = players.filter((_, i) => i !== index);
        set({
          players: newPlayers,
          selectedPosition: { playerIndex: 0, cardIndex: 0 },
        });
        calculateGameOdds(newPlayers, communityCards, set);
      },
    }),
    {
      name: "poker-odds-storage",
      partialize: (state) => ({
        players: state.players,
        communityCards: state.communityCards,
        odds: state.odds,
      }),
    },
  ),
);

let calculationTimer: NodeJS.Timeout;

const calculateGameOdds = (
  players: Player[],
  communityCards: (Card | null)[],
  set: (
    partial: Partial<GameState> | ((state: GameState) => Partial<GameState>),
  ) => void,
) => {
  const validPlayers = players.filter((p) => p.cards[0] && p.cards[1]);

  if (validPlayers.length === 0) {
    set({ odds: [] });
    return;
  }

  set({ isCalculating: true });

  clearTimeout(calculationTimer);
  calculationTimer = setTimeout(() => {
    if (validPlayers.length === 1) {
      const player = validPlayers[0];
      const numOpponents = players.length - 1;

      const result = calculateHandStrength(
        [player.cards[0] as Card, player.cards[1] as Card],
        communityCards,
        numOpponents,
      );
      set({
        odds: [
          {
            playerId: player.id,
            playerName: `${player.name} vs ${numOpponents} opponent${
              numOpponents > 1 ? "s" : ""
            }`,
            winPercentage: result.winPercentage,
            tiePercentage: result.tiePercentage,
          },
        ],
        isCalculating: false,
      });
    } else {
      const result = calculateOdds(players, communityCards);
      set({ odds: result, isCalculating: false });
    }
  }, 100);
};

const findNextEmptySlot = (
  community: (Card | null)[],
  playersList: Player[],
): CardPosition => {
  for (let i = 0; i < playersList.length; i++) {
    if (!playersList[i].cards[0]) {
      return { playerIndex: i, cardIndex: 0 };
    }
    if (!playersList[i].cards[1]) {
      return { playerIndex: i, cardIndex: 1 };
    }
  }

  for (let i = 0; i < community.length; i++) {
    if (!community[i]) {
      return { type: "community", cardIndex: i };
    }
  }

  return null;
};
