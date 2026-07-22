/**
 * In-browser inference against the Deep CFR strategy network (ONNX) plus
 * practice-scenario generation for the GTO trainer.
 *
 * The network was trained by solver/scripts/train_holdem.py; its outputs
 * are (approximately) the iteration-weighted average strategy of Deep
 * CFR, which is what converges toward Nash equilibrium in this
 * heads-up abstraction. All inputs are encoded by the parity-tested
 * engine in holdem.ts.
 */

import type * as OrtTypes from "onnxruntime-web";
import type { Card, Rank, Suit } from "@/lib/types";
import {
  ACTION_INDEX,
  ALL_IN,
  FEATURE_DIM,
  FOLD,
  type History,
  MAX_ACTIONS,
  STACK,
  aggressiveAmounts,
  compareScores,
  currentPlayer,
  evaluate7,
  infosetFeatures,
  isChance,
  isTerminal,
  legalActionIndices,
  legalActions,
  parseHistory,
} from "./holdem";

const MODEL_URL = "/models/holdem_strategy.onnx";

interface OrtRuntime {
  ort: typeof OrtTypes;
  session: OrtTypes.InferenceSession;
}

let runtimePromise: Promise<OrtRuntime> | null = null;

export function loadStrategySession(): Promise<OrtRuntime> {
  if (!runtimePromise) {
    // Dynamic import for two reasons: onnxruntime-web's module evaluation
    // throws under Node, so a static import breaks the SSR pass of any
    // page importing this file; and we want the wasm-only bundle (the
    // default entry pulls the 26MB WebGPU/JSEP runtime our <1MB MLP
    // doesn't need). public/ort/ holds the matching runtime files,
    // staged by scripts/copy-ort-wasm.mjs.
    runtimePromise = import("onnxruntime-web/wasm").then(async (ort) => {
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = 1;
      const session = await ort.InferenceSession.create(MODEL_URL, {
        executionProviders: ["wasm"],
      });
      return { ort: ort as unknown as typeof OrtTypes, session };
    });
  }
  return runtimePromise;
}

export interface ActionProb {
  action: string;
  probability: number;
}

/** Raw action logits for a batch of feature rows (rows x MAX_ACTIONS). */
export async function runStrategyBatch(
  features: Float32Array,
  rows: number,
): Promise<Float32Array> {
  const { ort, session } = await loadStrategySession();
  const input = new ort.Tensor("float32", features, [rows, FEATURE_DIM]);
  const output = await session.run({ features: input });
  return output.action_logits.data as Float32Array;
}

/** GTO action distribution at a decision node (legal actions only). */
export async function getStrategy(
  h: History,
  stack: number = STACK,
): Promise<ActionProb[]> {
  const { ort, session } = await loadStrategySession();
  const features = infosetFeatures(h, stack);
  const input = new ort.Tensor("float32", features, [1, FEATURE_DIM]);
  const output = await session.run({ features: input });
  const logits = output.action_logits.data as Float32Array;

  const actions = legalActions(h, stack);
  const clipped = actions.map((a) => Math.max(logits[ACTION_INDEX[a]], 0));
  const total = clipped.reduce((s, v) => s + v, 0);
  if (total <= 0) {
    return actions.map((action) => ({
      action,
      probability: 1 / actions.length,
    }));
  }
  return actions.map((action, i) => ({
    action,
    probability: clipped[i] / total,
  }));
}

function sampleFrom(probs: ActionProb[]): string {
  let r = Math.random();
  for (const { action, probability } of probs) {
    r -= probability;
    if (r <= 0) return action;
  }
  return probs[probs.length - 1].action;
}

function sampleChance(h: History): number {
  const used = new Set(h.filter((t): t is number => typeof t === "number"));
  const remaining: number[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) remaining.push(c);
  return remaining[Math.floor(Math.random() * remaining.length)];
}

export interface GtoScenario {
  /** History truncated at the hero decision to present. */
  history: History;
  heroSeat: number;
}

/** GTO distribution with fold/all-in removed and the rest renormalized. */
function continuingProbs(probs: ActionProb[]): ActionProb[] {
  // Actions that keep the hand alive into the next street: never fold, and
  // never commit all-in. A fold ends the hand; a called all-in runs the board
  // out to showdown — either way there is no later decision, so these are
  // exactly the lines that could never have reached a deeper street anyway.
  // CHECK_CALL is always legal (holdem.ts), so this set is never empty, and
  // bet tokens here are strictly below all-in by construction.
  const cont = probs.filter(
    ({ action }) => action !== FOLD && action !== ALL_IN,
  );
  const total = cont.reduce((sum, { probability }) => sum + probability, 0);
  return total > 0
    ? cont.map((p) => ({ ...p, probability: p.probability / total }))
    : cont.map((p) => ({ ...p, probability: 1 / cont.length }));
}

/**
 * Deal a practice spot deterministically for a chosen street. Rather than
 * dealing random hands and hoping one lands on the wanted street (which skews
 * hard toward preflop — reached every hand — over the rare river), pick the
 * target street uniformly among the selected ones, then BUILD a single hand
 * that reaches it:
 *
 *   1. Drive the hand forward with BOTH seats sampling GTO-but-continuing
 *      actions (never fold, never all-in), so it can't end before the target
 *      street. This always terminates — the raise cap forces a closing
 *      check/call — and only ever plays real solved lines.
 *   2. On the target street, let the villain act with the full GTO strategy
 *      until it is the hero's turn, then quiz on that decision. The hero
 *      always gets a decision on the target street before it can close.
 *
 * Each selected street is shown with probability 1/N (1/4, 1/3, 1/2, or 1),
 * in one pass with no rejection loop.
 */
export async function generateScenario(
  streets: ReadonlySet<number> = new Set([0, 1, 2, 3]),
): Promise<GtoScenario> {
  const selected = [...streets];
  if (selected.length === 0) {
    throw new Error("no practice streets selected");
  }
  const targetStreet = selected[Math.floor(Math.random() * selected.length)];
  const heroSeat = Math.random() < 0.5 ? 0 : 1;

  let h: History = [];

  // Phase 1 — advance to the target street without letting the hand end.
  for (;;) {
    if (isChance(h)) {
      h = [...h, sampleChance(h)];
      continue;
    }
    if (parseHistory(h).street >= targetStreet) break;
    h = [...h, sampleFrom(continuingProbs(await getStrategy(h)))];
  }

  // Phase 2 — reach the hero's decision on the target street.
  for (;;) {
    if (isChance(h)) {
      h = [...h, sampleChance(h)];
      continue;
    }
    if (currentPlayer(h) === heroSeat) {
      return { history: h, heroSeat };
    }
    h = [...h, sampleFrom(await getStrategy(h))];
  }
}

/**
 * Live-play driver: advance a hand through chance nodes (dealing holes and
 * board) and bot turns (sampling from the GTO strategy over its range) until
 * either the hero must act or the hand is terminal. This is the same self-play
 * loop as generateScenario, except the hero seat's actions are supplied by the
 * caller instead of sampled. Callers must handle an already-terminal return
 * (e.g. the bot folds the small blind before the hero ever acts) and, after a
 * hero action, call this again — it also runs the board out after an all-in
 * straight to showdown.
 */
export async function advanceHand(
  h: History,
  heroSeat: number,
  stack: number = STACK,
): Promise<History> {
  let history = h;
  while (!isTerminal(history, stack)) {
    if (isChance(history, stack)) {
      history = [...history, sampleChance(history)];
      continue;
    }
    if (currentPlayer(history, stack) === heroSeat) break;
    const probs = await getStrategy(history, stack);
    history = [...history, sampleFrom(probs)];
  }
  return history;
}

// ---- Equity estimation ----

/** Opponent hole-card pairs not blocked by the given dead cards. */
export function candidatePairs(dead: Set<number>): [number, number][] {
  const pairs: [number, number][] = [];
  for (let a = 0; a < 52; a++) {
    if (dead.has(a)) continue;
    for (let b = a + 1; b < 52; b++) {
      if (!dead.has(b)) pairs.push([a, b]);
    }
  }
  return pairs;
}

/**
 * Bayes-update the posterior weights over the villain's hole cards after the
 * villain takes `action` at decision node `node`. For every candidate pair we
 * substitute it into the villain's hole slots, query the strategy net, and
 * multiply the weight by the probability that hand assigns to the action taken
 * — mirroring the net's clip-and-normalize (uniform fallback when a row has no
 * positive legal logit). This is exactly the range model the solver's LBR
 * exploiter uses (poker_solver/eval/lbr.py, RangeTracker.observe_action).
 */
async function bayesUpdate(
  node: History,
  action: string,
  villainSeat: number,
  pairs: [number, number][],
  weights: Float32Array,
  stack: number,
): Promise<void> {
  const legalIdx = legalActionIndices(node, stack);
  const takenIdx = ACTION_INDEX[action];
  const base = 2 * villainSeat;
  const feats = new Float32Array(pairs.length * FEATURE_DIM);
  for (let r = 0; r < pairs.length; r++) {
    const hyp = node.slice() as History;
    hyp[base] = pairs[r][0];
    hyp[base + 1] = pairs[r][1];
    feats.set(infosetFeatures(hyp, stack), r * FEATURE_DIM);
  }
  const logits = await runStrategyBatch(feats, pairs.length);
  for (let r = 0; r < pairs.length; r++) {
    const off = r * MAX_ACTIONS;
    let total = 0;
    for (const idx of legalIdx) total += Math.max(logits[off + idx], 0);
    weights[r] *=
      total > 0
        ? Math.max(logits[off + takenIdx], 0) / total
        : 1 / legalIdx.length;
  }
}

/** Posterior weights over villain pairs, from every villain action in `h`. */
async function villainRange(
  h: History,
  villainSeat: number,
  pairs: [number, number][],
  stack: number,
): Promise<Float32Array> {
  const weights = new Float32Array(pairs.length).fill(1);
  let prefix: History = h.slice(0, 4);
  for (let i = 4; i < h.length; i++) {
    const tok = h[i];
    if (
      typeof tok === "string" &&
      currentPlayer(prefix, stack) === villainSeat
    ) {
      await bayesUpdate(prefix, tok, villainSeat, pairs, weights, stack);
    }
    prefix = [...prefix, tok];
  }
  return weights;
}

/** Monte-Carlo showdown equity of the hero hand vs the weighted villain range. */
export function equityVsRange(
  heroCards: [number, number],
  board: number[],
  pairs: [number, number][],
  weights: Float32Array,
  samples: number,
): number {
  const cum = new Float64Array(weights.length);
  let running = 0;
  for (let i = 0; i < weights.length; i++) {
    running += weights[i];
    cum[i] = running;
  }
  const totalW = running;
  if (totalW <= 0) return Number.NaN;

  const need = 5 - board.length;
  let score = 0;
  for (let s = 0; s < samples; s++) {
    // Weighted pick of a villain pair (binary search over cumulative weights).
    const target = Math.random() * totalW;
    let lo = 0;
    let hi = cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const [va, vb] = pairs[lo];

    const dead = new Set<number>([
      heroCards[0],
      heroCards[1],
      va,
      vb,
      ...board,
    ]);
    const full = board.slice();
    while (full.length < board.length + need) {
      const c = Math.floor(Math.random() * 52);
      if (!dead.has(c)) {
        dead.add(c);
        full.push(c);
      }
    }
    // evaluate7 returns a [category, ...tiebreakers] tuple that must be
    // compared lexicographically — NOT with `>`/`===`, which coerce the arrays
    // to strings and give nonsense (e.g. a pair of 6s "beating" a pair of Ks).
    const cmp = compareScores(
      evaluate7([heroCards[0], heroCards[1], ...full]),
      evaluate7([va, vb, ...full]),
    );
    if (cmp > 0) score += 1;
    else if (cmp === 0) score += 0.5;
  }
  return score / samples;
}

/**
 * The hero's showdown equity against the villain's range at decision node `h`.
 * The range is the strategy net's own Bayesian posterior given every action
 * the villain has taken (so a hand that has bet is weighted toward value/bluff
 * combos the net would bet), and equity is estimated by Monte-Carlo board
 * runouts. Returns a probability in [0, 1]. This is the same quantity the LBR
 * exploiter reasons about, surfaced for the trainer's pot-odds comparison.
 */
export async function heroEquityVsRange(
  h: History,
  heroSeat: number,
  stack: number = STACK,
  samples = 2000,
): Promise<number> {
  const s = parseHistory(h, stack);
  const heroCards: [number, number] = [
    h[2 * heroSeat] as number,
    h[2 * heroSeat + 1] as number,
  ];
  const board = s.board.slice();
  const dead = new Set<number>([heroCards[0], heroCards[1], ...board]);
  const pairs = candidatePairs(dead);

  const weights = await villainRange(h, 1 - heroSeat, pairs, stack);
  let eq = equityVsRange(heroCards, board, pairs, weights, samples);
  if (Number.isNaN(eq)) {
    // Degenerate posterior (every combo ruled out) — fall back to the
    // blocker-only uniform range so we still return a sane number.
    weights.fill(1);
    eq = equityVsRange(heroCards, board, pairs, weights, samples);
  }
  return eq;
}

// ---- Presentation helpers ----

const RANK_BY_INDEX: Rank[] = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
];
const SUIT_BY_INDEX: Suit[] = ["clubs", "diamonds", "hearts", "spades"];

export function intToCard(c: number): Card {
  return {
    rank: RANK_BY_INDEX[c % 13],
    suit: SUIT_BY_INDEX[Math.floor(c / 13)],
  };
}

const HAND_CATEGORY_NAMES = [
  "High card",
  "Pair",
  "Two pair",
  "Three of a kind",
  "Straight",
  "Flush",
  "Full house",
  "Four of a kind",
  "Straight flush",
];

/**
 * Name the best five-card hand from a set of card ints (2 hole + up to 5
 * board). Needs the full 7 to be meaningful — returns null with fewer, so
 * callers can skip the label until the river/showdown.
 */
export function handRankName(cards: number[]): string | null {
  if (cards.length < 7) return null;
  return HAND_CATEGORY_NAMES[evaluate7(cards)[0]] ?? "High card";
}

export interface SpotInfo {
  heroCards: [Card, Card];
  board: Card[];
  street: number;
  streetName: string;
  potBB: number;
  toCallBB: number;
  heroStackBB: number;
  villainStackBB: number;
  /** 0 = Button/SB, 1 = Big Blind */
  heroSeat: number;
  actionLabels: Record<string, string>;
  lineDescription: string[];
}

const STREET_NAMES = ["Preflop", "Flop", "Turn", "River"];

/**
 * Break-even equity when facing a bet. `potBB` is the sum of both
 * players' contributions, so the outstanding bet is already in it;
 * calling `toCallBB` makes the final pot (pot + toCall), of which the
 * caller must win at least toCall / (pot + toCall).
 */
export function breakEvenEquity(potBB: number, toCallBB: number): number {
  return toCallBB / (potBB + toCallBB);
}

/** Everything the UI needs to render a decision spot, in big blinds. */
export function describeSpot(
  h: History,
  heroSeat: number,
  stack: number = STACK,
): SpotInfo {
  const s = parseHistory(h, stack);
  const p = s.toAct;
  const toCall = s.streetContrib[1 - p] - s.streetContrib[p];
  const amounts = aggressiveAmounts(s);

  const actionLabels: Record<string, string> = {
    f: "Fold",
    c: toCall > 0 ? `Call ${toCall / 2} BB` : "Check",
  };
  for (const [token, amount] of Object.entries(amounts)) {
    const added = (amount - s.streetContrib[p]) / 2;
    const verb = toCall > 0 ? "Raise to" : "Bet";
    const sizeName =
      token === "a"
        ? "All-in"
        : token === "b0"
          ? "½ pot"
          : token === "b1"
            ? "pot"
            : "2× pot";
    actionLabels[token] =
      token === "a"
        ? `All-in (${added} BB)`
        : `${verb} ${amount / 2} BB (${sizeName})`;
  }

  return {
    heroCards: [
      intToCard(h[2 * heroSeat] as number),
      intToCard(h[2 * heroSeat + 1] as number),
    ],
    board: s.board.map(intToCard),
    street: s.street,
    streetName: STREET_NAMES[s.street],
    potBB: (s.contrib[0] + s.contrib[1]) / 2,
    toCallBB: toCall / 2,
    heroStackBB: (stack - s.contrib[p]) / 2,
    villainStackBB: (stack - s.contrib[1 - p]) / 2,
    heroSeat,
    actionLabels,
    lineDescription: describeLine(h, heroSeat, stack),
  };
}

/** Human-readable action line, e.g. "Preflop: You raise to 3 BB, Villain calls". */
function describeLine(
  h: History,
  heroSeat: number,
  stack: number = STACK,
): string[] {
  const lines: string[] = [];
  let current: string[] = [];
  let street = 0;
  let replay: History = [h[0], h[1], h[2], h[3]];
  let cardsSeen = 0;

  const flush = () => {
    if (current.length > 0) {
      lines.push(`${STREET_NAMES[street]}: ${current.join(", ")}`);
      current = [];
    }
  };

  for (const tok of h.slice(4)) {
    if (typeof tok === "number") {
      cardsSeen += 1;
      replay = [...replay, tok];
      if (cardsSeen === 3 || cardsSeen === 4 || cardsSeen === 5) {
        flush();
        street = cardsSeen - 2;
      }
      continue;
    }
    const s = parseHistory(replay, stack);
    const actor = s.toAct === heroSeat ? "You" : "Villain";
    const toCall = s.streetContrib[1 - s.toAct] - s.streetContrib[s.toAct];
    const amounts = aggressiveAmounts(s);
    let desc: string;
    if (tok === "f") desc = `${actor} fold`;
    else if (tok === "c")
      desc = toCall > 0 ? `${actor} call` : `${actor} check`;
    else if (tok === "a") desc = `${actor} all-in`;
    else {
      const amount = amounts[tok];
      desc = `${actor} ${toCall > 0 ? "raise to" : "bet"} ${amount / 2} BB`;
    }
    current.push(desc);
    replay = [...replay, tok];
  }
  flush();
  return lines;
}

export { MAX_ACTIONS };
