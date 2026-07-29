/**
 * End-to-end test of the MCP tool surface over the SDK's in-memory transport:
 * a real McpServer + Client talking JSON-RPC, exercising the actual tool
 * handlers (notation → strategy readout → formatting). Inference is a fake
 * deterministic runner injected via `registerGtoTools`, so these assertions are
 * stable and need no ONNX — the model itself is validated separately by
 * `pnpm check:onnx`.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MAX_ACTIONS } from "../src/lib/gto/holdem";
import type { BatchRunner } from "../src/lib/gto/ranges";
import { registerGtoTools } from "./tools";

/**
 * Fake runner returning a fixed logit vector per row. b0 (index 2) is largest,
 * so the strategy leans toward the ½-pot bet — enough to make the normalization
 * assertions concrete without depending on the trained net.
 */
const fakeRunner: BatchRunner = async (_features, rows) => {
  const out = new Float32Array(rows * MAX_ACTIONS);
  const pattern = [0, 1, 3, 2, 0.5, 0.5]; // f, c, b0, b1, b2, a
  for (let r = 0; r < rows; r++) out.set(pattern, r * MAX_ACTIONS);
  return out;
};

async function connectedClient(): Promise<Client> {
  const server = new McpServer({ name: "test", version: "0" });
  registerGtoTools(server, fakeRunner);
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });
  await Promise.all([client.connect(clientT), server.connect(serverT)]);
  return client;
}

function parse(result: { content: unknown }) {
  return JSON.parse((result.content as { text: string }[])[0].text);
}

describe("MCP tools over in-memory transport", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connectedClient();
  });
  afterAll(async () => {
    await client.close();
  });

  test("both tools are registered", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "get_gto_strategy",
      "get_range_grid",
    ]);
  });

  test("get_gto_strategy returns a normalized mix over legal actions", async () => {
    const res = await client.callTool({
      name: "get_gto_strategy",
      arguments: {
        hero: "As Ks",
        position: "SB",
        board: "Jh 7c 2s",
        line: ["SB raise 3", "BB call", "BB check"],
      },
    });
    const out = parse(res);

    expect(out.node.street).toBe("Flop");
    expect(out.node.heroCards).toEqual(["As", "Ks"]);
    expect(out.node.board).toEqual(["Jh", "7c", "2s"]);

    const total = out.strategy.reduce(
      (s: number, a: { probability: number }) => s + a.probability,
      0,
    );
    expect(total).toBeCloseTo(1, 5); // probabilities sum to 1
    // fake logits make b0 (½-pot bet) the modal action
    const top = [...out.strategy].sort(
      (a, b) => b.probability - a.probability,
    )[0];
    expect(top.token).toBe("b0");
    // every returned action carries a human label + token
    for (const a of out.strategy) {
      expect(a.token).toBeTruthy();
      expect(a.action).toBeTruthy();
    }
  });

  test("get_gto_strategy rejects a node that is the villain's turn", async () => {
    // Hero is BB, but the empty line stops at the SB's opening decision.
    const res = await client.callTool({
      name: "get_gto_strategy",
      arguments: { hero: "As Ks", position: "BB", line: [] },
    });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toMatch(/villain's turn/);
  });

  test("get_gto_strategy errors on a line that ends the hand", async () => {
    const res = await client.callTool({
      name: "get_gto_strategy",
      arguments: { hero: "As Ks", position: "SB", line: ["SB fold"] },
    });
    expect(res.isError).toBe(true);
  });

  test("get_range_grid returns all 169 classes with a normalized aggregate", async () => {
    const res = await client.callTool({
      name: "get_range_grid",
      arguments: { line: ["SB raise 3"] },
    });
    const out = parse(res);

    expect(out.node.actingPosition).toBe("BB");
    expect(Object.keys(out.hands)).toHaveLength(169); // no board blockers preflop
    const aggTotal = out.aggregate.reduce((s: number, v: number) => s + v, 0);
    expect(aggTotal).toBeCloseTo(1, 5);
    // each hand's mix aligns with the actions array and sums to 1
    const nActions = out.actions.length;
    for (const label of Object.keys(out.hands)) {
      const mix = out.hands[label].mix;
      expect(mix).toHaveLength(nActions);
      expect(mix.reduce((s: number, v: number) => s + v, 0)).toBeCloseTo(1, 4);
    }
  });

  test("raw history form bypasses the friendly parser", async () => {
    const res = await client.callTool({
      name: "get_gto_strategy",
      arguments: { history: [51, 50, 24, 23], stack: 200 },
    });
    const out = parse(res);
    expect(out.node.street).toBe("Preflop");
    expect(out.strategy.length).toBeGreaterThan(0);
  });
});
