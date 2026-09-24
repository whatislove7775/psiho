/**
 * Static avatar pictures for lists/cards: one shared offscreen renderer,
 * a serial queue (WebGL contexts are scarce) and an LRU cache of data URLs.
 */
import { avatarKey, type AvatarConfig } from "../schema";
import type { Framing } from "./types";
import { KitRenderer } from "../kit/KitRenderer";

const cache = new Map<string, Promise<string>>();
const MAX = 160;
let shared: KitRenderer | null = null;
let queue: Promise<unknown> = Promise.resolve();

function renderer(): KitRenderer {
  if (!shared) {
    const canvas = document.createElement("canvas");
    shared = new KitRenderer(canvas, { background: null, idle: false, preserveDrawingBuffer: true, maxPixelRatio: 1 });
  }
  return shared;
}

export function renderAvatarSnapshot(
  cfg: AvatarConfig,
  opts: { size?: number; framing?: Framing; expression?: Record<string, number>; yaw?: number } = {},
): Promise<string> {
  const size = opts.size ?? 256;
  const framing = opts.framing ?? "face";
  const key = `${size}|${framing}|${opts.yaw ?? 0}|${JSON.stringify(opts.expression ?? {})}|${avatarKey(cfg)}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const job = queue.then(async () => {
    const r = renderer();
    r.resize(size, size);
    r.setFraming(framing);
    r.setConfig(cfg);
    r.setExpression(opts.expression ?? {});
    await r.renderOnceAsync(opts.yaw ?? 0);
    return r.canvas.toDataURL("image/png");
  });
  queue = job.catch(() => undefined);
  cache.set(key, job);
  if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
  job.catch(() => cache.delete(key));
  return job;
}
