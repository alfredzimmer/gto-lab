import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // The remote MCP route (src/app/api/[transport]) runs ONNX inference server-
  // side through onnxruntime-web/wasm. Keep it un-bundled so its wasm runtime
  // loads from node_modules on disk instead of being mangled by the bundler.
  serverExternalPackages: ["onnxruntime-web"],
  // The route reads the model and the wasm runtime from public/ by runtime
  // filesystem path, which the tracer can't see — include them explicitly so
  // they ship in the serverless function bundle on Vercel.
  outputFileTracingIncludes: {
    "/api/**": [
      "./public/models/holdem_strategy.onnx",
      "./public/ort/ort-wasm-simd-threaded.wasm",
      "./public/ort/ort-wasm-simd-threaded.mjs",
    ],
  },
};

export default nextConfig;
