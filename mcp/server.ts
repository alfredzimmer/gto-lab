/**
 * Local MCP stdio server exposing the GTO Lab solver to AI agents. Registers
 * the shared tools (mcp/tools.ts) over the native onnxruntime-node runner.
 * The remote HTTP equivalent lives in src/app/api/[transport]/route.ts and
 * shares the exact same tool definitions.
 *
 * Run: `pnpm mcp`
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runStrategyBatch } from "./runner-node";
import { registerGtoTools } from "./tools";

async function main() {
  const server = new McpServer({ name: "gto-lab", version: "0.1.0" });
  registerGtoTools(server, runStrategyBatch);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe; stdout is the JSON-RPC channel.
  process.stderr.write("gto-lab MCP server ready (stdio)\n");
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
