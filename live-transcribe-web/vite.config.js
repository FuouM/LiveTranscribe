import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    headers: {
      // Required for SharedArrayBuffer (used by ONNX Runtime Web / WASM)
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
    // ONNX runtime will handle its own WASM files from node_modules
    fs: {
      // Allow serving files from the public directory
      allow: ["."],
    },
  },
  // Ensure ONNX and WebAssembly files are properly handled
  assetsInclude: ["**/*.wasm", "**/*.ort", "**/*.onnx"],
  build: {
    rollupOptions: {
      external: (id) => id.includes("ort-wasm"),
    },
  },
  optimizeDeps: {
    exclude: ["onnxruntime-web"],
  },
});
