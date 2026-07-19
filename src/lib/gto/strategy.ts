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
  FEATURE_DIM,
  type History,
  MAX_ACTIONS,
  aggressiveAmounts,
  currentPlayer,
  infosetFeatures,
  isChance,
  isTerminal,
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
export async function getStrategy(h: History): Promise<ActionProb[]> {
  const { ort, session } = await loadStrategySession();
  const features = infosetFeatures(h);
  const input = new ort.Tensor("float32", features, [1, FEATURE_DIM]);
  const output = await session.run({ features: input });
  const logits = output.action_logits.data as Float32Array;

  const actions = legalActions(h);
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

/**
 * Deal a practice spot: play a full hand with BOTH seats sampling from
 * the GTO strategy, collect the hero seat's decision points, and pick one
 * uniformly at random to quiz the user on. This makes spot frequencies
 * match what the solved strategy actually reaches (no made-up lines).
 */
export async function generateScenario(): Promise<GtoScenario> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const heroSeat = Math.random() < 0.5 ? 0 : 1;
    let h: History = [];
    const heroDecisions: History[] = [];

    while (!isTerminal(h)) {
      if (isChance(h)) {
        h = [...h, sampleChance(h)];
        continue;
      }
      if (currentPlayer(h) === heroSeat) {
        heroDecisions.push([...h]);
      }
      const probs = await getStrategy(h);
      h = [...h, sampleFrom(probs)];
    }

    if (heroDecisions.length > 0) {
      const pick =
        heroDecisions[Math.floor(Math.random() * heroDecisions.length)];
      return { history: pick, heroSeat };
    }
  }
  throw new Error("could not generate a scenario with a hero decision");
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

export interface SpotInfo {
  heroCards: [Card, Card];
  board: Card[];
  street: number;
  streetName: string;
  potBB: number;
  toCallBB: number;
  heroStackBB: number;
  villainStackBB: number;
  actionLabels: Record<string, string>;
  lineDescription: string[];
}

const STREET_NAMES = ["Preflop", "Flop", "Turn", "River"];

/** Everything the UI needs to render a decision spot, in big blinds. */
export function describeSpot(h: History, heroSeat: number): SpotInfo {
  const s = parseHistory(h);
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
      token === "a" ? "All-in" : token === "b0" ? "½ pot" : "pot";
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
    heroStackBB: (200 - s.contrib[p]) / 2,
    villainStackBB: (200 - s.contrib[1 - p]) / 2,
    actionLabels,
    lineDescription: describeLine(h, heroSeat),
  };
}

/** Human-readable action line, e.g. "Preflop: You raise to 3 BB, Villain calls". */
function describeLine(h: History, heroSeat: number): string[] {
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
    const s = parseHistory(replay);
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
