#!/usr/bin/env node
/**
 * End-to-end sanity check for the actual shipped model artifact
 * (public/models/holdem_strategy.onnx), loaded through a real ONNX
 * runtime -- not a mock. `solver/tests/test_export_onnx.py` proves
 * PyTorch and ONNX Runtime agree on a freshly-exported net, and
 * `src/lib/gto/strategy.getStrategy.test.ts` proves the app's own
 * clip/normalize logic is correct against a mocked session -- but neither
 * proves the *checked-in* .onnx file, run through a *real* runtime,
 * produces sane output for real game states. This uses onnxruntime-node
 * (a CPU-execution-provider stand-in for the browser's
 * onnxruntime-web/wasm -- ONNX graph execution semantics are
 * provider-agnostic, only performance differs) for real infosets sampled
 * from the TS/Python parity fixture.
 *
 * This is deliberately a plain Node script, not a Jest test: Jest gives
 * each test file its own V8 context, and onnxruntime-node's native
 * addon hands back result tensors built against the *real* process's
 * typed-array constructors -- `instanceof Float32Array` then fails
 * inside onnxruntime-common's own Tensor constructor because Jest's
 * sandboxed context has a different Float32Array reference. That's a
 * known category of Jest-vs-native-addon incompatibility, not a bug in
 * this check, so it runs outside Jest via `pnpm run check:onnx`.
 *
 * Usage: node scripts/check-onnx-runtime.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as ort from "onnxruntime-node";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MODEL_PATH = `${ROOT}public/models/holdem_strategy.onnx`;
const PARITY_PATH = `${ROOT}src/lib/gto/parity-vectors.json`;

const parity = JSON.parse(readFileSync(PARITY_PATH, "utf8"));
const FEATURE_DIM = parity.featureDim;
const MAX_ACTIONS = 5; // ACTION_ORDER.length in holdem.ts / holdem.py

function toDenseFeatures(features) {
  const dense = new Float32Array(FEATURE_DIM);
  for (const [idx, val] of Object.entries(features)) {
    dense[Number(idx)] = val;
  }
  return dense;
}

async function main() {
  const session = await ort.InferenceSession.create(MODEL_PATH);

  const decisionVectors = parity.vectors
    .filter((v) => "features" in v)
    .slice(0, 20);
  assert.equal(decisionVectors.length, 20, "expected 20 sampled decision vectors");

  for (const v of decisionVectors) {
    const input = new ort.Tensor(
      "float32",
      toDenseFeatures(v.features),
      [1, FEATURE_DIM],
    );
    const output = await session.run({ features: input });

    assert.ok(output.action_logits, "model must produce an action_logits output");
    assert.deepEqual(
      Array.from(output.action_logits.dims),
      [1, MAX_ACTIONS],
      `expected output shape [1, ${MAX_ACTIONS}]`,
    );

    const logits = output.action_logits.data;
    assert.equal(logits.length, MAX_ACTIONS);
    for (const x of logits) {
      assert.ok(Number.isFinite(x), `logit must be finite, got ${x}`);
    }

    // Mirrors strategy.ts's getStrategy clip-and-normalize (not a re-test
    // of that logic -- see strategy.getStrategy.test.ts -- just confirming
    // the real model's output can be turned into a valid distribution).
    const clipped = v.legalIndices.map((i) => Math.max(logits[i], 0));
    const total = clipped.reduce((s, x) => s + x, 0);
    const probs =
      total > 0
        ? clipped.map((x) => x / total)
        : clipped.map(() => 1 / clipped.length);
    const probSum = probs.reduce((s, x) => s + x, 0);
    assert.ok(Math.abs(probSum - 1) < 1e-6, `probabilities must sum to 1, got ${probSum}`);
    for (const p of probs) {
      assert.ok(p >= 0 && p <= 1, `probability out of range: ${p}`);
    }
  }

  console.log(
    `OK: ${MODEL_PATH} produced valid, finite, correctly-shaped logits ` +
      `for ${decisionVectors.length} real infosets.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
