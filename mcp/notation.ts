/**
 * Translation between agent-friendly poker notation and the internal token
 * `History` the engine (src/lib/gto/holdem.ts) speaks. This is the whole
 * reason the MCP surface is usable: agents send cards like "As Kd", a board,
 * and a plain-English action line; this module turns that into a valid
 * History, and turns engine tokens back into readable labels.
 *
 * Card ints match the engine: rank = card % 13 (0 = deuce .. 12 = ace),
 * suit = floor(card / 13), order clubs(0) diamonds(1) hearts(2) spades(3).
 */

import {
  ALL_IN,
  CHECK_CALL,
  FOLD,
  type History,
  type HistoryToken,
  aggressiveAmounts,
  isChance,
  isTerminal,
  legalActions,
  parseHistory,
} from "../src/lib/gto/holdem";

const RANK_CHARS = "23456789TJQKA";
const SUIT_CHARS = "cdhs"; // clubs, diamonds, hearts, spades — engine order

/** Parse a single card like "As", "Td", "9h" (case-insensitive) to 0..51. */
export function parseCard(raw: string): number {
  const t = raw.trim();
  if (t.length < 2) throw new Error(`bad card "${raw}"`);
  // Rank may be one char (A,K,…,2) or the word "10".
  const rankStr = t
    .slice(0, t.length - 1)
    .toUpperCase()
    .replace("10", "T");
  const suitStr = t[t.length - 1].toLowerCase();
  const rank = RANK_CHARS.indexOf(rankStr);
  const suit = SUIT_CHARS.indexOf(suitStr);
  if (rank < 0) throw new Error(`bad rank in "${raw}" (use 2-9,T,J,Q,K,A)`);
  if (suit < 0) throw new Error(`bad suit in "${raw}" (use c,d,h,s)`);
  return suit * 13 + rank;
}

/** Parse "As Kd" / "Jh7c2s" / ["Jh","7c","2s"] to card ints. */
export function parseCards(raw: string | string[] | undefined): number[] {
  if (!raw) return [];
  const parts = Array.isArray(raw)
    ? raw
    : raw.trim().length === 0
      ? []
      : // split on whitespace/commas, or pack of 2-char cards ("Jh7c2s")
        (raw.match(/10[cdhs]|[2-9TJQKAtjqka][cdhs]/gi) ??
        raw.split(/[\s,]+/).filter(Boolean));
  return parts.map(parseCard);
}

export function cardToStr(c: number): string {
  return `${RANK_CHARS[c % 13]}${SUIT_CHARS[Math.floor(c / 13)]}`;
}

/**
 * Resolve one action-line entry (e.g. "BB raise 6", "check", "jam") to a legal
 * token at the current node. Position/actor words are ignored — the engine
 * already knows whose turn it is. A numeric bet size is snapped to the nearest
 * legal discrete size (the solver only knows ½-pot, pot, 2×pot, all-in), and a
 * size word (half/pot/overbet/all-in) maps directly.
 */
export function resolveActionToken(
  entry: string,
  h: History,
  stack: number,
): HistoryToken {
  const s = entry.toLowerCase();
  const legal = new Set(legalActions(h, stack));

  const want = (tok: string): HistoryToken => {
    if (!legal.has(tok)) {
      throw new Error(
        `"${entry}" resolves to ${tok}, illegal here (legal: ${[...legal].join(", ")})`,
      );
    }
    return tok;
  };

  if (/\bfold\b|^f$/.test(s)) return want(FOLD);
  if (/\ball[\s-]?in\b|\bjam\b|\bshove\b|^a$/.test(s)) return want(ALL_IN);
  // check/call before bet/raise so "check" isn't caught by a stray number.
  if (/\bcheck\b|\bcall\b|^c$/.test(s)) return want(CHECK_CALL);

  // Bet or raise: figure out which discrete size.
  const amounts = aggressiveAmounts(parseHistory(h, stack)); // token -> chip amt
  const aggTokens = Object.keys(amounts);
  if (aggTokens.length === 0) {
    throw new Error(`"${entry}" is a bet/raise but none is legal here`);
  }
  if (/\bover\b|\boverbet\b|2x|2 x|double/.test(s)) return want("b2");
  if (/half|1\/2|½/.test(s)) return want("b0");
  // "pot" (but not "half pot", handled above) maps to the pot-sized bet.
  if (/\bpot\b/.test(s) && amounts.b1 !== undefined) return want("b1");

  // Numeric size in big blinds -> nearest legal size (amounts are in 0.5bb).
  const num = s.match(/(\d+(?:\.\d+)?)/);
  if (num) {
    const targetBB = Number.parseFloat(num[1]);
    let best = aggTokens[0];
    let bestDiff = Number.POSITIVE_INFINITY;
    for (const tok of aggTokens) {
      const diff = Math.abs(amounts[tok] / 2 - targetBB);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = tok;
      }
    }
    return want(best);
  }

  // Bare "bet"/"raise" with no size: default to a pot-sized bet if available,
  // else the smallest legal aggressive size.
  return want(amounts.b1 !== undefined ? "b1" : aggTokens[0]);
}

/** Two/four distinct placeholder cards not colliding with `dead`. */
function placeholders(dead: Set<number>, count: number): number[] {
  const out: number[] = [];
  for (let c = 0; c < 52 && out.length < count; c++) {
    if (!dead.has(c)) {
      out.push(c);
      dead.add(c);
    }
  }
  return out;
}

export interface FriendlySpot {
  hero: string | string[];
  /** 0 = Button/SB, 1 = Big Blind. Accepts a string form via parseSeat. */
  heroSeat: number;
  board?: string | string[];
  line?: string | string[];
  stack: number;
}

/** "SB"/"BTN"/"button"/"0" -> 0 ; "BB"/"bigblind"/"1" -> 1. */
export function parseSeat(raw: string | number | undefined): number {
  if (raw === undefined) throw new Error("heroSeat/position is required");
  if (typeof raw === "number") return raw === 1 ? 1 : 0;
  const s = raw.toLowerCase();
  if (/bb|big/.test(s) || s === "1") return 1;
  if (/sb|btn|button|small|^0$/.test(s)) return 0;
  throw new Error(`unrecognized position "${raw}" (use SB/BTN or BB)`);
}

function normalizeLine(line: string | string[] | undefined): string[] {
  if (!line) return [];
  if (Array.isArray(line)) return line.filter((e) => e.trim().length > 0);
  return line
    .split(/[,;]/)
    .map((e) => e.trim())
    .filter(Boolean);
}

/**
 * Build the full History for a hero decision: hero cards in the hero's slot,
 * placeholders for the villain (whose cards never enter the acting player's
 * infoset), and the board interleaved into the action line at street
 * boundaries by replaying through the engine. Stops at the node reached after
 * the last action-line entry, which is the node to be queried.
 */
export function buildHistory(spot: FriendlySpot): {
  history: History;
  heroSeat: number;
} {
  const heroCards = parseCards(spot.hero);
  if (heroCards.length !== 2) {
    throw new Error('hero must be exactly two cards, e.g. "As Kd"');
  }
  const board = parseCards(spot.board);
  const line = normalizeLine(spot.line);
  const heroSeat = spot.heroSeat;
  const stack = spot.stack;

  const dead = new Set<number>([...heroCards, ...board]);
  const villain = placeholders(dead, 2);

  const h: History =
    heroSeat === 0
      ? [heroCards[0], heroCards[1], villain[0], villain[1]]
      : [villain[0], villain[1], heroCards[0], heroCards[1]];

  let bi = 0;
  let ti = 0;
  for (;;) {
    if (isChance(h, stack)) {
      if (bi >= board.length) {
        throw new Error(
          "the action line reaches a new street but not enough board cards were given",
        );
      }
      h.push(board[bi++]);
      continue;
    }
    if (isTerminal(h, stack)) {
      if (ti < line.length) {
        throw new Error("the action line continues past the end of the hand");
      }
      break;
    }
    if (ti >= line.length) break; // reached the node to query
    h.push(resolveActionToken(line[ti++], h, stack));
  }
  return { history: h, heroSeat };
}

/**
 * Build the *public* token list (board + actions, no hole cards) that
 * computeRangeGrid expects, from a friendly board + line. Uses placeholder
 * holes only to replay streets, then strips them.
 */
export function buildPublicTokens(spot: {
  board?: string | string[];
  line?: string | string[];
  stack: number;
}): HistoryToken[] {
  const board = parseCards(spot.board);
  const line = normalizeLine(spot.line);
  const stack = spot.stack;

  const dead = new Set<number>(board);
  const holes = placeholders(dead, 4);
  const h: History = [holes[0], holes[1], holes[2], holes[3]];

  let bi = 0;
  let ti = 0;
  for (;;) {
    if (isChance(h, stack)) {
      if (bi >= board.length) {
        throw new Error(
          "the action line reaches a new street but not enough board cards were given",
        );
      }
      h.push(board[bi++]);
      continue;
    }
    if (isTerminal(h, stack)) {
      if (ti < line.length) {
        throw new Error("the action line continues past the end of the hand");
      }
      break;
    }
    if (ti >= line.length) break;
    h.push(resolveActionToken(line[ti++], h, stack));
  }
  return h.slice(4);
}
