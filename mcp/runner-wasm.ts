/**
 * WASM inference runner (onnxruntime-web/wasm) for the remote Next/Vercel MCP
 * route. Pure WebAssembly — no native addon — so it deploys on standard
 * serverless functions where onnxruntime-node's `.node` binary is a liability.
 * Proven bit-identical to the native runner (diff ~3e-8), because ONNX graph
 * execution is provider-agnostic.
 *
 * The model bytes and the wasm runtime are read from the filesystem rather than
 * fetched, so nothing depends on the deployment URL. On Vercel both are shipped
 * into the function bundle via next.config `outputFileTracingIncludes`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ort from "onnxruntime-web/wasm";
import { FEATURE_DIM } from "../src/lib/gto/holdem";

/**
 * The wasm runtime and the model are read by runtime filesystem path (not a
 * bundler-resolved import), so Turbopack/webpack never tries to inline them.
 * Both live under public/ — the wasm files are staged there by
 * scripts/copy-ort-wasm.mjs — and are traced into the Vercel function by
 * next.config `outputFileTracingIncludes`.
 */
function publicPath(...parts: string[]): string {
  return join(process.cwd(), "public", ...parts);
}

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function session(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    // Trailing slash: onnxruntime-web treats wasmPaths as a prefix.
    ort.env.wasm.wasmPaths = `${publicPath("ort")}/`;
    ort.env.wasm.numThreads = 1; // single-threaded: no worker pool in serverless
    const bytes = new Uint8Array(
      readFileSync(publicPath("models", "holdem_strategy.onnx")),
    );
    // Clear the cache on failure so a transient error doesn't permanently
    // break every future call on this warm instance — the next call gets a
    // fresh attempt instead of the same rejected promise forever.
    sessionPromise = ort.InferenceSession.create(bytes, {
      executionProviders: ["wasm"],
    }).catch((err) => {
      sessionPromise = null;
      throw err;
    });
  }
  return sessionPromise;
}

/** Raw action logits for a batch of feature rows (rows x MAX_ACTIONS). */
export async function runStrategyBatch(
  features: Float32Array,
  rows: number,
): Promise<Float32Array> {
  const s = await session();
  const input = new ort.Tensor("float32", features, [rows, FEATURE_DIM]);
  const output = await s.run({ features: input });
  return output.action_logits.data as Float32Array;
}
