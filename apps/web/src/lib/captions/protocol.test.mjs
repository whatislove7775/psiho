// Run: node --test src/lib/captions/protocol.test.mjs   (Node ≥ 22 strips the TS types on import)
import { test } from "node:test";
import assert from "node:assert/strict";
import { CaptionLog, CaptionSender, cleanText, encodeCaptionMsg, parseCaptionMsg, MAX_CAPTION_CHARS } from "./protocol.ts";

test("parse: accepts valid messages and round-trips", () => {
  const cap = { t: "cap", seg: 3, text: "привет", final: false };
  assert.deepEqual(parseCaptionMsg(encodeCaptionMsg(cap)), cap);
  const st = { t: "state", stt: true, want: false, textOnly: true };
  assert.deepEqual(parseCaptionMsg(encodeCaptionMsg(st)), st);
});

test("parse: rejects garbage and coerces flags", () => {
  assert.equal(parseCaptionMsg("{"), null);
  assert.equal(parseCaptionMsg(42), null);
  assert.equal(parseCaptionMsg(JSON.stringify({ t: "cap", seg: -1, text: "x" })), null);
  assert.equal(parseCaptionMsg(JSON.stringify({ t: "cap", seg: 1.5, text: "x" })), null);
  assert.equal(parseCaptionMsg(JSON.stringify({ t: "cap", seg: 1, text: 5 })), null);
  assert.equal(parseCaptionMsg(JSON.stringify({ t: "evil" })), null);
  assert.deepEqual(parseCaptionMsg(JSON.stringify({ t: "state", stt: "yes", want: 1 })), {
    t: "state",
    stt: false,
    want: false,
    textOnly: false,
  });
  assert.equal(parseCaptionMsg("x".repeat(10_000)), null);
});

test("cleanText: collapses whitespace, strips control chars, bounds length", () => {
  assert.equal(cleanText("  а\n\tб\u0000в  "), "а б в");
  assert.equal(cleanText("я".repeat(MAX_CAPTION_CHARS + 50)).length, MAX_CAPTION_CHARS);
});

test("sender: throttles partials, holds the latest, finals open a new segment", () => {
  const s = new CaptionSender(150);
  assert.deepEqual(s.partial("при", 0), { t: "cap", seg: 0, text: "при", final: false });
  assert.equal(s.partial("привет", 50), null); // throttled
  assert.equal(s.flush(100), null); // still inside the window
  assert.deepEqual(s.flush(200), { t: "cap", seg: 0, text: "привет", final: false });
  assert.equal(s.partial("привет", 400), null); // unchanged
  assert.deepEqual(s.final("привет как дела", 410), { t: "cap", seg: 0, text: "привет как дела", final: true });
  assert.equal(s.final("", 900), null); // silence
  assert.deepEqual(s.partial("хорошо", 1000), { t: "cap", seg: 1, text: "хорошо", final: false });
  // the recogniser dropped the utterance: an empty final still closes the shown partial
  assert.deepEqual(s.final("", 1100), { t: "cap", seg: 1, text: "", final: true });
  assert.deepEqual(s.partial("да", 1300), { t: "cap", seg: 2, text: "да", final: false });
});

test("log: partials replace, final fixes, late partials ignored, empty final removes", () => {
  const log = new CaptionLog();
  log.apply("peer", { seg: 0, text: "при", final: false }, 0);
  log.apply("peer", { seg: 0, text: "привет", final: false }, 10);
  assert.equal(log.all().length, 1);
  assert.equal(log.all()[0].text, "привет");
  log.apply("peer", { seg: 0, text: "привет всем", final: true }, 20);
  assert.equal(log.apply("peer", { seg: 0, text: "при", final: false }, 30), false);
  assert.equal(log.all()[0].text, "привет всем");
  log.apply("peer", { seg: 1, text: "эээ", final: false }, 40);
  assert.equal(log.all().length, 2);
  log.apply("peer", { seg: 1, text: "", final: true }, 50);
  assert.equal(log.all().length, 1);
});

test("log: interleaves speakers and closes stale partials of the same speaker", () => {
  const log = new CaptionLog();
  log.apply("me", { seg: 0, text: "я говорю", final: false }, 0);
  log.apply("peer", { seg: 0, text: "а я отвечаю", final: false }, 5);
  log.apply("me", { seg: 1, text: "дальше", final: false }, 10); // seg 0 final was lost
  const [a, b, c] = log.all();
  assert.equal(a.final, true);
  assert.equal(b.final, false);
  assert.equal(c.text, "дальше");
  assert.equal(log.toText((w) => (w === "me" ? "Вы" : "Специалист")), "Вы: я говорю\nСпециалист: а я отвечаю\nВы: дальше");
});

test("log: overlay shows the last lines, fades old finals, filters by speaker", () => {
  const log = new CaptionLog();
  log.apply("peer", { seg: 0, text: "один", final: true }, 0);
  log.apply("peer", { seg: 1, text: "два", final: true }, 1000);
  log.apply("me", { seg: 0, text: "мои слова", final: true }, 1500);
  log.apply("peer", { seg: 2, text: "три", final: false }, 2000);
  assert.deepEqual(log.recent(2100, { windowMs: 6000 }).map((l) => l.text), ["мои слова", "три"]);
  assert.deepEqual(log.recent(2100, { who: (w) => w !== "me" }).map((l) => l.text), ["два", "три"]);
  // 10 s later only the still-open partial remains
  assert.deepEqual(log.recent(12000).map((l) => l.text), ["три"]);
  // and a partial whose sender vanished disappears too
  assert.deepEqual(log.recent(30000), []);
});

test("log: bounded history", () => {
  const log = new CaptionLog(10);
  for (let i = 0; i < 25; i++) log.apply("peer", { seg: i, text: `фраза ${i}`, final: true }, i);
  assert.equal(log.all().length, 10);
  assert.equal(log.all()[0].text, "фраза 15");
  // evicted segments can be re-added without clashing with stale index entries
  assert.equal(log.apply("peer", { seg: 0, text: "снова", final: true }, 100), true);
});

test("log: closeSpeaker finalises their open line", () => {
  const log = new CaptionLog();
  log.apply("p1", { seg: 4, text: "не договорил", final: false }, 0);
  log.closeSpeaker("p1");
  assert.equal(log.all()[0].final, true);
});

test("sender: close() fixes an unfinished utterance", () => {
  const s = new CaptionSender(150);
  s.partial("я хотел", 0);
  s.partial("я хотел сказать", 50); // held back
  assert.deepEqual(s.close(60), { t: "cap", seg: 0, text: "я хотел сказать", final: true });
  assert.equal(s.close(70), null);
});
