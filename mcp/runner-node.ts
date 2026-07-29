/**
 * Native-addon inference runner (onnxruntime-node) for the local stdio server.
 * Fast to start and simple, but a native binary — which is why the remote
 * Next/Vercel path uses the wasm runner (runner-wasm.ts) instead. Both expose
 * the same `BatchRunner` signature from src/lib/gto/ranges.ts, so the shared
 * tools in tools.ts run over either.
 *
 * This is the same runtime scripts/check-onnx-runtime.mjs uses to validate the
 * shipped artifact; graph-execution semantics are provider-agnostic, so its
 * logits match the browser's wasm runtime bit-for-bit.
 */

import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";
import { FEATURE_DIM } from "../src/lib/gto/holdem";

const MODEL_PATH = fileURLToPath(
  new URL("../public/models/holdem_strategy.onnx", import.meta.url),
);

let sessionPromise: Promise<ort.InferenceSession> | null = null;

function session(): Promise<ort.InferenceSession> {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH);
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
