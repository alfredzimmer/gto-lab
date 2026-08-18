/**
 * Remote MCP endpoint — the same GTO Lab tools as the local stdio server
 * (mcp/server.ts), served over Streamable HTTP so any MCP client can reach
 * them at https://<deployment>/api/mcp. Inference runs in this Node serverless
 * function via onnxruntime-web/wasm (no native addon), so it deploys on stock
 * Vercel. The [transport] segment lets mcp-handler mount both /api/mcp
 * (Streamable HTTP) and /api/sse from one file.
 */

import { createMcpHandler } from "mcp-handler";
import { enforceRateLimit } from "@/lib/ratelimit";
import { registerGtoTools } from "../../../../mcp/tools";
import { runStrategyBatch } from "../../../../mcp/runner-wasm";

// ONNX inference needs the Node runtime + filesystem — never the edge runtime.
export const runtime = "nodejs";
// Cold starts load the wasm runtime + model; give tool calls room.
export const maxDuration = 60;

const mcpHandler = createMcpHandler(
  (server) => {
    registerGtoTools(server, runStrategyBatch);
  },
  {},
  { basePath: "/api" },
);

// Per-IP rate limit in front of the MCP handler so the shared hosted instance
// can't be abused. Inert unless Upstash credentials are set (see lib/ratelimit).
async function handler(req: Request, ...rest: unknown[]): Promise<Response> {
  const limited = await enforceRateLimit(req);
  if (limited) return limited;
  return (mcpHandler as (r: Request, ...a: unknown[]) => Promise<Response>)(
    req,
    ...rest,
  );
}

export { handler as GET, handler as POST };
