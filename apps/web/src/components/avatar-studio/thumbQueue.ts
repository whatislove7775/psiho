/**
 * Cancellable, main-thread-friendly front for renderAvatarSnapshot().
 *
 * The engine's snapshot queue is serial but not cancellable: if a user drags a
 * slider, every visible tile would queue a render for every intermediate
 * config. Here each tile holds a ticket it can cancel; jobs start one at a time
 * and we yield a frame between them so the live preview keeps its frame rate.
 * Finished pictures are kept in a small synchronous cache so revisiting a
 * category paints instantly (no skeleton flash).
 */
import { avatarKey, type AvatarConfig } from "@/lib/avatar/schema";
import type { Framing } from "@/lib/avatar/kit/types";

export interface ThumbOpts {
  size: number;
  framing: Framing;
  expression?: Record<string, number>;
  /** head turn in radians (0.45 ≈ three-quarter view) */
  yaw?: number;
}

interface Job {
  key: string;
  cfg: AvatarConfig;
  opts: ThumbOpts;
  cancelled: boolean;
  listeners: ((url: string | null) => void)[];
}

const done = new Map<string, string>();
const MAX_DONE = 400;
const pending: Job[] = [];
const byKey = new Map<string, Job>();
let running = false;

type SnapshotFn = (cfg: AvatarConfig, o: ThumbOpts) => Promise<string>;
let snapshotFn: Promise<SnapshotFn> | null = null;
const loadSnapshot = () =>
  (snapshotFn ??= import("@/lib/avatar/kit/snapshot").then((m) => m.renderAvatarSnapshot as SnapshotFn));

export function thumbKey(cfg: AvatarConfig, o: ThumbOpts): string {
  return `${o.size}|${o.framing}|${o.yaw ?? 0}|${JSON.stringify(o.expression ?? {})}|${avatarKey(cfg)}`;
}

export function cachedThumb(key: string): string | undefined {
  return done.get(key);
}

/** Let input, the live preview and paint run between two snapshot renders. */
const breathe = () =>
  new Promise<void>((r) => {
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    if (ric) ric(() => r(), { timeout: 120 });
    else setTimeout(r, 16);
  });

async function pump() {
  if (running) return;
  running = true;
  try {
    const snap = await loadSnapshot();
    while (pending.length) {
      const job = pending.shift()!;
      if (job.cancelled || !job.listeners.length) {
        byKey.delete(job.key);
        continue;
      }
      let url: string | null = null;
      try {
        url = await snap(job.cfg, job.opts);
        done.set(job.key, url);
        if (done.size > MAX_DONE) done.delete(done.keys().next().value as string);
      } catch {
        url = null;
      }
      byKey.delete(job.key);
      job.listeners.forEach((l) => l(url));
      await breathe();
    }
  } finally {
    running = false;
  }
}

/** Ask for a thumbnail. Returns a cancel function. */
export function requestThumb(cfg: AvatarConfig, opts: ThumbOpts, cb: (url: string | null) => void): () => void {
  const key = thumbKey(cfg, opts);
  const hit = done.get(key);
  if (hit) {
    cb(hit);
    return () => {};
  }
  let job = byKey.get(key);
  if (!job || job.cancelled) {
    job = { key, cfg, opts, cancelled: false, listeners: [] };
    byKey.set(key, job);
    pending.push(job);
  }
  const j = job;
  j.listeners.push(cb);
  void pump();
  return () => {
    j.listeners = j.listeners.filter((l) => l !== cb);
    if (!j.listeners.length) j.cancelled = true;
  };
}
