/**
 * Range-grid computation for the GTO explorer: for a public action line
 * (betting tokens + board cards, no hole cards), evaluate the strategy
 * network for every one of the 169 starting-hand classes of the player to
 * act, producing the classic 13x13 matrix of action mixes.
 *
 * A hand class ("AKs", "77", "T9o") expands to its concrete combos
 * (pairs 6, suited 4, offsuit 12; fewer when board cards block them).
 * Class probabilities are the average over live combos -- the network is
 * evaluated per combo because postflop strategy legitimately depends on
 * exact suits (flush draws), and even preflop the net is only
 * approximately suit-symmetric.
 *
 * The opponent's hole cards never enter the acting player's infoset
 * features, so each row uses arbitrary non-colliding placeholder cards
 * for the opponent slots.
 */

import {
  FEATURE_DIM,
  type History,
  type HistoryToken,
  MAX_ACTIONS,
  currentPlayer,
  infosetFeatures,
  isChance,
  isTerminal,
  legalActions,
  parseHistory,
} from "./holdem";

export const RANK_CHARS = [
  "A",
  "K",
  "Q",
  "J",
  "T",
  "9",
  "8",
  "7",
  "6",
  "5",
  "4",
  "3",
  "2",
] as const;

/** rank index used by the engine (12 = A ... 0 = 2) for grid position i (0 = A row/col). */
function engineRank(gridIndex: number): number {
  return 12 - gridIndex;
}

export interface HandClass {
  label: string;
  /** grid row/col, 0 = Ace. Suited above the diagonal (col > row). */
  row: number;
  col: number;
  kind: "pair" | "suited" | "offsuit";
}

export function handClasses(): HandClass[] {
  const out: HandClass[] = [];
  for (let row = 0; row < 13; row++) {
    for (let col = 0; col < 13; col++) {
      const hi = RANK_CHARS[Math.min(row, col)];
      const lo = RANK_CHARS[Math.max(row, col)];
      if (row === col)
        out.push({ label: `${hi}${lo}`, row, col, kind: "pair" });
      else if (col > row)
        out.push({ label: `${hi}${lo}s`, row, col, kind: "suited" });
      else out.push({ label: `${hi}${lo}o`, row, col, kind: "offsuit" });
    }
  }
  return out;
}

/** Concrete combos (pairs of card ints) for a class, excluding dead cards. */
export function combosFor(
  cls: HandClass,
  dead: Set<number>,
): [number, number][] {
  const rHi = engineRank(Math.min(cls.row, cls.col));
  const rLo = engineRank(Math.max(cls.row, cls.col));
  const out: [number, number][] = [];
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (cls.kind === "pair" && s2 <= s1) continue;
      if (cls.kind === "suited" && s1 !== s2) continue;
      if (cls.kind === "offsuit" && s1 === s2) continue;
      const a = s1 * 13 + rHi;
      const b = s2 * 13 + rLo;
      if (dead.has(a) || dead.has(b)) continue;
      out.push([a, b]);
    }
  }
  return out;
}

/** Two placeholder cards for the non-acting player's hole slots. */
function placeholders(dead: Set<number>): [number, number] {
  const found: number[] = [];
  for (let c = 0; c < 52 && found.length < 2; c++) {
    if (!dead.has(c)) found.push(c);
  }
  return [found[0], found[1]];
}

export function boardCardsOf(tokens: HistoryToken[]): number[] {
  return tokens.filter((t): t is number => typeof t === "number");
}

/**
 * Full history for navigation queries (current player, legal actions,
 * chance/terminal status) -- all independent of hole-card values, so
 * placeholder holes are fine.
 */
export function navigationHistory(tokens: HistoryToken[]): History {
  const board = new Set(boardCardsOf(tokens));
  const [d0, d1] = placeholders(board);
  const more = new Set([...board, d0, d1]);
  const [d2, d3] = placeholders(more);
  return [d0, d1, d2, d3, ...tokens];
}

/** One concrete combo of a hand class with its exact strategy. */
export interface ComboStrategy {
  /** the two card ints, higher rank first, in canonical suit order */
  cards: [number, number];
  /** action probabilities aligned with `actions` */
  probs: number[];
}

export interface RangeCell extends HandClass {
  /** live combo count after dead-card removal (0 when fully blocked) */
  combos: number;
  /** avg action probabilities aligned with `actions`; null when blocked */
  probs: number[] | null;
  /**
   * Every live combo of this class with its exact strategy, in canonical
   * suit order. Postflop the exact suits can change the play (a flush draw
   * bets where the off-suit combos check), so these are not always equal;
   * when the suits are irrelevant every entry shares the same probs. Empty
   * when the class is fully blocked by the board.
   */
  comboList: ComboStrategy[];
}

export interface RangeGrid {
  cells: RangeCell[];
  /** legal action tokens at this node, canonical order */
  actions: string[];
  /** combo-weighted average mix across the whole range */
  aggregate: number[];
  actingSeat: number;
}

export type BatchRunner = (
  features: Float32Array,
  rows: number,
) => Promise<Float32Array>;

/** Strategy probs from raw logits for one row, over given action indices. */
function probsFromLogits(logits: Float32Array, indices: number[]): number[] {
  const clipped = indices.map((i) => Math.max(logits[i], 0));
  const total = clipped.reduce((s, v) => s + v, 0);
  if (total <= 0) return indices.map(() => 1 / indices.length);
  return clipped.map((v) => v / total);
}

export async function computeRangeGrid(
  tokens: HistoryToken[],
  runBatch: BatchRunner,
  actionIndexOf: Record<string, number>,
): Promise<RangeGrid> {
  const nav = navigationHistory(tokens);
  if (isChance(nav) || isTerminal(nav)) {
    throw new Error("not a decision node");
  }
  const actingSeat = currentPlayer(nav);
  const actions = legalActions(nav);
  const indices = actions.map((a) => actionIndexOf[a]);
  const board = new Set(boardCardsOf(tokens));

  const classes = handClasses();
  const rows: { cls: HandClass; combos: [number, number][] }[] = classes.map(
    (cls) => ({ cls, combos: combosFor(cls, board) }),
  );
  const flatCombos = rows.flatMap((r) => r.combos);

  const features = new Float32Array(flatCombos.length * FEATURE_DIM);
  flatCombos.forEach((combo, i) => {
    const dead = new Set([...board, ...combo]);
    const [d0, d1] = placeholders(dead);
    const h: History =
      actingSeat === 0
        ? [combo[0], combo[1], d0, d1, ...tokens]
        : [d0, d1, combo[0], combo[1], ...tokens];
    features.set(infosetFeatures(h), i * FEATURE_DIM);
  });

  const logits = await runBatch(features, flatCombos.length);

  const cells: RangeCell[] = [];
  const aggregate = indices.map(() => 0);
  let aggregateWeight = 0;
  let offset = 0;
  for (const { cls, combos } of rows) {
    if (combos.length === 0) {
      cells.push({ ...cls, combos: 0, probs: null, comboList: [] });
      continue;
    }
    const avg = indices.map(() => 0);
    const comboList: ComboStrategy[] = [];
    for (let k = 0; k < combos.length; k++) {
      const row = logits.subarray(
        (offset + k) * MAX_ACTIONS,
        (offset + k) * MAX_ACTIONS + MAX_ACTIONS,
      );
      const p = probsFromLogits(row, indices);
      for (let a = 0; a < avg.length; a++) avg[a] += p[a];
      comboList.push({ cards: combos[k], probs: p });
    }
    offset += combos.length;
    for (let a = 0; a < avg.length; a++) avg[a] /= combos.length;
    cells.push({ ...cls, combos: combos.length, probs: avg, comboList });
    for (let a = 0; a < avg.length; a++) aggregate[a] += avg[a] * combos.length;
    aggregateWeight += combos.length;
  }
  for (let a = 0; a < aggregate.length; a++) aggregate[a] /= aggregateWeight;

  return { cells, actions, aggregate, actingSeat };
}

/** Pot / to-call / street summary for the explorer header. */
export function nodeSummary(tokens: HistoryToken[]) {
  const nav = navigationHistory(tokens);
  const s = parseHistory(nav);
  const p = s.toAct;
  return {
    street: s.street,
    potBB: (s.contrib[0] + s.contrib[1]) / 2,
    toCallBB: (s.streetContrib[1 - p] - s.streetContrib[p]) / 2,
    actingSeat: p,
  };
}
