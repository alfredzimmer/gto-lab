/**
 * Local, browser-persisted PnL session for the /play mode. Each hand restarts
 * both players at 100 BB (so the bot stays on its training distribution), and
 * the net result in big blinds accumulates across hands into a running curve.
 * Persisted to localStorage so the curve survives reloads.
 */

const KEY = "gto-lab:play:v1";

export type HandReason = "fold" | "showdown";

export interface HandResult {
  /** 1-based hand number within the session. */
  hand: number;
  /** Hero's net result for this hand, in big blinds. */
  deltaBB: number;
  /** Cumulative session PnL through this hand, in big blinds. */
  cumBB: number;
  reason: HandReason;
  ts: number;
}

export interface PlaySession {
  pnlBB: number;
  handsPlayed: number;
  results: HandResult[];
}

export function freshSession(): PlaySession {
  return { pnlBB: 0, handsPlayed: 0, results: [] };
}

function isSession(v: unknown): v is PlaySession {
  if (typeof v !== "object" || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    typeof s.pnlBB === "number" &&
    typeof s.handsPlayed === "number" &&
    Array.isArray(s.results)
  );
}

/** Load the persisted session, or a fresh one (also used during SSR). */
export function loadSession(): PlaySession {
  if (typeof window === "undefined") return freshSession();
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return freshSession();
    const parsed: unknown = JSON.parse(raw);
    return isSession(parsed) ? parsed : freshSession();
  } catch {
    return freshSession();
  }
}

function saveSession(s: PlaySession): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or unavailable (e.g. private mode) — keep playing in memory.
  }
}

/** Append a settled hand, persist, and return the updated session. */
export function recordHand(
  s: PlaySession,
  deltaBB: number,
  reason: HandReason,
): PlaySession {
  const pnlBB = s.pnlBB + deltaBB;
  const hand = s.handsPlayed + 1;
  const result: HandResult = {
    hand,
    deltaBB,
    cumBB: pnlBB,
    reason,
    ts: Date.now(),
  };
  const next: PlaySession = {
    pnlBB,
    handsPlayed: hand,
    results: [...s.results, result],
  };
  saveSession(next);
  return next;
}

/** Clear the persisted session and return a fresh one. */
export function resetSession(): PlaySession {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      // ignore
    }
  }
  return freshSession();
}

/** Win rate in bb/100 hands, or 0 before any hands are played. */
export function winRateBb100(s: PlaySession): number {
  return s.handsPlayed === 0 ? 0 : (s.pnlBB / s.handsPlayed) * 100;
}
