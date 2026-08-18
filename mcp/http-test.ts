/**
 * Exercises the remote MCP endpoint over Streamable HTTP, the way a real client
 * (Claude, etc.) would. Point it at a running server: `next dev` locally or a
 * deployed URL. Usage: MCP_URL=http://localhost:3210/api/mcp tsx mcp/http-test.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://localhost:3210/api/mcp";

async function main() {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const client = new Client({ name: "http-test", version: "0" });
  await client.connect(transport);
  console.log("connected to", url);

  const tools = await client.listTools();
  console.log("TOOLS:", tools.tools.map((t) => t.name).join(", "));

  const r1 = await client.callTool({
    name: "get_gto_strategy",
    arguments: {
      hero: "As Ks",
      position: "SB",
      board: "Jh 7c 2s",
      line: ["SB raise 3", "BB call", "BB check"],
    },
  });
  console.log("\n=== get_gto_strategy (wasm inference) ===");
  console.log((r1.content as { text: string }[])[0].text);

  const r2 = await client.callTool({
    name: "get_range_grid",
    arguments: { line: ["SB raise 3"] },
  });
  const grid = JSON.parse((r2.content as { text: string }[])[0].text);
  console.log("\n=== get_range_grid (BB vs SB open) ===");
  console.log("node:", JSON.stringify(grid.node));
  console.log(
    "aggregate:",
    grid.aggregate,
    "| hands:",
    Object.keys(grid.hands).length,
  );
  console.log(
    "AA:",
    JSON.stringify(grid.hands.AA),
    "72o:",
    JSON.stringify(grid.hands["72o"]),
  );

  await client.close();
}

main().catch((e) => {
  console.error("HTTP test failed:", e?.message ?? e);
  process.exit(1);
});
