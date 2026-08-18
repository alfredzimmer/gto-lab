import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

async function main() {
  const transport = new StdioClientTransport({
    command: "node_modules/.bin/tsx",
    args: ["mcp/server.ts"],
  });
  const client = new Client({ name: "test", version: "0" });
  await client.connect(transport);

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
  console.log("\n=== get_gto_strategy ===");
  console.log((r1.content as { text: string }[])[0].text);

  const r2 = await client.callTool({
    name: "get_range_grid",
    arguments: { line: ["SB raise 3"] },
  });
  const grid = JSON.parse((r2.content as { text: string }[])[0].text);
  console.log("\n=== get_range_grid (BB facing SB open) ===");
  console.log("node:", JSON.stringify(grid.node));
  console.log(
    "actions:",
    grid.actions.map((a: { label: string }) => a.label).join(" | "),
  );
  console.log("aggregate:", grid.aggregate);
  console.log("hands returned:", Object.keys(grid.hands).length);
  console.log(
    "AA:",
    JSON.stringify(grid.hands.AA),
    " 72o:",
    JSON.stringify(grid.hands["72o"]),
  );

  // Error path: ask a node that is the villain's turn.
  try {
    await client.callTool({
      name: "get_gto_strategy",
      arguments: { hero: "As Ks", position: "BB", line: ["SB raise 3"] },
    });
    console.log("\nERROR PATH: (no error thrown?)");
  } catch (e) {
    console.log("\nError path OK:", (e as Error).message.slice(0, 120));
  }

  await client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
