// Copies MediaPipe's WASM runtime from node_modules into public/ so the face
// tracker is served from our own origin (no third-party CDN at runtime).
// Runs automatically on `npm install` / `npm ci` (postinstall).
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const dst = join(root, "public/mediapipe/wasm");
if (!existsSync(src)) {
  console.warn("[copy-mediapipe] @mediapipe/tasks-vision not installed — skipping");
  process.exit(0);
}
mkdirSync(dst, { recursive: true });
cpSync(src, dst, { recursive: true });
console.log("[copy-mediapipe] wasm copied to public/mediapipe/wasm");
