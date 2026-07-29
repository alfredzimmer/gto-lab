# GTO Lab MCP server

Exposes the GTO Lab solver to AI agents over [MCP](https://modelcontextprotocol.io).
Two tools, two transports, one set of tool definitions:

- **Local (stdio)** — `mcp/server.ts`, run with `pnpm mcp`. Inference via the
  native `onnxruntime-node`.
- **Remote (HTTP)** — `src/app/api/[transport]/route.ts`, served by the Next app
  at `/api/mcp`. Inference via `onnxruntime-web/wasm` (no native addon), so it
  deploys on stock Vercel.

Both call `registerGtoTools` from `mcp/tools.ts` and produce **byte-identical**
strategy (the two ONNX runtimes agree to ~3e-8). All poker logic reuses the
parity-tested engine in `src/lib/gto/`, so the server never re-implements rules.

Prototype status: two tools. The stdio server runs under `tsx` (no build step);
the HTTP route is part of the normal Next build.

## Tools

Both tools take a **friendly layer** (cards + a plain-English action line) and a
**raw layer** (the engine's internal token `History`) for power use / debugging.

Conventions: heads-up, 100bb default. Seat 0 = SB/BTN (in position postflop,
first to act preflop), seat 1 = BB. Bet abstraction is ½-pot / pot / 2×-pot /
all-in with a 3-raise cap per street — a numeric bet size in the line is snapped
to the nearest legal discrete size.

### `get_gto_strategy`

The Nash action distribution at one hero decision. The queried node must be the
hero's turn.

```jsonc
// input (friendly)
{
  "hero": "As Ks",
  "position": "SB",
  "board": "Jh 7c 2s",
  "line": ["SB raise 3", "BB call", "BB check"]
}
// input (raw) — overrides the friendly fields
{ "history": [51, 50, 12, 25, "c", "b1", "c", 3, 4, 5, "c"], "stack": 200 }
```

Returns the node context (street, pot, to-call, hero cards, readable line) and a
`strategy` array of `{ action, token, probability }` over the legal actions.

### `get_range_grid`

The full 13×13 starting-hand range for the player to act after a **public** line
(no hero cards) — the same computation behind the app's range explorer.

```jsonc
// input (friendly)
{ "board": "", "line": ["SB raise 3"] }        // BB's response range vs an open
// input (raw)
{ "tokens": ["b1"], "stack": 200 }
```

Returns node context, the legal `actions` (token + label), the combo-weighted
`aggregate` mix, and `hands`: each of the 169 classes (fully-blocked ones
omitted) with its combo count and action mix, aligned to `actions`.

## Run locally

### stdio

```bash
pnpm mcp          # = tsx mcp/server.ts, speaks MCP over stdio
```

Register in Claude Desktop (`claude_desktop_config.json`) or Claude Code
(`.mcp.json` / `claude mcp add`):

```json
{
  "mcpServers": {
    "gto-lab": {
      "command": "pnpm",
      "args": ["mcp"],
      "cwd": "/Users/alfred/pj/gto-lab"
    }
  }
}
```

### HTTP (against the Next dev server)

```bash
pnpm dev                                             # serves /api/mcp
MCP_URL=http://localhost:3000/api/mcp pnpm tsx mcp/http-test.ts
```

A Streamable-HTTP-capable client connects directly:

```json
{ "mcpServers": { "gto-lab": { "url": "http://localhost:3000/api/mcp" } } }
```

For stdio-only clients, bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "gto-lab": { "command": "npx", "args": ["mcp-remote", "http://localhost:3000/api/mcp"] }
  }
}
```

## Deploy on Vercel

A hosted instance runs at `https://gto-thingy.vercel.app/api/mcp` — clients can
connect there directly. To run your own, the remote endpoint is a normal Next
route, so deploying the app deploys the MCP server; connect clients to
`https://<deployment>/api/mcp`. Two things make it work on serverless, both
already configured in `next.config.ts`:

- `serverExternalPackages: ["onnxruntime-web"]` keeps the wasm runtime out of the
  bundler.
- `outputFileTracingIncludes` ships the model (`public/models/holdem_strategy.onnx`)
  and the wasm runtime (`public/ort/*`) into the function, since the route reads
  them by filesystem path. (`scripts/copy-ort-wasm.mjs`, run on `prepare`/`build`,
  stages `public/ort/`.)

The route pins `runtime = "nodejs"` (never edge — it needs `fs` + WASM) and
`maxDuration = 60`. Cold starts load a ~13MB wasm runtime + <1MB model; the
session is cached per warm instance. Transport is stateless (no Redis needed for
request/response tool calls).

### Rate limiting

The hosted endpoint is protected by a per-IP limit (`src/lib/ratelimit.ts`) via
[`@upstash/ratelimit`](https://github.com/upstash/ratelimit) over Upstash Redis —
connectionless HTTP, the standard for Vercel serverless. Default: **30 requests
per 60 s per IP**, sliding window; over-budget requests get a `429` with
`Retry-After`.

It is **fail-open**: with no credentials in the environment it is inert and every
request passes — so local dev, the stdio server, and self-hosters are unaffected.
To turn it on, create an Upstash Redis DB and set `UPSTASH_REDIS_REST_URL` and
`UPSTASH_REDIS_REST_TOKEN` (see `.env.example`) in the Vercel project.

> Not yet validated on a live Vercel deploy — the production build traces the
> three assets correctly and `next start` serves inference identically to dev, so
> the remaining risk is Vercel-specific. Confirm on first deploy.

## Files

| File | Role |
|---|---|
| `tools.ts` | shared tool definitions — `registerGtoTools(server, runBatch)` |
| `notation.ts` | friendly ↔ internal `History` translation (the parser) |
| `strategy-core.ts` | clip/normalize readout over an injected `BatchRunner` |
| `runner-node.ts` | `onnxruntime-node` runner (stdio) |
| `runner-wasm.ts` | `onnxruntime-web/wasm` runner (HTTP / Vercel) |
| `server.ts` | stdio transport wiring |
| `smoke.ts` | direct-library usage example (`tsx mcp/smoke.ts`) |
| `client-test.ts` | stdio MCP round-trip example |
| `http-test.ts` | HTTP MCP round-trip example |

The HTTP route lives at `src/app/api/[transport]/route.ts` (the `[transport]`
segment lets one file serve both `/api/mcp` and `/api/sse`).

## Not covered (natural next steps)

- `get_equity_vs_range`, `evaluate_hand`, `generate_practice_spot` — the library
  functions already exist (`heroEquityVsRange`, `evaluate7`, `generateScenario`).
- Auth / rate-limiting on the public HTTP endpoint, and packaging the stdio
  server as an `npx`-able bin.
