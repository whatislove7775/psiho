/**
 * Live captions: the wire format between call participants and the merging
 * of partial/final recognition results. Pure code (no DOM) — unit-tested with
 * `node --test src/lib/captions/protocol.test.mjs`.
 *
 * Captions travel ONLY over the call's own RTCDataChannel (peer to peer,
 * DTLS-encrypted), never through our server. Two message types:
 *
 *   {t:"state", stt, want, textOnly}  — what this side can do / wants:
 *        stt      — speech recognition is available on this device
 *        want     — "please send me your captions" (the viewer's «Субтитры» toggle)
 *        textOnly — this side mutes its microphone track and speaks via captions only
 *   {t:"cap", seg, text, final}       — the current text of utterance `seg`;
 *        partial updates replace the segment's text, `final` closes it.
 */

/** Negotiated data channel (same id on both sides → no in-band DCEP, no glare). */
export const CAPTION_CHANNEL = { label: "captions", id: 7 } as const;

export const MAX_CAPTION_CHARS = 600;

export interface CaptionState {
  stt: boolean;
  want: boolean;
  textOnly: boolean;
}

export type CaptionMsg =
  | ({ t: "state" } & CaptionState)
  | { t: "cap"; seg: number; text: string; final: boolean };

export function encodeCaptionMsg(m: CaptionMsg): string {
  return JSON.stringify(m);
}

/** Validates an incoming message; anything unexpected is dropped (returns null). */
export function parseCaptionMsg(raw: unknown): CaptionMsg | null {
  if (typeof raw !== "string" || raw.length > 4 * MAX_CAPTION_CHARS) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!m || typeof m !== "object") return null;
  const o = m as Record<string, unknown>;
  if (o.t === "state") {
    return { t: "state", stt: o.stt === true, want: o.want === true, textOnly: o.textOnly === true };
  }
  if (o.t === "cap") {
    const seg = o.seg;
    if (typeof seg !== "number" || !Number.isInteger(seg) || seg < 0 || seg > 1e9) return null;
    if (typeof o.text !== "string") return null;
    return { t: "cap", seg, text: cleanText(o.text), final: o.final === true };
  }
  return null;
}

/** Single spaces, no control characters, bounded length. */
export function cleanText(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_CAPTION_CHARS);
}

// ── Sender: numbering segments + throttling partials ────────────────

/**
 * Turns recognizer events into "cap" messages: partials are throttled
 * (≥ `minGapMs` apart, only when the text changed), finals always go out and
 * open the next segment. Empty finals (silence) are skipped.
 */
export class CaptionSender {
  private seg = 0;
  private lastSent = "";
  private lastAt = -Infinity;
  private pending: string | null = null;
  private readonly minGapMs: number;

  constructor(minGapMs = 150) {
    this.minGapMs = minGapMs;
  }

  /** Returns the message to send now (or null). Call `flush()` later to emit a held-back partial. */
  partial(text: string, now: number): CaptionMsg | null {
    const t = cleanText(text);
    if (t === this.lastSent) {
      this.pending = null;
      return null;
    }
    if (now - this.lastAt < this.minGapMs) {
      this.pending = t;
      return null;
    }
    return this.emit(t, now);
  }

  /** A held-back partial, if its throttle window has passed. */
  flush(now: number): CaptionMsg | null {
    if (this.pending === null || now - this.lastAt < this.minGapMs) return null;
    const t = this.pending;
    this.pending = null;
    return t === this.lastSent ? null : this.emit(t, now);
  }

  final(text: string, now: number): CaptionMsg | null {
    const t = cleanText(text);
    this.pending = null;
    const seg = this.seg;
    const hadPartial = this.lastSent !== "";
    this.lastSent = "";
    this.lastAt = -Infinity; // the next utterance's first words go out immediately
    if (!t && !hadPartial) return null; // nothing was said
    this.seg++;
    return { t: "cap", seg, text: t, final: true };
  }

  /** Recognition stopped mid-utterance: fix what was shown so far. */
  close(now: number): CaptionMsg | null {
    const t = this.pending ?? this.lastSent;
    return t ? this.final(t, now) : null;
  }

  private emit(text: string, now: number): CaptionMsg {
    this.lastSent = text;
    this.lastAt = now;
    return { t: "cap", seg: this.seg, text, final: false };
  }
}

// ── Receiver / local view: merging into a transcript ────────────────

export interface CaptionLine {
  /** who said it: "me" or a peer id */
  who: string;
  seg: number;
  text: string;
  final: boolean;
  /** when the line last changed (ms, caller's clock) */
  at: number;
}

/**
 * The call transcript: one line per (speaker, segment). Partials replace the
 * text of their segment; a final fixes it; an empty final removes it. Lives
 * only in memory for the duration of the call.
 */
export class CaptionLog {
  private lines: CaptionLine[] = [];
  private index = new Map<string, CaptionLine>();
  private readonly maxLines: number;

  constructor(maxLines = 400) {
    this.maxLines = maxLines;
  }

  apply(who: string, msg: { seg: number; text: string; final: boolean }, now: number): boolean {
    const key = `${who}\u0000${msg.seg}`;
    const cur = this.index.get(key);
    if (cur?.final) return false; // late partial after the final
    if (!msg.text) {
      if (!cur) return false;
      this.lines = this.lines.filter((l) => l !== cur);
      this.index.delete(key);
      return true;
    }
    if (cur) {
      if (cur.text === msg.text && cur.final === msg.final) return false;
      cur.text = msg.text;
      cur.final = msg.final;
      cur.at = now;
      return true;
    }
    // a newer segment from the same speaker closes any stale partial of theirs
    for (const l of this.lines) if (l.who === who && !l.final && l.seg < msg.seg) l.final = true;
    const line: CaptionLine = { who, seg: msg.seg, text: msg.text, final: msg.final, at: now };
    this.lines.push(line);
    this.index.set(key, line);
    if (this.lines.length > this.maxLines) {
      const drop = this.lines.splice(0, this.lines.length - this.maxLines);
      for (const l of drop) this.index.delete(`${l.who}\u0000${l.seg}`);
    }
    return true;
  }

  /** Drop a speaker's unfinished line (they left / stopped sending). */
  closeSpeaker(who: string): void {
    for (const l of this.lines) if (l.who === who && !l.final) l.final = true;
  }

  all(): readonly CaptionLine[] {
    return this.lines;
  }

  /** Lines for the on-screen overlay: the last `max` lines that changed within `windowMs`. */
  recent(now: number, opts: { windowMs?: number; max?: number; who?: (w: string) => boolean } = {}): CaptionLine[] {
    const { windowMs = 6000, max = 2, who } = opts;
    const out: CaptionLine[] = [];
    for (let i = this.lines.length - 1; i >= 0 && out.length < max; i--) {
      const l = this.lines[i];
      if (who && !who(l.who)) continue;
      // a partial stays up while it is being spoken (but not forever if the sender vanished)
      if (now - l.at <= (l.final ? windowMs : Math.max(windowMs, 15000))) out.unshift(l);
    }
    return out;
  }

  /** Plain-text transcript (for «Скопировать»). */
  toText(label: (who: string) => string): string {
    return this.lines.map((l) => `${label(l.who)}: ${l.text}`).join("\n");
  }

  clear(): void {
    this.lines = [];
    this.index.clear();
  }
}
