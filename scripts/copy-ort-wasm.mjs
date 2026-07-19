// Copies the onnxruntime-web wasm runtime into public/ort/ so the GTO
// trainer can run inference without loading anything from a CDN.
// Runs automatically via the "prepare" lifecycle script.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "node_modules", "onnxruntime-web", "dist");
const out = join(root, "public", "ort");

mkdirSync(out, { recursive: true });
for (const file of [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.mjs",
]) {
  copyFileSync(join(dist, file), join(out, file));
}
console.log("copied onnxruntime-web wasm runtime to public/ort/");
