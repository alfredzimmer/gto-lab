export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K"
  | "A";

export interface Card {
  rank: Rank;
  suit: Suit;
}

export interface Player {
  id: string;
  name: string;
  cards: [Card | null, Card | null];
}

export interface OddsResult {
  playerId: string;
  playerName: string;
  winPercentage: number;
  tiePercentage: number;
}

export interface GameState {
  players: Player[];
  communityCards: (Card | null)[];
  odds: OddsResult[];
}
