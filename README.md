# GTO Lab

Learn heads-up No-Limit Hold'em from an actual solver. Every frequency shown in the app comes from a Deep CFR (Brown et al. 2019) self-play run, and inference happens entirely in your browser via ONNX.

## Getting Started

```bash
pnpm install
pnpm dev
```

The app expects a trained strategy model at `public/models/holdem_strategy.onnx` (one is
committed after training; see below to retrain).

## Use it from an AI agent (MCP)

The solver is exposed to AI agents over [MCP](https://modelcontextprotocol.io), so an
agent can ask *"what's GTO here?"* and get answers straight from the strategy net.
Two tools:

- **`get_gto_strategy`** — the Nash action mix at a hero decision.
- **`get_range_grid`** — the 13×13 starting-hand range for the player to act on a
  public line.

Both take either plain poker notation (`hero: "As Ks"`, `position: "SB"`, `board`, a
readable `line`) or the engine's raw token form. Full tool reference: [`mcp/README.md`](mcp/README.md).

### Remote (hosted) — Streamable HTTP

The easiest path: connect straight to our hosted instance — no clone, no deploy.
Point any Streamable-HTTP-capable client at **`https://gto-thingy.vercel.app/api/mcp`**:

```json
{
  "mcpServers": {
    "gto-lab": { "url": "https://gto-thingy.vercel.app/api/mcp" }
  }
}
```

For a stdio-only client, bridge with [`mcp-remote`](https://www.npmjs.com/package/mcp-remote):

```json
{
  "mcpServers": {
    "gto-lab": { "command": "npx", "args": ["mcp-remote", "https://gto-thingy.vercel.app/api/mcp"] }
  }
}
```

The hosted instance is a shared, rate-limited best-effort service. For heavy or
production use, deploy your own (`/api/mcp` on any Vercel deployment of this app) or
run the local stdio server below.

### Local — stdio

Run the server straight from a clone (no deployment, native inference):

```bash
pnpm mcp          # speaks MCP over stdio
```

Register it with your agent. **Claude Code** users get it automatically from the
checked-in [`.mcp.json`](.mcp.json); for **Claude Desktop** (`claude_desktop_config.json`)
or any other client, add:

```json
{
  "mcpServers": {
    "gto-lab": { "command": "pnpm", "args": ["mcp"], "cwd": "/absolute/path/to/gto-lab" }
  }
}
```

## The solver (`solver/`)

The GTO strategy is trained by an external-sampling Deep CFR
implementation whose correctness is gated on classical benchmarks before
the real game:

1. Tabular CFR + exact best-response exploitability, validated against
   the closed-form Kuhn poker equilibrium (game value −1/18, the 1/3
   bluff/call frequencies).
2. The same machinery validated on Leduc hold'em (exploitability → 0).
3. Deep CFR validated against those tabular ground truths on both games.
4. Only then trained on the target: heads-up NLHE, 100bb, 4 streets,
   discretized bet sizes (½-pot, pot, all-in; 3 raises/street cap).
5. The trained strategy is probed with Local Best Response (a
   lower bound on exploitability) — `scripts/lbr_eval.py`.

The TypeScript game engine and feature encoder used by the browser are
parity-tested against the Python training engine on generated test
vectors (`src/lib/gto/parity-vectors.json`), so the network always sees
inputs encoded exactly as during training.

```bash
cd solver
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python -m pytest tests/            # full validation gate
.venv/bin/python scripts/train_holdem.py --out runs/holdem_v1
.venv/bin/python scripts/lbr_eval.py runs/holdem_v1/checkpoint.pt
.venv/bin/python scripts/export_onnx.py runs/holdem_v1/checkpoint.pt \
    --out ../public/models/holdem_strategy.onnx
```

## Testing

- App: `pnpm test` (includes the TS/Python parity suite)
- Solver: `cd solver && .venv/bin/python -m pytest tests/`

## License

MIT
