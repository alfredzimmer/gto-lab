/**
 * Monte-Carlo EV of every legal action at a hero decision node.
 *
 * The trainer used to grade a decision by the *frequency* the solver gives
 * it, which is the wrong yardstick in a mixed equilibrium: at equilibrium
 * every action in the support has the same EV, so a 12%-frequency call costs
 * nothing, while a 25%-frequency bluff on the wrong board can cost real
 * chips. What a player needs to know is chips given up, not frequency missed.
 *
 * EV(a) is estimated by rolling the hand out from `h + a` with both seats
 * sampling from the strategy net, marginalizing the villain's hole cards over
 * the same Bayesian posterior the LBR exploiter uses (`villainPosterior`),
 * and averaging the hero's terminal return.
 *
 * Two choices are what make the output a number rather than noise:
 *
 *  - **Common random numbers.** Sample `i` draws ONE villain hand and ONE
 *    shuffled deck, and every candidate action replays that same world. The
 *    trainer only ever displays EV *differences*, and pairing cancels most of
 *    the runout variance out of them — it also means the standard error of a
 *    difference can be measured directly from the paired per-sample deltas
 *    instead of being inferred from two independent means.
 *  - **The anchor is the solver's own mix, not the argmax of these
 *    estimates.** Taking the best of six noisy estimates would inflate every
 *    reported loss by roughly the estimation error (winner's curse);
 *    `sum pi(a) * EV(a)` uses fixed weights and stays unbiased.
 */

import {
  ACTION_INDEX,
  FEATURE_DIM,
  type History,
  MAX_ACTIONS,
  type ParsedState,
  STACK,
  compareScores,
  evaluate7,
  infosetFeatures,
  legalActionsFor,
  parseHistory,
  terminalReturns,
} from "./holdem";
import {
  type ActionProb,
  type VillainPosterior,
  runStrategyBatch,
  villainPosterior,
} from "./strategy";

/**
 * Rollouts per candidate action. Every action shares the same `samples`
 * worlds, so total work is `samples * legalActions`, batched into one forward
 * pass per depth level rather than per world.
 *
 * This whole rollout runs inside a single macrotask — ORT's wasm session
 * resolves without ever yielding — which is why it lives in a worker
 * (ev.worker.ts). On the main thread its cost was a visible freeze and capped
 * this constant at 1000; off it, the only cost left is how long a user who
 * acts instantly waits for the verdict, since the rollout otherwise finishes
 * during their thinking time.
 *
 * Measured in-browser against the shipped model, 16 spots per setting,
 * always clicking the lowest-frequency action (the worst case for the error
 * bar, and the one the "within noise" gate was wrongly forgiving):
 *
 *   samples | SE p75 | wait after an instant click (median / max)
 *      1000 |   1.22 |  117ms /  224ms
 *      4000 |   0.47 |  179ms /  666ms
 *      8000 |   0.47 |  647ms / 1175ms
 *
 * 4000 takes the error bar down by more than half — which is what decides
 * whether a real leak clears the 2-SE gate in verdict() — while keeping the
 * worst case under a second. 8000 buys no measurable extra precision here and
 * costs a visible hang.
 */
export const DEFAULT_EV_SAMPLES = 4000;

/**
 * Board runouts averaged over when a world reaches an all-in that has been
 * called. See `allInReturn` — this is the single biggest variance knob, and
 * it is cheap because that branch queries the network zero more times.
 */
const ALL_IN_RUNOUTS = 32;

export interface ActionEv {
  action: string;
  /** Hero EV in BB from taking this action, then playing the equilibrium. */
  evBB: number;
  /** `mixEvBB - evBB`: chips given up versus following the solver's mix. */
  lossBB: number;
  /** Standard error of `lossBB`, from the paired per-sample deltas. */
  lossSeBB: number;
}

export interface EvReport {
  /** One entry per legal action, in `legalActions` order. */
  actions: ActionEv[];
  /** EV in BB of following the solver's own mix at this node. */
  mixEvBB: number;
  /** Rollouts per action. */
  samples: number;
}

interface World {
  history: History;
  /** Shared across this sample's actions and never mutated. */
  deck: readonly number[];
  deckPos: number;
  actionIdx: number;
  sampleIdx: number;
  /** Parsed state while the world is waiting on a decision. */
  pending: ParsedState | null;
  ret: number | null;
}

/** Fisher-Yates over the cards not in `dead`. */
function shuffledRemaining(dead: ReadonlySet<number>): number[] {
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) if (!dead.has(c)) deck.push(c);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** Binary search a cumulative-weight array for a uniform draw in [0, total). */
function pickWeighted(cum: Float64Array, total: number): number {
  const target = Math.random() * total;
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Sample a legal action from one row of network logits, mirroring
 * `getStrategy`'s clip-and-normalize (uniform when no legal logit is
 * positive) so rollouts follow exactly the strategy the trainer displays.
 */
function sampleAction(
  logits: Float32Array,
  offset: number,
  legal: string[],
): string {
  const clipped: number[] = [];
  let total = 0;
  for (const a of legal) {
    const v = Math.max(logits[offset + ACTION_INDEX[a]], 0);
    clipped.push(v);
    total += v;
  }
  if (total <= 0) return legal[Math.floor(Math.random() * legal.length)];
  let r = Math.random() * total;
  for (let i = 0; i < legal.length; i++) {
    r -= clipped[i];
    if (r <= 0) return legal[i];
  }
  return legal[legal.length - 1];
}

/**
 * Hero's expected BB return once betting is dead (someone is all-in and has
 * been called) but the board is incomplete, averaged over `ALL_IN_RUNOUTS`
 * random completions.
 *
 * Dealing a single runout here would be unbiased but ruinously noisy: it
 * settles a stack-sized pot on one coin flip, and that one branch dominated
 * the standard error of every spot where jamming is an option — a preflop
 * shove came back as "-2.36 +/- 2.08 BB", i.e. a blunder the rollout could
 * not distinguish from equilibrium. Averaging replaces that draw with its
 * conditional expectation (Rao-Blackwellization): identical mean, a fraction
 * of the variance, and no extra network queries, since no one acts again.
 */
function allInReturn(
  h: History,
  s: ParsedState,
  heroSeat: number,
  runouts: number,
): number {
  const hero: [number, number] = [
    h[2 * heroSeat] as number,
    h[2 * heroSeat + 1] as number,
  ];
  const villainSeat = 1 - heroSeat;
  const villain: [number, number] = [
    h[2 * villainSeat] as number,
    h[2 * villainSeat + 1] as number,
  ];
  // Stakes are fixed now that betting is closed, and are read the same way
  // terminalReturns reads them so an all-in for less still settles correctly.
  const heroLoses = s.contrib[heroSeat] / 2;
  const heroWins = s.contrib[villainSeat] / 2;

  const base = new Set<number>([...hero, ...villain, ...s.board]);

  let total = 0;
  for (let k = 0; k < runouts; k++) {
    const dead = new Set(base);
    const full = s.board.slice();
    while (full.length < 5) {
      const c = Math.floor(Math.random() * 52);
      if (!dead.has(c)) {
        dead.add(c);
        full.push(c);
      }
    }
    const cmp = compareScores(
      evaluate7([...hero, ...full]),
      evaluate7([...villain, ...full]),
    );
    if (cmp > 0) total += heroWins;
    else if (cmp < 0) total -= heroLoses;
  }
  return total / runouts;
}

/**
 * EV of every legal action at the hero's decision node `h`, plus what each
 * one gives up against the solver's mix. Independent of which action the
 * player actually picks, so the trainer can run this during thinking time and
 * have the answer ready the moment they act.
 *
 * `strategy` is the net's distribution at this node (i.e. `getStrategy(h)`) —
 * passed in rather than recomputed because the caller already has it.
 */
export async function evaluateActions(
  h: History,
  heroSeat: number,
  strategy: ActionProb[],
  options: {
    stack?: number;
    samples?: number;
    /** Reuse an already-computed posterior instead of querying the net again. */
    posterior?: VillainPosterior;
  } = {},
): Promise<EvReport> {
  const stack = options.stack ?? STACK;
  const samples = options.samples ?? DEFAULT_EV_SAMPLES;

  const root = parseHistory(h, stack);
  if (root.status !== "act" || root.toAct !== heroSeat) {
    throw new Error("evaluateActions expects a hero decision node");
  }
  const actions = legalActionsFor(root);

  const { pairs, weights } =
    options.posterior ?? (await villainPosterior(h, heroSeat, stack));

  const cum = new Float64Array(weights.length);
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    total += weights[i];
    cum[i] = total;
  }
  if (total <= 0) {
    // Degenerate posterior (every combo ruled out) — fall back to the
    // blocker-only uniform range, matching heroEquityVsRange.
    for (let i = 0; i < cum.length; i++) cum[i] = i + 1;
    total = cum.length;
  }

  const heroCards = [h[2 * heroSeat] as number, h[2 * heroSeat + 1] as number];
  const villainSeat = 1 - heroSeat;

  const worlds: World[] = [];
  for (let i = 0; i < samples; i++) {
    const [va, vb] = pairs[pickWeighted(cum, total)];
    // One deck order per sample, shared by every action below it: that
    // shared runout is what makes the EV differences low-variance.
    const deck = shuffledRemaining(
      new Set([heroCards[0], heroCards[1], va, vb, ...root.board]),
    );
    const base = h.slice() as History;
    base[2 * villainSeat] = va;
    base[2 * villainSeat + 1] = vb;
    for (let a = 0; a < actions.length; a++) {
      worlds.push({
        history: [...base, actions[a]],
        deck,
        deckPos: 0,
        actionIdx: a,
        sampleIdx: i,
        pending: null,
        ret: null,
      });
    }
  }

  // Advance all worlds in lockstep, batching every decision node that comes
  // due into a single forward pass. Rolling each world out sequentially would
  // instead be thousands of one-row session.run() calls, which the wasm
  // runtime's per-call overhead makes far slower than the arithmetic.
  const batch: World[] = [];
  for (;;) {
    batch.length = 0;
    for (const w of worlds) {
      if (w.ret !== null) continue;
      for (;;) {
        const s = parseHistory(w.history, stack);
        if (s.status === "fold" || s.status === "showdown") {
          w.ret = terminalReturns(w.history, stack)[heroSeat];
          break;
        }
        if (s.status === "act") {
          w.pending = s;
          batch.push(w);
          break;
        }
        // Chance node. If either stack is already in, nobody acts again and
        // the rest of the hand is pure runout — take its expectation instead
        // of dealing one, which is where nearly all the variance lived.
        if (s.contrib[0] >= s.stack || s.contrib[1] >= s.stack) {
          w.ret = allInReturn(w.history, s, heroSeat, ALL_IN_RUNOUTS);
          break;
        }
        w.history.push(w.deck[w.deckPos++]);
      }
    }
    if (batch.length === 0) break;

    const feats = new Float32Array(batch.length * FEATURE_DIM);
    for (let r = 0; r < batch.length; r++) {
      feats.set(infosetFeatures(batch[r].history, stack), r * FEATURE_DIM);
    }
    const logits = await runStrategyBatch(feats, batch.length);
    for (let r = 0; r < batch.length; r++) {
      const w = batch[r];
      const legal = legalActionsFor(w.pending as ParsedState);
      w.history.push(sampleAction(logits, r * MAX_ACTIONS, legal));
    }
  }

  // rets[a][i] — hero's BB result for action `a` in world `i`.
  const rets = actions.map(() => new Float64Array(samples));
  for (const w of worlds) rets[w.actionIdx][w.sampleIdx] = w.ret as number;

  // Mix weights come from the net, renormalized over exactly the actions
  // evaluated here: getStrategy already masks to them, but an action missing
  // from `strategy` must not silently drop probability mass from the anchor.
  const raw = actions.map(
    (a) => strategy.find((p) => p.action === a)?.probability ?? 0,
  );
  const rawTotal = raw.reduce((s, v) => s + v, 0);
  const pi =
    rawTotal > 0
      ? raw.map((v) => v / rawTotal)
      : raw.map(() => 1 / actions.length);

  const evBB = actions.map((_, a) => {
    let sum = 0;
    for (let i = 0; i < samples; i++) sum += rets[a][i];
    return sum / samples;
  });
  const mixEvBB = evBB.reduce((s, v, a) => s + pi[a] * v, 0);

  // Per-sample mix return, so each action's loss is a paired difference
  // within one world rather than a difference of two independent means.
  const mixRet = new Float64Array(samples);
  for (let i = 0; i < samples; i++) {
    let m = 0;
    for (let a = 0; a < actions.length; a++) m += pi[a] * rets[a][i];
    mixRet[i] = m;
  }

  const report: ActionEv[] = actions.map((action, a) => {
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < samples; i++) {
      const d = mixRet[i] - rets[a][i];
      sum += d;
      sumSq += d * d;
    }
    const mean = sum / samples;
    // Population variance of the paired deltas; SE of the mean with the
    // n-1 correction folded in is sqrt(var / (n - 1)).
    const variance = Math.max(sumSq / samples - mean * mean, 0);
    return {
      action,
      evBB: evBB[a],
      lossBB: mean,
      lossSeBB: samples > 1 ? Math.sqrt(variance / (samples - 1)) : 0,
    };
  });

  return { actions: report, mixEvBB, samples };
}
