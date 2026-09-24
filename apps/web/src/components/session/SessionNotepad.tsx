"use client";

import { useEffect, useRef, useState } from "react";

const TTL_MS = 24 * 60 * 60 * 1000;

/** Private notes kept only in this browser; they expire after 24 hours. */
export function SessionNotepad({ roomId }: { roomId: string }) {
  const [text, setText] = useState("");
  const [saved, setSaved] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const key = `aprosop.note.${roomId}`;

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const { value, ts } = JSON.parse(raw);
      if (Date.now() - ts > TTL_MS) localStorage.removeItem(key);
      else setText(value);
    } catch {
      /* ignore */
    }
  }, [key]);

  const onChange = (v: string) => {
    setText(v);
    setSaved(false);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ value: v, ts: Date.now() }));
        setSaved(true);
      } catch {
        /* storage unavailable */
      }
    }, 600);
  };

  const clear = () => {
    setText("");
    setSaved(false);
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1, minHeight: 0 }}>
      <textarea
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Мысли, вопросы, то, что хочется запомнить"
        aria-label="Заметки к сессии"
        style={{
          flex: 1,
          minHeight: 200,
          resize: "none",
          background: "var(--c-raised)",
          border: 0,
          borderRadius: "var(--r-control)",
          padding: 14,
          color: "var(--c-text)",
          fontSize: "var(--t-15)",
          lineHeight: 1.55,
          outline: "none",
          fontFamily: "var(--font)",
        }}
      />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "var(--t-12)", color: "var(--c-muted)" }}>
        <span>{saved ? "Сохранено в этом браузере" : "Хранятся только у вас, удалятся через 24 часа"}</span>
        {text && (
          <button type="button" onClick={clear} style={{ background: "none", border: 0, color: "var(--c-muted)", fontSize: "var(--t-12)", textDecoration: "underline" }}>
            Очистить
          </button>
        )}
      </div>
    </div>
  );
}
