"use client";

/**
 * STUN/TURN reachability: gathers ICE candidates with the exact ICE servers
 * the call uses (getIceServers from useP2PCall). A relay candidate from our
 * TURN entry means coturn is reachable and accepts the credentials.
 */
import { useState } from "react";
import { Globe, Play, Plug, Radio, Server } from "lucide-react";
import { Badge, Button, Card, CardHead, Input } from "@/ui";
import { getIceServers } from "@/hooks/useP2PCall";
import { StatGrid } from "./shared";
import s from "./lab.module.css";

interface Probe {
  url: string;
  kind: "stun" | "turn";
  state: "idle" | "running" | "ok" | "fail";
  ms: number | null;
  found: string[];
  errors: string[];
}

const TIMEOUT = 7000;

function urlsOf(srv: RTCIceServer): string[] {
  return Array.isArray(srv.urls) ? srv.urls : [srv.urls];
}

function probe(server: RTCIceServer, onUpdate: (p: Partial<Probe>) => void): Promise<void> {
  const url = urlsOf(server)[0];
  const turn = url.startsWith("turn");
  return new Promise((resolve) => {
    const t0 = performance.now();
    const found: string[] = [];
    const errors: string[] = [];
    let first: number | null = null;
    let pc: RTCPeerConnection;
    try {
      pc = new RTCPeerConnection({ iceServers: [server], iceTransportPolicy: turn ? "relay" : "all" });
    } catch (e) {
      onUpdate({ state: "fail", errors: [String((e as Error).message)] });
      resolve();
      return;
    }
    const want = turn ? "relay" : "srflx";
    const done = () => {
      clearTimeout(timer);
      pc.close();
      onUpdate({ state: found.length ? "ok" : "fail", ms: first, found: [...found], errors: [...errors] });
      resolve();
    };
    const timer = setTimeout(done, TIMEOUT);
    pc.onicecandidate = (e) => {
      if (!e.candidate) return done();
      const c = e.candidate;
      if (c.type === want) {
        if (first === null) first = Math.round(performance.now() - t0);
        const addr = `${c.address ?? "?"}:${c.port ?? "?"} (${(c.protocol ?? "").toUpperCase()})`;
        if (!found.includes(addr)) found.push(addr);
        onUpdate({ found: [...found], ms: first });
      }
    };
    pc.onicecandidateerror = (e) => {
      const ev = e as RTCPeerConnectionIceErrorEvent;
      const msg = `${ev.errorCode} ${ev.errorText || ""}`.trim();
      if (!errors.includes(msg)) errors.push(msg);
    };
    pc.createDataChannel("probe");
    pc.createOffer()
      .then((o) => pc.setLocalDescription(o))
      .catch((e) => {
        errors.push(String((e as Error).message));
        done();
      });
  });
}

function wsUrl(room: string, token: string) {
  const dev = process.env.NEXT_PUBLIC_WS_DEV_URL;
  if (dev) return `${dev}/ws/signaling/${room}/?token=${token}`;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}/ws/signaling/${room}/?token=${token}`;
}

/** Opens the signaling socket with a deliberately bad token: a 4001 close means nginx → daphne → Channels works. */
function checkSignaling(): Promise<{ ok: boolean; text: string; ms: number }> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    let settled = false;
    const finish = (ok: boolean, text: string) => {
      if (settled) return;
      settled = true;
      resolve({ ok, text, ms: Math.round(performance.now() - t0) });
    };
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl(crypto.randomUUID?.() ?? "00000000-0000-4000-8000-000000000000", "lab-probe"));
    } catch (e) {
      finish(false, (e as Error).message);
      return;
    }
    const timer = setTimeout(() => {
      ws.close();
      finish(false, "Нет ответа за 6 секунд");
    }, 6000);
    ws.onclose = (e) => {
      clearTimeout(timer);
      if (e.code === 4001) finish(true, "Сервер ответил и отклонил пробный токен, как и должен");
      else finish(false, `Соединение закрыто с кодом ${e.code}`);
    };
    ws.onerror = () => undefined;
  });
}

export function NetworkPanel() {
  const [servers] = useState<RTCIceServer[]>(() => (typeof window === "undefined" ? [] : getIceServers()));
  const [probes, setProbes] = useState<Probe[]>([]);
  const [running, setRunning] = useState(false);
  const [ws, setWs] = useState<{ ok: boolean; text: string; ms: number } | null>(null);
  const [custom, setCustom] = useState({ urls: "", username: "", credential: "" });

  const run = async (list: RTCIceServer[]) => {
    setRunning(true);
    const init: Probe[] = list.map((srv) => {
      const url = urlsOf(srv)[0];
      return { url, kind: url.startsWith("turn") ? "turn" : "stun", state: "running", ms: null, found: [], errors: [] };
    });
    setProbes(init);
    const update = (i: number) => (p: Partial<Probe>) => setProbes((cur) => cur.map((x, j) => (j === i ? { ...x, ...p } : x)));
    await Promise.all([
      ...list.map((srv, i) => probe(srv, update(i))),
      list === servers ? checkSignaling().then(setWs) : Promise.resolve(),
    ]);
    setRunning(false);
  };

  const turnOk = probes.some((p) => p.kind === "turn" && p.state === "ok");
  const stunOk = probes.some((p) => p.kind === "stun" && p.state === "ok");
  const finished = probes.length > 0 && !running;

  return (
    <div className={s.stack}>
      <Card as="section">
        <CardHead
          icon={<Radio size={20} />}
          title="STUN и TURN"
          sub="Собираем ICE-кандидаты с теми же серверами, что использует звонок. Relay-кандидат от TURN значит, что наш coturn доступен и пароль подходит."
          action={
            <Button variant="primary" icon={<Play size={16} />} loading={running} onClick={() => run(servers)}>
              Проверить
            </Button>
          }
        />
        {finished && (
          <div className={s.verdicts}>
            <Badge tone={stunOk ? "success" : "danger"} dot>
              {stunOk ? "STUN работает" : "STUN не ответил"}
            </Badge>
            <Badge tone={turnOk ? "success" : "danger"} dot>
              {turnOk ? "TURN выдаёт relay-кандидаты" : "TURN не выдал relay-кандидатов"}
            </Badge>
            {ws && (
              <Badge tone={ws.ok ? "success" : "warning"} dot>
                {ws.ok ? "Сигнальный сервер на связи" : "Сигнальный сервер не ответил"}
              </Badge>
            )}
          </div>
        )}
        <ul className={s.probes}>
          {(probes.length ? probes : servers.map((srv) => ({ url: urlsOf(srv)[0], kind: urlsOf(srv)[0].startsWith("turn") ? "turn" : "stun", state: "idle", ms: null, found: [], errors: [] }) as Probe)).map((p) => (
            <li key={p.url}>
              <span className={s.probeIcon} data-kind={p.kind}>
                {p.kind === "turn" ? <Server size={16} /> : <Globe size={16} />}
              </span>
              <div className={s.probeMain}>
                <code className={s.probeUrl}>{p.url}</code>
                {p.found.length > 0 && <div className={s.muted}>{p.kind === "turn" ? "Relay" : "Публичный адрес"}: {p.found.join(", ")}</div>}
                {p.state === "fail" && (
                  <div className={s.errorText}>
                    {p.errors.length ? p.errors.join("; ") : "Кандидатов нет: сервер недоступен или порт закрыт."}
                    {p.errors.some((e) => e.startsWith("401")) && " Похоже, неверный логин или пароль TURN."}
                  </div>
                )}
              </div>
              <span className={s.probeState}>
                {p.state === "running" ? (
                  <Badge tone="warning">Проверяем</Badge>
                ) : p.state === "ok" ? (
                  <Badge tone="success">{p.ms != null ? `${p.ms} мс` : "Есть"}</Badge>
                ) : p.state === "fail" ? (
                  <Badge tone="danger">Нет</Badge>
                ) : (
                  <Badge>Не проверен</Badge>
                )}
              </span>
            </li>
          ))}
        </ul>
        {ws && (
          <StatGrid
            items={[
              ["Сигнальный сервер (WebSocket)", ws.ok ? "на связи" : "нет ответа"],
              ["Ответ", ws.text],
              ["Время", `${ws.ms} мс`],
            ]}
          />
        )}
        {finished && !turnOk && (
          <p className={s.notice}>
            Без TURN звонок не соединится у тех, кто за строгим NAT (часть мобильных операторов, корпоративные сети). Проверьте, что контейнер coturn
            запущен, порты 3478 UDP и TCP и диапазон relay-портов открыты в файрволе, а логин и пароль в TURN_USER и TURN_PASSWORD совпадают с
            NEXT_PUBLIC_TURN_USER и NEXT_PUBLIC_TURN_PASSWORD при сборке сайта.
          </p>
        )}
      </Card>

      <Card as="section">
        <CardHead icon={<Plug size={20} />} title="Другой сервер" sub="Проверить произвольный STUN или TURN, например перед переездом coturn." />
        <div className={s.customGrid}>
          <Input label="Адрес" placeholder="turn:example.ru:3478?transport=udp" value={custom.urls} onChange={(e) => setCustom({ ...custom, urls: e.target.value })} />
          <Input label="Логин" value={custom.username} autoComplete="off" onChange={(e) => setCustom({ ...custom, username: e.target.value })} />
          <Input label="Пароль" type="password" autoComplete="new-password" value={custom.credential} onChange={(e) => setCustom({ ...custom, credential: e.target.value })} />
        </div>
        <Button
          variant="secondary"
          icon={<Play size={16} />}
          disabled={!/^(stun|turns?):/.test(custom.urls.trim()) || running}
          onClick={() => run([{ urls: custom.urls.trim(), ...(custom.username ? { username: custom.username, credential: custom.credential } : {}) }])}
        >
          Проверить этот сервер
        </Button>
      </Card>
    </div>
  );
}
