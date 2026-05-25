"use client";

import { useCallback, useRef, useState, useEffect } from "react";
import { useCallSession } from "@/hooks/useCallSession";
import { useAmbientSound, type AmbientPreset } from "@/hooks/useAmbientSound";
import { SessionNotepad } from "@/components/session/SessionNotepad";
import { BreathingSync }  from "@/components/session/BreathingSync";

// ─── Props ────────────────────────────────────────────────────────────────────
interface VideoSessionProps {
  roomId: string;
  role:   "client" | "psychologist";
  onEnd?: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s: number) {
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────
function MicIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6"/>
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
    </svg>
  );
}

function CamIcon({ off }: { off: boolean }) {
  return off ? (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06A4 4 0 1 1 7.28 7.28"/>
    </svg>
  ) : (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 7 16 12 23 17V7z"/>
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 1 1 0 0 1-.2-.15M5 3a2 2 0 0 0-2 2v3c0 1.05.81 1.93 1.85 2a12.84 12.84 0 0 0 .65 2.57"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

function LogoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 44" fill="none">
      <defs>
        <linearGradient id="mgi" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4DA6FF"/>
          <stop offset="55%" stopColor="#8B6CF8"/>
          <stop offset="100%" stopColor="#FF7B7B"/>
        </linearGradient>
      </defs>
      <ellipse cx="20" cy="22" rx="19" ry="21" fill="url(#mgi)"/>
      <ellipse cx="13" cy="19" rx="4.5" ry="3.5" fill="rgba(0,0,0,0.7)"/>
      <ellipse cx="27" cy="19" rx="4.5" ry="3.5" fill="rgba(0,0,0,0.7)"/>
      <rect x="14" y="28" width="12" height="4" rx="2" fill="rgba(0,0,0,0.7)"/>
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export function VideoSession({ roomId, role, onEnd }: VideoSessionProps) {
  const [showControls, setShowControls] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [showNotepad,  setShowNotepad]  = useState(false);
  const [showBreath,   setShowBreath]   = useState(false);

  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const displayName = role === "psychologist" ? "Специалист" : "Клиент";

  const ambient = useAmbientSound(null);

  const {
    status, isMuted, isCameraOff, hasRemote, elapsed,
    initContainer, toggleMute, toggleCamera, hangUp, retryNow,
  } = useCallSession({ roomId, displayName, onEnd });

  // ── Auto-hide controls ───────────────────────────────────────────
  const resetHide = useCallback(() => {
    setShowControls(true);
    clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setShowControls(false), 4500);
  }, []);

  useEffect(() => { resetHide(); return () => clearTimeout(hideTimerRef.current); }, [resetHide]);
  useEffect(() => { if (!showControls) { setShowSettings(false); } }, [showControls]);

  const handleHangUp = () => { ambient.setEnabled(false); hangUp(); };

  // ── Status labels ────────────────────────────────────────────────
  const isConnected    = status === "connected";
  const isWaiting      = !hasRemote && isConnected;
  const isFailed       = status === "failed";
  const isReconnecting = status === "reconnecting";
  const isLoading      = status === "loading";

  const stateLabel =
    isFailed            ? "Соединение потеряно"
    : isReconnecting    ? "Восстановление связи…"
    : isLoading         ? "Подключение..."
    : isWaiting && role === "client" ? "Ожидание специалиста..."
    : isWaiting         ? "Ожидание клиента..."
    : hasRemote         ? "Соединение активно"
    : "Подключение...";

  const dotColor =
    isConnected && hasRemote ? "#31D97B"
    : isFailed               ? "#FF4D4D"
    : isReconnecting         ? "#F59E0B"
    : isWaiting || isLoading ? "#F59E0B"
    : "#4A5A72";

  // ─────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        position: "relative", width: "100vw", height: "100dvh",
        background: "#0A0D18", overflow: "hidden",
        fontFamily: "Inter, system-ui, sans-serif",
        cursor: showControls ? "default" : "none",
      }}
      onMouseMove={resetHide}
      onTouchStart={resetHide}
    >

      {/* ── JITSI VIDEO (fills screen via iframe) ────────────── */}
      <div
        ref={initContainer}
        style={{
          position: "absolute", inset: 0,
          zIndex: 1,
          background: "#0A0D18",
          overflow: "hidden",
        }}
      />

      {/* ── Mouse detection layer — active only when controls hidden ── */}
      <div
        style={{
          position: "absolute", inset: 0, zIndex: 3,
          pointerEvents: showControls ? "none" : "auto",
        }}
        onMouseMove={resetHide}
        onTouchStart={resetHide}
      />

      {/* ── Subtle dark vignette gradient overlay ─────────────── */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none",
        background: "linear-gradient(180deg, rgba(10,13,24,0.72) 0%, transparent 15%, transparent 72%, rgba(10,13,24,0.88) 100%)",
      }}/>

      {/* ── RECONNECTING TOAST ────────────────────────────────── */}
      {isReconnecting && (
        <div style={{
          position: "absolute", top: 64, left: "50%",
          transform: "translateX(-50%)",
          zIndex: 30, whiteSpace: "nowrap",
          background: "rgba(10,13,24,0.88)", backdropFilter: "blur(12px)",
          border: "1px solid rgba(245,158,11,0.35)", borderRadius: 9999,
          padding: "6px 18px",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#F59E0B",
            animation: "pulseDot 1s ease-in-out infinite",
          }}/>
          <span style={{ fontSize: 12, color: "#F59E0B" }}>Восстановление связи…</span>
        </div>
      )}

      {/* ── WAITING / CONNECTING / FAILED OVERLAY ────────────── */}
      {(!hasRemote && (isLoading || isWaiting || isFailed)) && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 5,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 20,
          background: "rgba(10,13,24,0.82)", backdropFilter: "blur(4px)",
          pointerEvents: isFailed ? "auto" : "none",
        }}>
          {!isFailed ? (
            <div style={{
              width: 54, height: 54, borderRadius: "50%",
              border: "2px solid rgba(77,166,255,0.25)",
              borderTopColor: "#4DA6FF",
              animation: "spin 1.1s linear infinite",
            }}/>
          ) : <LogoIcon size={48} />}

          <p style={{ color: "#8A9BB8", fontSize: "15px", margin: 0 }}>{stateLabel}</p>

          {isFailed && (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={retryNow}
                style={{
                  padding: "8px 22px", borderRadius: "8px", cursor: "pointer",
                  background: "rgba(77,166,255,0.15)", border: "1px solid rgba(77,166,255,0.3)",
                  color: "#4DA6FF", fontSize: "13px", fontFamily: "inherit",
                }}
              >
                Попробовать снова
              </button>
              <button
                onClick={onEnd}
                style={{
                  padding: "8px 22px", borderRadius: "8px", cursor: "pointer",
                  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)",
                  color: "#8A9BB8", fontSize: "13px", fontFamily: "inherit",
                }}
              >
                Выйти
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── TOP BAR ──────────────────────────────────────────────── */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, zIndex: 20,
        height: 56, display: "flex", alignItems: "center",
        justifyContent: "space-between", padding: "0 16px",
        transition: "opacity 0.35s ease",
        opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? "auto" : "none",
      }}>
        {/* Logo + status */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <LogoIcon size={16} />
            <span style={{ fontSize: "14px", fontWeight: 600, color: "#F0F4FF", letterSpacing: "-0.01em" }}>
              aprosop
            </span>
          </div>

          <div style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(10,13,24,0.7)", backdropFilter: "blur(16px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9999,
            padding: "4px 12px",
          }}>
            <div style={{
              width: 7, height: 7, borderRadius: "50%",
              background: dotColor, boxShadow: `0 0 6px ${dotColor}`,
              animation: hasRemote ? "pulseDot 2s ease-in-out infinite" : "none",
            }}/>
            <span style={{ fontSize: "12px", color: "#8A9BB8" }}>{stateLabel}</span>
            {hasRemote && (
              <>
                <span style={{ color: "rgba(255,255,255,0.08)", fontSize: 12 }}>|</span>
                <span style={{ fontSize: "12px", color: "#4A5A72", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(elapsed)}
                </span>
              </>
            )}
          </div>
        </div>

        {/* Encrypted badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "rgba(10,13,24,0.7)", backdropFilter: "blur(16px)",
          border: "1px solid rgba(49,217,123,0.2)", borderRadius: 9999,
          padding: "4px 12px",
        }}>
          <span style={{ fontSize: 11, color: "#31D97B" }}>●</span>
          <span style={{ fontSize: 11, color: "#4A5A72", fontFamily: "JetBrains Mono, monospace", letterSpacing: "0.05em" }}>
            ENCRYPTED
          </span>
        </div>
      </div>

      {/* ── PSYCHOLOGIST EMOTION GRID (right panel) ─────────────── */}
      {role === "psychologist" && hasRemote && (
        <div style={{
          position: "absolute", right: 16, top: 70, width: 200, zIndex: 15,
          transition: "opacity 0.35s ease",
          opacity: showControls ? 1 : 0,
          pointerEvents: showControls ? "auto" : "none",
        }}>
          <div style={{
            background: "rgba(10,13,24,0.8)", backdropFilter: "blur(20px)",
            border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
            padding: "14px 16px",
          }}>
            <div style={{ fontSize: 10, color: "#4A5A72", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
              Эмоции клиента
            </div>
            {[
              { label: "Тревога",    val: 68, color: "#FF7B7B" },
              { label: "Спокойствие",val: 43, color: "#4DA6FF" },
              { label: "Грусть",     val: 71, color: "#8B6CF8" },
              { label: "Любопытство",val: 32, color: "#31D97B" },
              { label: "Напряжение", val: 55, color: "#F59E0B" },
            ].map(e => (
              <div key={e.label} style={{ marginBottom: 9 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: "#8A9BB8" }}>{e.label}</span>
                  <span style={{ fontSize: 11, color: e.color, fontFamily: "JetBrains Mono, monospace" }}>{e.val}%</span>
                </div>
                <div style={{ height: 3, background: "rgba(255,255,255,0.06)", borderRadius: 9999 }}>
                  <div style={{ height: "100%", width: `${e.val}%`, background: e.color, borderRadius: 9999, opacity: 0.85, transition: "width 0.6s ease" }}/>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LEFT SIDE PANEL BUTTONS ───────────────────────────────── */}
      <div style={{
        position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)",
        display: "flex", flexDirection: "column", gap: 8, zIndex: 15,
        transition: "opacity 0.35s ease",
        opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? "auto" : "none",
      }}>
        {/* Notepad */}
        <button
          onClick={() => { setShowNotepad(s => !s); setShowBreath(false); }}
          title="Заметки"
          style={sideBtn(showNotepad, "#4DA6FF")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
        </button>
        {/* Breathing */}
        <button
          onClick={() => { setShowBreath(s => !s); setShowNotepad(false); }}
          title="Дыхательная синхронизация"
          style={sideBtn(showBreath, "#31D97B")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>
          </svg>
        </button>
        {/* Ambient */}
        <button
          onClick={() => ambient.setEnabled((e: boolean) => !e)}
          title={ambient.enabled ? "Выключить звуки" : "Звуки природы"}
          style={sideBtn(ambient.enabled, "#8B6CF8")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
          </svg>
        </button>
        {/* Settings */}
        <button
          onClick={() => setShowSettings(s => !s)}
          title="Настройки"
          style={sideBtn(showSettings, "#8A9BB8")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
          </svg>
        </button>
      </div>

      {/* ── NOTEPAD PANEL ─────────────────────────────────────────── */}
      {showNotepad && (
        <div style={floatingPanel("left", 70)}>
          <SessionNotepad roomId={roomId} />
        </div>
      )}

      {/* ── BREATHING PANEL ──────────────────────────────────────── */}
      {showBreath && (
        <div style={floatingPanel("left", 70)}>
          <BreathingSync />
        </div>
      )}

      {/* ── SETTINGS PANEL ───────────────────────────────────────── */}
      {showSettings && (
        <div style={floatingPanel("left", 70)}>
          <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "#4A5A72", marginBottom: 14 }}>
            Настройки
          </div>
          {ambient.enabled && (
            <>
              <div style={{ fontSize: 11, color: "#4A5A72", marginBottom: 8 }}>Звуки природы</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                {(["rain", "forest", "ocean"] as AmbientPreset[]).map(p => (
                  <button key={p} onClick={() => ambient.setPreset(p)}
                    style={{
                      padding: "6px 4px", borderRadius: 8, fontSize: 11, cursor: "pointer",
                      background: ambient.preset === p ? "rgba(77,166,255,0.18)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${ambient.preset === p ? "rgba(77,166,255,0.4)" : "rgba(255,255,255,0.06)"}`,
                      color: ambient.preset === p ? "#4DA6FF" : "#8A9BB8", fontFamily: "inherit",
                    }}>
                    {p === "rain" ? "Дождь" : p === "forest" ? "Лес" : "Океан"}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#4A5A72", marginBottom: 6 }}>Громкость</div>
              <input type="range" min={0} max={1} step={0.05} value={ambient.volume}
                onChange={e => ambient.setVolume(Number(e.target.value))}
                style={{ width: "100%", accentColor: "#4DA6FF" }}/>
            </>
          )}
        </div>
      )}

      {/* ── BOTTOM CONTROLS ───────────────────────────────────────── */}
      <div style={{
        position: "absolute", bottom: 20, left: "50%",
        transform: "translateX(-50%)",
        display: "flex", alignItems: "center", gap: 10, zIndex: 20,
        transition: "opacity 0.35s ease, transform 0.35s ease",
        opacity: showControls ? 1 : 0,
        pointerEvents: showControls ? "auto" : "none",
      }}>
        {/* Mic */}
        <CtrlBtn
          active={isMuted}
          activeColor="#FF4D4D"
          onClick={toggleMute}
          title={isMuted ? "Включить микрофон" : "Выключить микрофон"}
        >
          <MicIcon muted={isMuted} />
        </CtrlBtn>

        {/* Camera */}
        <CtrlBtn
          active={isCameraOff}
          activeColor="#FF4D4D"
          onClick={toggleCamera}
          title={isCameraOff ? "Включить камеру" : "Выключить камеру"}
        >
          <CamIcon off={isCameraOff} />
        </CtrlBtn>

        {/* Hang up (red, slightly larger) */}
        <button
          onClick={handleHangUp}
          title="Завершить звонок"
          style={{
            width: 58, height: 58, borderRadius: "50%", cursor: "pointer",
            background: "linear-gradient(135deg, #FF4D4D 0%, #CC2929 100%)",
            border: "none", color: "#fff",
            boxShadow: "0 4px 22px rgba(255,77,77,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
          }}
          onMouseEnter={e => Object.assign((e.currentTarget as HTMLElement).style, { transform: "scale(1.1)", boxShadow: "0 6px 30px rgba(255,77,77,0.55)" })}
          onMouseLeave={e => Object.assign((e.currentTarget as HTMLElement).style, { transform: "scale(1)", boxShadow: "0 4px 22px rgba(255,77,77,0.4)" })}
        >
          <PhoneOffIcon />
        </button>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulseDot { 0%,100% { opacity:1; } 50% { opacity:0.45; } }
      `}</style>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function CtrlBtn({
  children, active, activeColor, onClick, title,
}: {
  children: React.ReactNode;
  active: boolean;
  activeColor: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 48, height: 48, borderRadius: "50%", cursor: "pointer",
        background: active
          ? `${activeColor}22`
          : "rgba(14,18,32,0.8)",
        border: `1px solid ${active ? `${activeColor}55` : "rgba(255,255,255,0.1)"}`,
        color: active ? activeColor : "#F0F4FF",
        backdropFilter: "blur(16px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.18s ease",
        boxShadow: active ? `0 0 16px ${activeColor}33` : "none",
      }}
    >
      {children}
    </button>
  );
}

function sideBtn(active: boolean, accent: string): React.CSSProperties {
  return {
    width: 40, height: 40, borderRadius: "50%", cursor: "pointer",
    background: active ? `${accent}22` : "rgba(14,18,32,0.8)",
    border: `1px solid ${active ? `${accent}55` : "rgba(255,255,255,0.08)"}`,
    color: active ? accent : "#8A9BB8",
    backdropFilter: "blur(16px)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "all 0.18s ease",
  };
}

function floatingPanel(side: "left" | "right", offsetX: number): React.CSSProperties {
  const base: React.CSSProperties = {
    position: "absolute",
    top: "50%", transform: "translateY(-50%)",
    background: "rgba(10,13,24,0.92)", backdropFilter: "blur(24px)",
    border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16,
    padding: 18, zIndex: 25, width: 230,
    boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
    color: "#F0F4FF",
  };
  if (side === "left") base.left = offsetX + 4;
  else base.right = offsetX + 4;
  return base;
}
