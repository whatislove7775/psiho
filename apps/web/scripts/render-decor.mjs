// Renders the decorative avatars (src/app/dev/avatar-decor) into public/decor/*.webp.
// One-off, dev only:  (next dev running)  node scripts/render-decor.mjs [http://localhost:3000] [?only=wave]
// Needs playwright-core (resolved from PLAYWRIGHT_DIR or the cwd) + a Chromium (PW_CHROMIUM,
// default /opt/pw-browsers/chromium); software GL is fine.
import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright-core", { paths: [process.env.PLAYWRIGHT_DIR ?? process.cwd(), process.cwd()] }));
const [base = "http://localhost:3000", qs = ""] = process.argv.slice(2);
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "decor");
const browser = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM ?? "/opt/pw-browsers/chromium",
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
await page.goto(`${base}/dev/avatar-decor${qs}`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction("window.__decor", null, { timeout: 600000, polling: 500 });
const pics = await page.evaluate("window.__decor");
mkdirSync(out, { recursive: true });
for (const [id, url] of Object.entries(pics)) {
  const buf = Buffer.from(url.split(",")[1], "base64");
  writeFileSync(join(out, `${id}.webp`), buf);
  console.log(`${id}.webp`, Math.round(buf.length / 1024), "KB");
}
await browser.close();
