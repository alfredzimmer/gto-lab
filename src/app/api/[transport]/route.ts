/**
 * Remote MCP endpoint — the same GTO Lab tools as the local stdio server
 * (mcp/server.ts), served over Streamable HTTP so any MCP client can reach
 * them at https://<deployment>/api/mcp. Inference runs in this Node serverless
 * function via onnxruntime-web/wasm (no native addon), so it deploys on stock
 * Vercel. The [transport] segment lets mcp-handler mount both /api/mcp
 * (Streamable HTTP) and /api/sse from one file.
 */

import { createMcpHandler } from "mcp-handler";
import { registerGtoTools } from "../../../../mcp/tools";
import { runStrategyBatch } from "../../../../mcp/runner-wasm";

// ONNX inference needs the Node runtime + filesystem — never the edge runtime.
export const runtime = "nodejs";
// Cold starts load the wasm runtime + model; give tool calls room.
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    registerGtoTools(server, runStrategyBatch);
  },
  {},
  { basePath: "/api" },
);

export { handler as GET, handler as POST };
