"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Copy, Dices, Eye, Gauge, RefreshCw, ScanFace, Shuffle, Square, Upload, UserRound } from "lucide-react";
import { Badge, Button, Card, CardHead, Segmented, Textarea, useToast } from "@/ui";
import { useAuth } from "@/lib/auth/store";
import { normalizeAvatar, randomAvatar, type AvatarConfig } from "@/lib/avatar/schema";
import { BACKDROPS, type BackdropId } from "@/lib/avatar/backdrops";
import type { Framing } from "@/lib/avatar/kit/types";
import { AvatarThumb } from "@/components/avatar/AvatarThumb";
import { BackdropPicker } from "@/components/avatar/BackdropPicker";
import { useLabAvatarCamera, type LabDebug } from "./useLabAvatarCamera";
import { CanvasSlot, copyText, loadLabAvatar, saveLabAvatar, StatGrid, Switch } from "./shared";
import s from "./lab.module.css";

/** The 52 ARKit blendshapes, grouped for reading. MediaPipe has no tongueOut. */
const GROUPS: [string, string[]][] = [
  ["Брови", ["browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight"]],
  [
    "Глаза",
    [
      "eyeBlinkLeft", "eyeBlinkRight", "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight",
      "eyeLookUpLeft", "eyeLookUpRight", "eyeLookDownLeft", "eyeLookDownRight", "eyeLookInLeft", "eyeLookInRight",
      "eyeLookOutLeft", "eyeLookOutRight",
    ],
  ],
  ["Щёки и нос", ["cheekPuff", "cheekSquintLeft", "cheekSquintRight", "noseSneerLeft", "noseSneerRight"]],
  ["Челюсть", ["jawOpen", "jawForward", "jawLeft", "jawRight"]],
  [
    "Рот",
    [
      "mouthClose", "mouthFunnel", "mouthPucker", "mouthLeft", "mouthRight", "mouthSmileLeft", "mouthSmileRight",
      "mouthFrownLeft", "mouthFrownRight", "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight",
      "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthPressLeft", "mouthPressRight",
      "mouthLowerDownLeft", "mouthLowerDownRight", "mouthUpperUpLeft", "mouthUpperUpRight", "tongueOut",
    ],
  ],
];

const FRAMINGS: { value: Framing; label: string }[] = [
  { value: "portrait", label: "Плечи" },
  { value: "face", label: "Крупно" },
];
const CALIB: { value: string; label: string }[] = [
  { value: "1", label: "1 с" },
  { value: "1.5", label: "1,5 с" },
  { value: "3", label: "3 с" },
];

function seeds(n: number) {
  const base = Math.floor(Math.random() * 1e9);
  return Array.from({ length: n }, (_, i) => `lab-${base + i * 7919}`);
}

export function AvatarPlayground() {
  const toast = useToast();
  const { user } = useAuth();
  const [config, setConfig] = useState<AvatarConfig>(() => randomAvatar("lab-start"));
  const [framing, setFraming] = useState<Framing>("portrait");
  const [backdrop, setBackdrop] = useState<BackdropId>(BACKDROPS[0].id);
  const [idle, setIdle] = useState(true);
  const [calib, setCalib] = useState("1.5");
  const [deviceId, setDeviceId] = useState("");
  const [cams, setCams] = useState<MediaDeviceInfo[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [showPoints, setShowPoints] = useState(true);
  const [bsMode, setBsMode] = useState<"processed" | "raw">("processed");
  const [gallery, setGallery] = useState<string[]>(() => seeds(12));
  const [json, setJson] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Start from: the avatar chosen for test calls → my own → random.
  useEffect(() => {
    const lab = loadLabAvatar();
    if (lab) setConfig(normalizeAvatar(lab));
    else if (user?.avatar_config) setConfig(normalizeAvatar(user.avatar_config));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => setJson(JSON.stringify(config, null, 2)), [config]);

  const cam = useLabAvatarCamera(config, { backdrop, framing, idle, calibrationSeconds: Number(calib), deviceId: deviceId || undefined });
  const running = cam.state === "ready" || cam.state === "starting";

  useEffect(() => {
    if (cam.state !== "ready") return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setCams(d.filter((x) => x.kind === "videoinput")))
      .catch(() => {});
  }, [cam.state]);

  // Settings that need a new tracker / camera restart the pipeline.
  const restartKey = `${calib}|${deviceId}`;
  const lastKey = useRef(restartKey);
  useEffect(() => {
    if (lastKey.current === restartKey) return;
    lastKey.current = restartKey;
    if (running) cam.start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartKey]);

  // Live HUD at 5 Hz (the heavy per-frame parts are drawn without React below).
  const [hud, setHud] = useState<Pick<LabDebug, "trackFps" | "detectMs" | "faceVisible" | "videoWidth" | "videoHeight" | "pose" | "delegate">>({
    trackFps: 0, detectMs: 0, faceVisible: false, videoWidth: 0, videoHeight: 0, pose: null, delegate: "",
  });
  useEffect(() => {
    if (cam.state !== "ready") return;
    const t = setInterval(() => {
      const d = cam.debugRef.current;
      setHud({ trackFps: d.trackFps, detectMs: d.detectMs, faceVisible: d.faceVisible, videoWidth: d.videoWidth, videoHeight: d.videoHeight, pose: d.pose, delegate: d.delegate });
    }, 200);
    return () => clearInterval(t);
  }, [cam.state, cam.debugRef]);

  // Blendshape bars + landmark points, updated every animation frame straight in the DOM.
  const barRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const valRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const pointsRef = useRef<HTMLCanvasElement>(null);
  const videoHost = useRef<HTMLDivElement>(null);
  const modeRef = useRef(bsMode);
  modeRef.current = bsMode;

  useEffect(() => {
    if (cam.state !== "ready") return;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const d = cam.debugRef.current;
      const src = modeRef.current === "raw" ? d.raw : d.processed;
      for (const name in barRefs.current) {
        const v = src[name];
        const bar = barRefs.current[name];
        const val = valRefs.current[name];
        if (bar) bar.style.transform = `scaleX(${v ?? 0})`;
        if (val) val.textContent = v == null ? "—" : v.toFixed(2);
      }
      const c = pointsRef.current;
      if (c) {
        const w = c.clientWidth;
        const h = c.clientHeight;
        if (c.width !== w || c.height !== h) {
          c.width = w;
          c.height = h;
        }
        const g = c.getContext("2d");
        if (!g) return;
        g.clearRect(0, 0, w, h);
        if (!d.landmarks.length) return;
        // object-fit: cover mapping of the camera frame into the box, mirrored like a selfie
        const vw = d.videoWidth || 640;
        const vh = d.videoHeight || 480;
        const scale = Math.max(w / vw, h / vh);
        const ox = (w - vw * scale) / 2;
        const oy = (h - vh * scale) / 2;
        g.fillStyle = d.faceVisible ? "rgba(122,165,255,0.9)" : "rgba(255,181,71,0.9)";
        for (let i = 0; i < d.landmarks.length; i++) {
          const p = d.landmarks[i];
          const x = w - (ox + p.x * vw * scale);
          const y = oy + p.y * vh * scale;
          g.fillRect(x - 1, y - 1, i >= 468 ? 3 : 2, i >= 468 ? 3 : 2);
        }
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cam.state, cam.debugRef]);

  // Optional raw camera picture (staff's own face, lab only, off by default).
  useEffect(() => {
    const host = videoHost.current;
    const v = cam.video;
    if (!host || !v || !showRaw) return;
    v.className = s.rawVideo;
    host.appendChild(v);
    v.play().catch(() => undefined);
    return () => {
      if (v.parentNode === host) host.removeChild(v);
    };
  }, [cam.video, showRaw]);

  const applyJson = () => {
    try {
      const cfg = normalizeAvatar(JSON.parse(json));
      setConfig(cfg);
      setJsonError(null);
      toast("Аватар применён");
    } catch {
      setJsonError("Это не JSON. Проверьте скобки и кавычки.");
    }
  };

  const useInCalls = () => {
    saveLabAvatar(config);
    toast("Этот аватар будет у клиента в новых тестовых комнатах");
  };

  const pose = hud.pose;
  const statItems = useMemo<[string, string][]>(
    () => [
      ["Трекинг", cam.tracking ? `${hud.trackFps} кадр/с` : cam.state === "ready" ? "загружается" : "—"],
      ["Распознавание кадра", cam.tracking ? `${hud.detectMs.toFixed(1)} мс` : "—"],
      ["Движок", hud.delegate || "—"],
      ["Камера", hud.videoWidth ? `${hud.videoWidth}×${hud.videoHeight}` : "—"],
      ["Лицо", !cam.tracking ? "—" : hud.faceVisible ? "видно" : "не найдено"],
      ["Поворот головы", pose ? `${Math.round(pose.yaw)}°, ${Math.round(pose.pitch)}°, ${Math.round(pose.roll)}°` : "—"],
    ],
    [cam.tracking, cam.state, hud, pose],
  );

  return (
    <div className={s.playground}>
      <div className={s.pgMain}>
        <Card as="section">
          <CardHead
            icon={<ScanFace size={20} />}
            title="Камера и аватар"
            sub="Ваша камера управляет аватаром так же, как у клиента в звонке. Исходное видео скрыто, пока вы его не включите."
            action={
              running ? (
                <Button variant="secondary" icon={<Square size={16} />} onClick={cam.stop}>
                  Выключить
                </Button>
              ) : (
                <Button variant="primary" icon={<Camera size={16} />} onClick={cam.start}>
                  Включить камеру
                </Button>
              )
            }
          />
          <div className={s.pgStages}>
            <figure className={s.loopTile}>
              <div className={s.tileStage} data-framing={framing}>
                {cam.state === "ready" ? (
                  <CanvasSlot canvas={cam.canvas} />
                ) : (
                  <div className={s.tilePlaceholder}>
                    <AvatarThumb config={config} size={200} framing={framing} background="transparent" />
                    <span>{cam.state === "starting" ? "Включаем камеру" : cam.error ?? "Аватар оживёт, когда включится камера"}</span>
                  </div>
                )}
                {cam.state === "ready" && (
                  <div className={s.hud}>
                    <span className={s.hudDot} data-ok={hud.faceVisible || undefined} />
                    {!cam.tracking ? "Загружаем распознавание" : cam.calibrating ? "Калибровка: смотрите в камеру спокойно" : `${hud.trackFps} кадр/с`}
                  </div>
                )}
              </div>
              <figcaption>Аватар (это уходит собеседнику)</figcaption>
            </figure>
            <figure className={s.loopTile}>
              <div className={s.tileStage} data-dark>
                <div ref={videoHost} className={s.fill} />
                {showPoints && <canvas ref={pointsRef} className={s.points} aria-hidden />}
                {cam.state !== "ready" && <div className={s.tilePlaceholder}>Точки лица появятся после включения камеры</div>}
              </div>
              <figcaption>Маска трекинга: 478 точек{showRaw ? " поверх видео" : ""}</figcaption>
            </figure>
          </div>
          <div className={s.controlsRow}>
            <Switch checked={showPoints} onChange={setShowPoints} label="Точки лица" />
            <Switch
              checked={showRaw}
              onChange={setShowRaw}
              label="Показать исходное видео (только в лаборатории)"
              hint="Видно только вам на этом экране. В звонках исходное видео клиента не показывается нигде."
            />
          </div>
          <StatGrid items={statItems} />
        </Card>

        <Card as="section">
          <CardHead
            icon={<Gauge size={20} />}
            title="Мимика: 52 коэффициента ARKit"
            sub="Сырые значения модели и значения после калибровки и сглаживания, которые получает аватар."
          />
          <div className={s.bsMode}>
              <Segmented
                value={bsMode}
                onChange={setBsMode}
                options={[
                  { value: "processed", label: "Для аватара" },
                  { value: "raw", label: "Сырые" },
                ]}
                ariaLabel="Какие значения показать"
              />
          </div>
          <div className={s.bsGroups}>
            {GROUPS.map(([title, names]) => (
              <div key={title} className={s.bsGroup}>
                <div className={s.label}>{title}</div>
                {names.map((n) => (
                  <div key={n} className={s.bsRow} title={n}>
                    <span className={s.bsName}>{n}</span>
                    <span className={s.bsTrack}>
                      <span ref={(el) => {
                        barRefs.current[n] = el;
                      }} className={s.bsBar} />
                    </span>
                    <span ref={(el) => {
                      valRefs.current[n] = el;
                    }} className={`${s.bsVal} num`}>
                      —
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className={s.pgSide}>
        <Card as="section">
          <CardHead icon={<RefreshCw size={20} />} title="Калибровка и кадр" />
          <div className={s.stackSm}>
            <Button variant="soft" icon={<RefreshCw size={16} />} disabled={!cam.tracking || cam.calibrating} onClick={cam.recalibrate}>
              {cam.calibrating ? "Калибруем" : "Откалибровать заново"}
            </Button>
            {cam.calibrating && cam.tracking && <Badge tone="warning">Расслабьте лицо и смотрите в камеру</Badge>}
            <div>
              <div className={s.label}>Длительность калибровки</div>
              <Segmented value={calib} onChange={setCalib} options={CALIB} ariaLabel="Длительность калибровки" />
            </div>
            <div>
              <div className={s.label}>Кадрирование</div>
              <Segmented value={framing} onChange={setFraming} options={FRAMINGS} ariaLabel="Кадрирование" />
            </div>
            <Switch checked={idle} onChange={setIdle} label="Живая анимация без лица" hint="Моргание и дыхание, пока лицо не найдено." />
            {cams.length > 1 && (
              <label className={s.selectLabel}>
                <span className={s.label}>Камера</span>
                <select className={s.select} value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
                  <option value="">По умолчанию (фронтальная)</option>
                  {cams.map((c, i) => (
                    <option key={c.deviceId || i} value={c.deviceId}>
                      {c.label || `Камера ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div>
              <div className={s.label}>Фон</div>
              <BackdropPicker value={backdrop} onChange={setBackdrop} size="sm" />
            </div>
          </div>
        </Card>

        <Card as="section">
          <CardHead icon={<UserRound size={20} />} title="Аватар" />
          <div className={s.btnRow}>
            <Button variant="secondary" size="sm" icon={<Dices size={16} />} onClick={() => setConfig(randomAvatar(Math.random()))}>
              Случайный
            </Button>
            {user?.avatar_config && (
              <Button variant="ghost" size="sm" icon={<UserRound size={16} />} onClick={() => setConfig(normalizeAvatar(user.avatar_config))}>
                Мой
              </Button>
            )}
            <Button variant="soft" size="sm" icon={<Check size={16} />} onClick={useInCalls}>
              Использовать в тестовом звонке
            </Button>
          </div>
          <div className={s.galleryHead}>
            <div className={s.label}>Галерея случайных</div>
            <Button variant="ghost" size="sm" icon={<Shuffle size={16} />} onClick={() => setGallery(seeds(12))}>
              Другие
            </Button>
          </div>
          <div className={s.gallery}>
            {gallery.map((seed) => {
              const cfg = randomAvatar(seed);
              return (
                <button key={seed} type="button" className={s.galleryItem} onClick={() => setConfig(cfg)} aria-label="Выбрать этот аватар">
                  <AvatarThumb config={cfg} size={72} />
                </button>
              );
            })}
          </div>
        </Card>

        <Card as="section">
          <CardHead icon={<Eye size={20} />} title="Настройки аватара в JSON" sub="Можно вставить JSON из другого браузера или из базы и применить." />
          <Textarea
            aria-label="JSON аватара"
            className={s.json}
            value={json}
            spellCheck={false}
            onChange={(e) => setJson(e.target.value)}
            rows={10}
          />
          {jsonError && <p className={s.errorText}>{jsonError}</p>}
          <div className={s.btnRow}>
            <Button variant="secondary" size="sm" icon={<Upload size={16} />} onClick={applyJson}>
              Применить
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<Copy size={16} />}
              onClick={async () => toast((await copyText(json)) ? "JSON скопирован" : "Не получилось скопировать")}
            >
              Скопировать
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
