"use client";

/** Internal gallery of the illustration library (404 in production). */
import { notFound } from "next/navigation";
import { useEffect, useState } from "react";
import * as I from "@/components/illustrations";

const SCENES = [
  "HeroConversation", "MaskFriend", "Hello", "Breathing", "Listening", "CozyCorner", "TeaWait", "CalendarSparkle",
  "ShieldFriend", "MirrorAvatar", "ChatBubbles", "SleepingMoon", "Sunrise", "PaperPlane", "MagnifierFind",
  "HeartHands", "LostBubble", "KeyFriend", "SpecialistFriend", "Together", "SparkleSet", "DoorWelcome",
] as const;
const SPOTS: I.SpotName[] = ["key", "mask", "specialist", "card", "video", "shield", "direct", "trash", "calendar", "chat", "heart", "clock", "headphones", "mic", "lock", "sparkle", "leaf", "book"];
const TOPICS = ["anxiety", "mood", "stress", "sleep", "relationships", "self", "loss", "therapy", "boundaries", "loneliness", "breathing", "grounding", "body", "journaling", "mindfulness"];
const TONES = ["peach", "butter", "lime", "mint", "lilac", "sky"];

export default function Gallery() {
  if (process.env.NODE_ENV === "production") notFound();
  const [only, setOnly] = useState<string | null>(null);
  useEffect(() => setOnly(new URLSearchParams(window.location.search).get("only")), []);
  if (only === "spots") {
    return (
      <main style={{ padding: 16, background: "var(--c-page)", display: "flex", flexWrap: "wrap", gap: 16 }}>
        {SPOTS.map((n) => (
          <div key={n} style={{ background: "var(--c-panel)", borderRadius: 22, padding: 8 }}>
            <I.Spot name={n} size={150} />
          </div>
        ))}
      </main>
    );
  }
  if (only) {
    const names = only.split(",");
    return (
      <main style={{ padding: 16, background: "var(--c-page)", display: "flex", flexWrap: "wrap", gap: 16 }}>
        {names.map((n) => {
          const C = (I as unknown as Record<string, (p: object) => JSX.Element>)[n];
          return (
            <div key={n} style={{ width: 460, background: "var(--c-panel)", borderRadius: 22, padding: 12 }}>
              {C ? <C /> : n}
            </div>
          );
        })}
      </main>
    );
  }
  return (
    <main style={{ padding: 24, background: "var(--c-page)", color: "var(--c-text)", minHeight: "100vh" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
        {SCENES.map((n) => {
          const C = (I as unknown as Record<string, (p: object) => JSX.Element>)[n];
          return (
            <div key={n} style={{ background: "var(--c-panel)", borderRadius: 22, padding: 16 }}>
              <C />
              <div style={{ fontSize: 12, color: "var(--c-muted)", marginTop: 6 }}>{n}</div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 24, background: "var(--c-panel)", padding: 16, borderRadius: 22 }}>
        {SPOTS.map((n) => (
          <div key={n} style={{ textAlign: "center", fontSize: 11, color: "var(--c-muted)" }}>
            <I.Spot name={n} size={72} />
            {n}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginTop: 24 }}>
        {TOPICS.map((t, i) => (
          <div key={t} style={{ background: `var(--p-${TONES[i % 6]})`, borderRadius: 18, padding: 8, aspectRatio: "4 / 3" }}>
            <I.TopicArt topic={t} />
            <div style={{ fontSize: 11, color: "#111" }}>{t}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
