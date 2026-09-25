"use client";

/**
 * Voice filter tester. The recording is played back through the production
 * hook (useVoiceTransform), so what you hear is exactly what a specialist hears.
 */
import { useEffect, useRef, useState } from "react";
import { Ear, Mic, Play, Square, Waves } from "lucide-react";
import { Badge, Button, Card, CardHead, Segmented } from "@/ui";
import { useVoiceTransform, type VoicePreset } from "@/hooks/useVoiceTransform";
import { Meter, Switch } from "./shared";
import s from "./lab.module.css";

const PRESETS: { value: VoicePreset; label: string; text: string }[] = [
  { value: "off", label: "Без фильтра", text: "Как в жизни" },
  { value: "lower", label: "Ниже", text: "Глубже и глуше" },
  { value: "higher", label: "Выше", text: "Светлее и звонче" },
];

const REC_SECONDS = 6;

type Src = { stream: MediaStream; kind: "rec" | "live"; startAt?: () => void; stop: () => void };

function waveform(buf: AudioBuffer, bars = 96): number[] {
  const data = buf.getChannelData(0);
  const step = Math.floor(data.length / bars) || 1;
  const out: number[] = [];
  let max = 0;
  for (let i = 0; i < bars; i++) {
    let sum = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) sum += data[j] * data[j];
    const v = Math.sqrt(sum / step);
    out.push(v);
    max = Math.max(max, v);
  }
  return out.map((v) => (max ? v / max : 0));
}

export function VoicePanel() {
  const [recState, setRecState] = useState<"idle" | "recording" | "ready" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [left, setLeft] = useState(REC_SECONDS);
  const [level, setLevel] = useState(0);
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null);
  const [preset, setPreset] = useState<VoicePreset>("lower");
  const [playing, setPlaying] = useState<VoicePreset | null>(null);
  const [live, setLive] = useState(false);
  const [src, setSrc] = useState<Src | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const recStop = useRef<() => void>(() => {});

  const { transformedStream } = useVoiceTransform({ inputStream: src?.stream ?? null, preset: playing ?? preset });

  // Route the (filtered) stream to the speaker; start the recording once the graph is ready.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.srcObject = transformedStream;
    if (transformedStream) a.play().catch(() => undefined);
    if (transformedStream && src?.startAt) {
      const go = src.startAt;
      src.startAt = undefined;
      go();
    }
  }, [transformedStream, src]);

  const ctx = () => {
    if (!ctxRef.current || ctxRef.current.state === "closed") ctxRef.current = new AudioContext();
    ctxRef.current.resume().catch(() => {});
    return ctxRef.current;
  };

  const stopAll = () => {
    src?.stop();
    setSrc(null);
    setPlaying(null);
    setLive(false);
  };

  useEffect(
    () => () => {
      recStop.current();
      ctxRef.current?.close().catch(() => {});
    },
    [],
  );
  useEffect(() => () => src?.stop(), [src]);

  const record = async () => {
    stopAll();
    setError(null);
    let mic: MediaStream;
    try {
      // Same constraints as the call (useAvatarCamera)
      mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e) {
      setRecState("error");
      setError(`Микрофон недоступен: ${(e as DOMException)?.name || "ошибка"}. Разрешите доступ в браузере.`);
      return;
    }
    const c = ctx();
    const an = c.createAnalyser();
    an.fftSize = 1024;
    c.createMediaStreamSource(mic).connect(an);
    const buf = new Float32Array(an.fftSize);
    let raf = 0;
    const meter = () => {
      raf = requestAnimationFrame(meter);
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 5));
    };
    meter();

    const chunks: Blob[] = [];
    const rec = new MediaRecorder(mic);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    let timer: ReturnType<typeof setInterval> | undefined;
    const finish = () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      setLevel(0);
      mic.getTracks().forEach((t) => t.stop());
    };
    rec.onstop = async () => {
      finish();
      try {
        const data = await new Blob(chunks, { type: rec.mimeType }).arrayBuffer();
        const decoded = await ctx().decodeAudioData(data);
        setBuffer(decoded);
        setRecState("ready");
      } catch {
        setRecState("error");
        setError("Не получилось разобрать запись. Попробуйте ещё раз или в другом браузере.");
      }
    };
    recStop.current = () => {
      if (rec.state !== "inactive") rec.stop();
      else finish();
    };
    rec.start();
    setRecState("recording");
    let n = REC_SECONDS;
    setLeft(n);
    timer = setInterval(() => {
      n -= 1;
      setLeft(n);
      if (n <= 0) recStop.current();
    }, 1000);
  };

  const play = (p: VoicePreset) => {
    if (!buffer) return;
    stopAll();
    const c = ctx();
    const node = c.createBufferSource();
    node.buffer = buffer;
    const dest = c.createMediaStreamDestination();
    node.connect(dest);
    let started = false;
    node.onended = () => {
      setPlaying((cur) => (cur === p ? null : cur));
      setSrc((cur) => (cur?.stream === dest.stream ? null : cur));
    };
    setPlaying(p);
    setSrc({
      stream: dest.stream,
      kind: "rec",
      // give the filter graph a moment to connect, so the first syllable isn't lost
      startAt: () => setTimeout(() => {
        started = true;
        node.start();
      }, 120),
      stop: () => {
        try {
          if (started) node.stop();
        } catch {
          /* already stopped */
        }
        dest.stream.getTracks().forEach((t) => t.stop());
      },
    });
  };

  const toggleLive = async (on: boolean) => {
    stopAll();
    if (!on) return;
    try {
      const mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      setLive(true);
      setSrc({ stream: mic, kind: "live", stop: () => mic.getTracks().forEach((t) => t.stop()) });
    } catch (e) {
      setError(`Микрофон недоступен: ${(e as DOMException)?.name || "ошибка"}.`);
    }
  };

  const wave = buffer ? waveform(buffer) : null;

  return (
    <div className={s.stack}>
      <Card as="section">
        <CardHead
          icon={<Waves size={20} />}
          title="Фильтр голоса"
          sub="Запишите фразу и прослушайте её с каждым фильтром. Звук проходит через тот же код, что и в звонке, и не уходит с устройства."
        />
        <div className={s.voiceRec}>
          {recState === "recording" ? (
            <Button variant="danger" icon={<Square size={16} />} onClick={() => recStop.current()}>
              Остановить ({left} с)
            </Button>
          ) : (
            <Button variant="primary" icon={<Mic size={16} />} onClick={record}>
              {buffer ? "Записать заново" : `Записать ${REC_SECONDS} секунд`}
            </Button>
          )}
          <div className={s.voiceHint}>
            {recState === "recording" ? (
              <Meter value={level} tone="success" />
            ) : (
              <span className={s.muted}>Например: «Здравствуйте, это проверка голоса. Раз, два, три».</span>
            )}
          </div>
        </div>
        {wave && (
          <div className={s.wave} aria-hidden>
            {wave.map((v, i) => (
              <span key={i} style={{ transform: `scaleY(${Math.max(0.04, v)})` }} />
            ))}
          </div>
        )}
        {error && <p className={s.errorText}>{error}</p>}

        <div className={s.presetGrid}>
          {PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              className={s.presetTile}
              aria-pressed={playing === p.value}
              disabled={!buffer}
              onClick={() => (playing === p.value ? stopAll() : play(p.value))}
            >
              <span className={s.presetIcon}>{playing === p.value ? <Square size={18} /> : <Play size={18} />}</span>
              <span>
                <span className={s.presetTitle}>{p.label}</span>
                <span className={s.muted}>{p.text}</span>
              </span>
            </button>
          ))}
        </div>
      </Card>

      <Card as="section">
        <CardHead
          icon={<Ear size={20} />}
          title="Живое прослушивание"
          sub="Слышите себя с фильтром в реальном времени. Наденьте наушники, иначе микрофон подхватит динамик."
          action={live ? <Badge tone="success" dot>Идёт</Badge> : undefined}
        />
        <div className={s.controlsRow}>
          <Switch checked={live} onChange={toggleLive} label="Слушать себя" />
          <Segmented value={preset} onChange={setPreset} options={PRESETS.map(({ value, label }) => ({ value, label }))} ariaLabel="Фильтр для живого прослушивания" />
        </div>
      </Card>
      <audio ref={audioRef} hidden />
    </div>
  );
}
