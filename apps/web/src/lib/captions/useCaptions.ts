"use client";

/**
 * useCaptions — live captions over the call's data channels (1:1 calls and «Круги»).
 *
 *  - Viewer side: «Субтитры» (`show`) tells every peer "send me your captions";
 *    their lines are merged into an in-memory transcript (CaptionLog).
 *  - Speaker side: while at least one peer wants captions, or we speak in
 *    «Только текст» mode, the ORIGINAL microphone is recognised on this device
 *    (lib/captions/engine.ts) and only the text goes to those peers.
 *
 * Nothing is sent to our server and nothing is stored: the transcript lives
 * in this hook and disappears with the call (unless the user copies it).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CaptionLog, CaptionSender, encodeCaptionMsg, parseCaptionMsg, type CaptionMsg, type CaptionState } from "./protocol";
import { loadModel, onSttLoad, sttLoadState, sttManifest, startRecognition, type SttLoad } from "./engine";

export interface CaptionLink {
  /** stable peer id ("peer" in a 1:1 call, the circle handle in a group) */
  id: string;
  dc: RTCDataChannel | null;
}

interface Options {
  links: CaptionLink[];
  /** the original microphone track (before the voice filter) */
  micTrack: MediaStreamTrack | null;
  /** our microphone is on (recognition pauses while muted) */
  micOn: boolean;
  /** we speak through captions only (our audio track is not sent) */
  textOnly: boolean;
}

const SHOW_KEY = "aprosop.captions";

function loadShow(): boolean {
  try {
    return localStorage.getItem(SHOW_KEY) === "1";
  } catch {
    return false;
  }
}

export function useCaptions({ links, micTrack, micOn, textOnly }: Options) {
  const [available, setAvailable] = useState<boolean | null>(null);
  const [load, setLoad] = useState<SttLoad>(sttLoadState());
  const [show, setShowState] = useState(false);
  const [remote, setRemote] = useState<Record<string, CaptionState>>({});
  const [version, setVersion] = useState(0);
  const [recognizing, setRecognizing] = useState(false);
  const log = useRef(new CaptionLog()).current;
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    setShowState(loadShow());
    let alive = true;
    sttManifest().then((m) => alive && setAvailable(!!m));
    const off = onSttLoad(setLoad);
    return () => {
      alive = false;
      off();
    };
  }, []);

  const setShow = useCallback((on: boolean) => {
    setShowState(on);
    try {
      localStorage.setItem(SHOW_KEY, on ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  // ── channels ────────────────────────────────────────────────────────
  const linksRef = useRef(links);
  linksRef.current = links;
  const mine: CaptionState = useMemo(() => ({ stt: !!available, want: show, textOnly }), [available, show, textOnly]);
  const mineRef = useRef(mine);
  mineRef.current = mine;
  const remoteRef = useRef(remote);
  remoteRef.current = remote;

  const sendTo = (dc: RTCDataChannel | null, m: CaptionMsg) => {
    if (dc?.readyState !== "open") return;
    try {
      dc.send(encodeCaptionMsg(m));
    } catch {
      /* closing */
    }
  };

  const dcKey = links.map((l) => `${l.id}:${l.dc ? (l.dc as RTCDataChannel & { __ccId?: number }).__ccId ?? tagDc(l.dc) : 0}`).join("|");
  useEffect(() => {
    const cleanups: (() => void)[] = [];
    for (const { id, dc } of linksRef.current) {
      if (!dc) continue;
      const onOpen = () => sendTo(dc, { t: "state", ...mineRef.current });
      const onMsg = (e: MessageEvent) => {
        const m = parseCaptionMsg(e.data);
        if (!m) return;
        if (m.t === "state") {
          const { t: _t, ...st } = m;
          setRemote((r) => ({ ...r, [id]: st }));
          if (!st.textOnly && !st.want) {
            log.closeSpeaker(id);
            bump();
          }
        } else if (log.apply(id, m, performance.now())) bump();
      };
      const onClose = () => {
        log.closeSpeaker(id);
        setRemote((r) => {
          const { [id]: _gone, ...rest } = r;
          return rest;
        });
        bump();
      };
      dc.addEventListener("open", onOpen);
      dc.addEventListener("message", onMsg);
      dc.addEventListener("close", onClose);
      if (dc.readyState === "open") onOpen();
      cleanups.push(() => {
        dc.removeEventListener("open", onOpen);
        dc.removeEventListener("message", onMsg);
        dc.removeEventListener("close", onClose);
      });
    }
    // peers that disappeared from the list
    const ids = new Set(linksRef.current.map((l) => l.id));
    setRemote((r) => {
      const gone = Object.keys(r).filter((k) => !ids.has(k));
      if (!gone.length) return r;
      const next = { ...r };
      gone.forEach((k) => delete next[k]);
      return next;
    });
    return () => cleanups.forEach((f) => f());
  }, [dcKey, log, bump]);

  // announce our state on every change
  useEffect(() => {
    for (const l of linksRef.current) sendTo(l.dc, { t: "state", ...mine });
  }, [mine]);

  // ── recognition of our own voice ────────────────────────────────────
  const someoneWants = Object.values(remote).some((r) => r.want);
  const shouldRecognize = !!available && !!micTrack && micOn && (textOnly || someoneWants);
  useEffect(() => {
    if (!shouldRecognize || !micTrack) return;
    let stopped = false;
    let session: { stop: () => void; flush: () => void } | null = null;
    const sender = new CaptionSender();
    const broadcast = (m: CaptionMsg | null) => {
      if (!m || m.t !== "cap") return;
      if (log.apply("me", m, performance.now())) bump();
      for (const l of linksRef.current) {
        if (mineRef.current.textOnly || remoteRef.current[l.id]?.want) sendTo(l.dc, m);
      }
    };
    const tick = setInterval(() => broadcast(sender.flush(performance.now())), 100);
    startRecognition(micTrack, ({ text, final }) => {
      const now = performance.now();
      broadcast(final ? sender.final(text, now) : sender.partial(text, now));
    })
      .then((s) => {
        if (stopped) s.stop();
        else {
          session = s;
          setRecognizing(true);
        }
      })
      .catch(() => setRecognizing(false));
    return () => {
      stopped = true;
      clearInterval(tick);
      // ask for the last final, give it a moment to arrive, then stop
      const s = session;
      s?.flush();
      setTimeout(() => {
        s?.stop();
        broadcast(sender.close(performance.now()));
      }, 400);
      setRecognizing(false);
    };
  }, [shouldRecognize, micTrack, log, bump]);

  /** Download the model ahead of time (e.g. when the user opens the captions panel). */
  const prepare = useCallback(() => {
    if (available) loadModel().catch(() => undefined);
  }, [available]);

  const copy = useCallback(
    async (label: (who: string) => string) => {
      const text = log.toText(label);
      if (!text) return false;
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    },
    [log],
  );

  return {
    /** null while checking, false → feature hidden */
    available,
    load,
    show,
    setShow,
    /** state each peer announced */
    remote,
    recognizing,
    log,
    version,
    prepare,
    copy,
  };
}

let ccSeq = 0;
/** A per-object number so a rebuilt data channel re-subscribes. */
function tagDc(dc: RTCDataChannel): number {
  const d = dc as RTCDataChannel & { __ccId?: number };
  if (!d.__ccId) d.__ccId = ++ccSeq;
  return d.__ccId;
}
