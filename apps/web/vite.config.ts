import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The web app connects to the server's WebSocket. In dev it talks directly to
// :3001 (see src/ws.ts, VITE_WS_URL), but this proxy also lets a same-origin
// "/ws" work behind a single host in production-like setups.
export default defineConfig({
  plugins: [react()],
  // transformers.js (WebGPU Whisper) resolves its ORT wasm/model assets dynamically —
  // keep Vite from pre-bundling it, and don't down-level the module worker's top-level await.
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  build: { target: "es2022" },
  server: {
    port: 5173,
    proxy: {
      "/ws": { target: "ws://localhost:3001", ws: true },
      // ASR token mint + on-device Gemma transcription live on the server.
      "/asr": { target: "http://localhost:3001" },
      "/context": { target: "http://localhost:3001" },
      "/gate": { target: "http://localhost:3001" },
    },
  },
});
