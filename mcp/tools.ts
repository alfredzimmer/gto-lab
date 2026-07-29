/**
 * The GTO Lab MCP tool surface, shared by every transport. Both the local
 * stdio server (mcp/server.ts) and the remote Next/Vercel route
 * (src/app/api/[transport]/route.ts) call `registerGtoTools` with their own
 * inference runner — native onnxruntime-node locally, onnxruntime-web/wasm on
 * the server — so the two deployments expose byte-identical strategy.
 *
 * All poker logic reuses the parity-tested engine in src/lib/gto/; this module
 * only translates friendly input, runs the net, and formats the reply.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  ACTION_INDEX,
  type History,
  type HistoryToken,
  STACK,
  currentPlayer,
  isChance,
  isTerminal,
  parseHistory,
} from "../src/lib/gto/holdem";
import {
  type BatchRunner,
  computeRangeGrid,
  navigationHistory,
  nodeSummary,
} from "../src/lib/gto/ranges";
import { describeSpot } from "../src/lib/gto/strategy";
import {
  buildHistory,
  buildPublicTokens,
  cardToStr,
  parseSeat,
} from "./notation";
import { getStrategy } from "./strategy-core";

const STREET_NAMES = ["Preflop", "Flop", "Turn", "River"];

/** big blinds -> internal 0.5bb chip units (100bb = STACK = 200 chips). */
function stackChips(stackBB: number | undefined): number {
  return stackBB === undefined ? STACK : Math.round(stackBB * 2);
}

function textResult(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

/**
 * Register `get_gto_strategy` and `get_range_grid` on an MCP server. `runBatch`
 * is the only injected dependency — swap it to change where inference runs.
 */
export function registerGtoTools(server: McpServer, runBatch: BatchRunner) {
  // ---- get_gto_strategy -----------------------------------------------------
  server.registerTool(
    "get_gto_strategy",
    {
      title: "GTO strategy at a decision",
      description:
        "Return the solver's Nash action distribution for a heads-up No-Limit " +
        "Hold'em decision (100bb default, ½-pot / pot / 2×-pot / all-in bet " +
        "abstraction). Friendly form: give the hero's two cards, the hero's " +
        "position (SB/BTN or BB), the board so far, and the action line as plain " +
        'words (e.g. ["SB raise 6","BB call","BB check"]). Numeric bet sizes ' +
        "are snapped to the nearest legal discrete size. The queried node must " +
        "be the hero's turn to act. Raw form: pass the internal token `history`.",
      inputSchema: {
        hero: z
          .string()
          .optional()
          .describe(
            'Hero hole cards, e.g. "As Kd". Required for the friendly form.',
          ),
        position: z
          .string()
          .optional()
          .describe('Hero position: "SB"/"BTN" (in position preflop) or "BB".'),
        board: z
          .string()
          .optional()
          .describe('Community cards so far, e.g. "Jh 7c 2s". Empty preflop.'),
        line: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(
            'Action line up to the hero decision, e.g. ["SB raise 6","BB call"]. ' +
              "Actor/position words are ignored; fold/check/call/bet/raise/all-in " +
              "and a size (half/pot/overbet/all-in or a BB number) are read.",
          ),
        stackBB: z
          .number()
          .optional()
          .describe("Starting stack in big blinds (default 100)."),
        history: z
          .array(z.union([z.number(), z.string()]))
          .optional()
          .describe(
            "Raw internal token History (advanced; overrides friendly fields).",
          ),
        stack: z
          .number()
          .optional()
          .describe(
            "Raw effective stack in 0.5bb chip units (advanced; default 200).",
          ),
      },
    },
    async (args) => {
      let history: History;
      let heroSeat: number;
      let stack: number;

      if (args.history) {
        history = args.history as History;
        stack = args.stack ?? STACK;
        if (isChance(history, stack) || isTerminal(history, stack)) {
          throw new Error("raw history is not at a decision node");
        }
        heroSeat = currentPlayer(history, stack);
      } else {
        if (!args.hero)
          throw new Error('provide "hero" (e.g. "As Kd") or a raw "history"');
        heroSeat = parseSeat(args.position);
        stack = stackChips(args.stackBB);
        history = buildHistory({
          hero: args.hero,
          heroSeat,
          board: args.board,
          line: args.line,
          stack,
        }).history;
        if (isTerminal(history, stack) || isChance(history, stack)) {
          throw new Error("the action line does not end on a decision node");
        }
        if (currentPlayer(history, stack) !== heroSeat) {
          throw new Error(
            "the queried node is the villain's turn, not the hero's — extend the line or check the position",
          );
        }
      }

      const probs = await getStrategy(runBatch, history, stack);
      const info = describeSpot(history, heroSeat, stack);
      const heroCards = [
        cardToStr(history[2 * heroSeat] as number),
        cardToStr(history[2 * heroSeat + 1] as number),
      ];
      const board = parseHistory(history, stack).board.map((c) =>
        cardToStr(c as number),
      );

      return textResult({
        node: {
          street: info.streetName,
          potBB: info.potBB,
          toCallBB: info.toCallBB,
          heroSeat,
          heroPosition: heroSeat === 0 ? "SB/BTN" : "BB",
          heroCards,
          board,
          line: info.lineDescription,
        },
        strategy: probs.map((p) => ({
          action: info.actionLabels[p.action] ?? p.action,
          token: p.action,
          probability: Number(p.probability.toFixed(4)),
        })),
      });
    },
  );

  // ---- get_range_grid -------------------------------------------------------
  server.registerTool(
    "get_range_grid",
    {
      title: "GTO range grid for a public line",
      description:
        "Return the full 13x13 starting-hand range for the player to act after " +
        "a public action line (no hero cards). Each of the 169 hand classes " +
        "gets its combo-averaged action mix, plus the range-wide aggregate. " +
        "Friendly form: board + action line as plain words. Raw form: internal " +
        "`tokens` (board cards + action tokens, no holes).",
      inputSchema: {
        board: z
          .string()
          .optional()
          .describe('Community cards, e.g. "Jh 7c 2s". Empty preflop.'),
        line: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Public action line, e.g. ["SB raise 6","BB call"].'),
        stackBB: z
          .number()
          .optional()
          .describe("Starting stack in big blinds (default 100)."),
        tokens: z
          .array(z.union([z.number(), z.string()]))
          .optional()
          .describe(
            "Raw public token list (advanced; overrides friendly fields).",
          ),
        stack: z
          .number()
          .optional()
          .describe("Raw stack in 0.5bb chip units (advanced)."),
      },
    },
    async (args) => {
      const stack = args.tokens
        ? (args.stack ?? STACK)
        : stackChips(args.stackBB);
      const tokens: HistoryToken[] = args.tokens
        ? (args.tokens as HistoryToken[])
        : buildPublicTokens({ board: args.board, line: args.line, stack });

      const grid = await computeRangeGrid(tokens, runBatch, ACTION_INDEX);
      const summary = nodeSummary(tokens);
      const labels = describeSpot(
        navigationHistory(tokens),
        summary.actingSeat,
        stack,
      ).actionLabels;

      const round = (xs: number[]) => xs.map((v) => Number(v.toFixed(4)));
      const hands: Record<string, { combos: number; mix: number[] }> = {};
      for (const cell of grid.cells) {
        if (cell.combos === 0 || !cell.probs) continue;
        hands[cell.label] = { combos: cell.combos, mix: round(cell.probs) };
      }

      return textResult({
        node: {
          street: STREET_NAMES[summary.street],
          potBB: summary.potBB,
          toCallBB: summary.toCallBB,
          actingSeat: summary.actingSeat,
          actingPosition: summary.actingSeat === 0 ? "SB/BTN" : "BB",
        },
        actions: grid.actions.map((tok) => ({
          token: tok,
          label: labels[tok] ?? tok,
        })),
        aggregate: round(grid.aggregate),
        note: "mix arrays are aligned to `actions`; hands fully blocked by the board are omitted",
        hands,
      });
    },
  );
}
