#!/usr/bin/env node
/**
 * End-to-end check of the MCP server against the *real* strategy model, over a
 * real stdio JSON-RPC round-trip. The Jest suite (mcp/tools.test.ts) exercises
 * the tool plumbing with a fake runner; this proves the shipped server, wired
 * to onnxruntime-node and the checked-in .onnx, returns poker-sane strategy.
 *
 * Like scripts/check-onnx-runtime.mjs, it runs outside Jest (native addon +
 * Jest's sandboxed contexts don't mix). Run: `pnpm check:mcp`.
 */

import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node_modules/.bin/tsx",
  args: ["mcp/server.ts"],
});
const client = new Client({ name: "check-mcp", version: "0" });

const json = (res) => JSON.parse(res.content[0].text);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

try {
  await client.connect(transport);

  // 1) both tools are advertised
  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map((t) => t.name).sort(),
    ["get_gto_strategy", "get_range_grid"],
    "both tools should be listed",
  );

  // 2) get_gto_strategy: AKs preflop open is a valid, normalized mix that
  //    (almost) never folds — a basic sanity floor on the real net.
  const strat = json(
    await client.callTool({
      name: "get_gto_strategy",
      arguments: { hero: "As Ks", position: "SB" },
    }),
  );
  assert.equal(strat.node.street, "Preflop");
  const total = sum(strat.strategy.map((a) => a.probability));
  assert.ok(Math.abs(total - 1) < 1e-6, `probs sum to 1 (got ${total})`);
  const fold = strat.strategy.find((a) => a.token === "f");
  assert.ok(
    !fold || fold.probability < 0.05,
    `AKs should rarely fold preflop (fold=${fold?.probability})`,
  );

  // 3) get_range_grid: the SB opening range covers all 169 classes, AA opens
  //    (~never folds) and 72o mostly folds — the shape a solver must produce.
  const grid = json(
    await client.callTool({ name: "get_range_grid", arguments: {} }),
  );
  assert.equal(Object.keys(grid.hands).length, 169, "all 169 classes present");
  assert.ok(
    Math.abs(sum(grid.aggregate) - 1) < 1e-6,
    "aggregate mix sums to 1",
  );
  assert.ok(
    grid.hands.AA.mix[0] < 0.05,
    `AA should rarely fold (fold=${grid.hands.AA.mix[0]})`,
  );
  assert.ok(
    grid.hands["72o"].mix[0] > 0.5,
    `72o should mostly fold (fold=${grid.hands["72o"].mix[0]})`,
  );

  console.log("check:mcp OK — server + real model return poker-sane strategy");
} catch (err) {
  console.error("check:mcp FAILED:", err?.message ?? err);
  process.exitCode = 1;
} finally {
  await client.close();
}
