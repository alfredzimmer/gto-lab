"use server";

import { createDeck, shuffleArray } from "@/lib/deck";
import { calculateHandStrength } from "@/lib/calculator";
import { createClient } from "@/lib/supabase/server";
import type { Card } from "@/lib/types";

export interface PracticeState {
  heroHand: [Card, Card];
  villainHands: [Card, Card][];
  opponentCount: number;
  board: Card[];
  pot: number;
  bet: number;
  id: string;
}

export interface PracticeSettings {
  minOpponents: number;
  maxOpponents: number;
  difficulty: "easy" | "medium" | "hard";
}

export async function generatePracticeHand(
  settings: PracticeSettings = {
    minOpponents: 1,
    maxOpponents: 3,
    difficulty: "medium",
  },
): Promise<PracticeState> {
  const deck = shuffleArray(createDeck());

  const heroHand: [Card, Card] = [deck[0], deck[1]];

  const min = Math.max(1, Math.min(4, settings.minOpponents));
  const max = Math.max(min, Math.min(4, settings.maxOpponents));
  const opponentCount = Math.floor(Math.random() * (max - min + 1)) + min;

  const villainHands: [Card, Card][] = [];
  let cardIndex = 2;

  for (let i = 0; i < opponentCount; i++) {
    villainHands.push([deck[cardIndex], deck[cardIndex + 1]]);
    cardIndex += 2;
  }

  const boardSize = Math.floor(Math.random() * 3) + 3; // 3, 4, or 5
  const board = deck.slice(cardIndex, cardIndex + boardSize);

  const pot = Math.floor(Math.random() * 150) + 50; // Random pot size [50, 200]

  // Calculate Equity to determine a "smart" bet size
  const { winPercentage, tiePercentage } = calculateHandStrength(
    heroHand,
    board,
    opponentCount,
    20000,
  );

  const equity = (winPercentage + tiePercentage / 2) / 100;

  // Calculate Fair Bet (where EV = 0)
  // EV = (Equity * (Pot + 2*Bet)) - Bet = 0
  // Equity*Pot + 2*Equity*Bet - Bet = 0
  // Bet * (1 - 2*Equity) = Equity * Pot
  // Bet = (Equity * Pot) / (1 - 2*Equity)

  let bet: number;

  if (equity >= 0.5) {
    // If we are ahead (>50%), any bet is +EV to call (assuming 1:1 odds or better).
    // In reality, if we have >50% equity, we are the favorite.
    // The opponent betting into us when we are huge favorite is a "bluff" or "value cut".
    // Let's just set a standard bet size here, maybe 0.5x - 1.0x pot.
    const betMultiplier = 0.5 + Math.random() * 0.5;
    bet = Math.floor(pot * betMultiplier);
  } else {
    // We are the underdog (or close to flip).
    // Calculate the bet that makes it a close decision.
    const denominator = 1 - 2 * equity;

    if (denominator <= 0.05) {
      bet = pot;
    } else {
      const fairBet = (equity * pot) / denominator;

      let variationRange = 0.3; // Medium: 0.85 to 1.15
      let minVariation = 0.85;

      if (settings.difficulty === "easy") {
        variationRange = 0.5; // 0.75 to 1.25
        minVariation = 0.75;
      } else if (settings.difficulty === "hard") {
        variationRange = 0.15; // 0.925 to 1.075
        minVariation = 0.925;
      }

      const variation = minVariation + Math.random() * variationRange;
      bet = Math.floor(fairBet * variation);

      bet = Math.max(Math.floor(pot * 0.1), Math.min(bet, pot * 2));
    }
  }

  bet = Math.max(1, bet);

  return {
    heroHand,
    villainHands,
    opponentCount,
    board,
    pot,
    bet,
    id: Math.random().toString(36).substring(7),
  };
}

export async function savePracticeResult(
  state: PracticeState,
  decision: "call" | "fold",
  result: {
    equity: number;
    ev: number;
    correct: boolean;
  },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { success: true, message: "User not logged in" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .single();

  if (profileError && profileError.code !== "PGRST116") {
    return {
      success: false,
      error: `Failed to check profile: ${profileError.message}`,
    };
  }

  if (!profile) {
    const { error: createProfileError } = await supabase
      .from("profiles")
      .insert({
        id: user.id,
        email: user.email,
      });

    if (createProfileError) {
      return {
        success: false,
        error: `Failed to create user profile: ${createProfileError.message}`,
      };
    }
  }

  const { error } = await supabase.from("practice_logs").insert({
    user_id: user.id,
    hero_cards: state.heroHand,
    board_cards: state.board,
    villain_hands: state.villainHands,
    pot: state.pot,
    bet: state.bet,
    equity: result.equity,
    user_decision: decision,
    is_correct: result.correct,
    ev: Number(result.ev.toFixed(2)),
  });

  if (error) {
    return { success: false, error: error.message };
  } else {
    return { success: true };
  }
}
