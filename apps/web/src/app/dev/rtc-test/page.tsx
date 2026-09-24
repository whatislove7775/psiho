"use client";

/**
 * Internal WebRTC loopback QA page (not linked; 404 in production).
 *
 * Two RTCPeerConnections in one page, fed by the same avatar canvas
 * captureStream() the call uses. Separates "the environment can't decode"
 * from "our signaling / hook code is broken".
 *
 *   /dev/rtc-test                  canvas NOT attached to the DOM (like the call's pip before mount)
 *   /dev/rtc-test?attach=1         canvas attached to the DOM
 *   /dev/rtc-test?src=2d           plain 2D canvas instead of the WebGL avatar
 *
 * Results are exposed on window.__rtc for Playwright.
 */
import { notFound, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { DEFAULT_AVATAR } from "@/lib/avatar/schema";

type Probe = { rs: number; w: number; h: number; t: number; framesDecoded: number; framesSent: number; ice: string; codec: string };

function Loopback() {
  const sp = useSearchParams();
  const attach = sp.get("attach") === "1";
  const src = sp.get("src") ?? "avatar";
  const hostRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [probe, setProbe] = useState<Probe | null>(null);

  useEffect(() => {
    let alive = true;
    let stopDraw = () => {};
    const a = new RTCPeerConnection();
    const b = new RTCPeerConnection();
    (async () => {
      let stream: MediaStream;
      const c = document.createElement("canvas");
      c.width = 540;
      c.height = 720;
      c.style.width = "180px";
      if (src === "2d") {
        const g = c.getContext("2d")!;
        let raf = 0;
        const draw = (t: number) => {
          g.fillStyle = `hsl(${(t / 20) % 360} 60% 40%)`;
          g.fillRect(0, 0, c.width, c.height);
          raf = requestAnimationFrame(draw);
        };
        raf = requestAnimationFrame(draw);
        stopDraw = () => cancelAnimationFrame(raf);
        stream = c.captureStream(30);
      } else {
        const { KitRenderer } = await import("@/lib/avatar/kit/KitRenderer");
        const r = new KitRenderer(c, { framing: "portrait", background: "#1d1d22", idle: true, preserveDrawingBuffer: true, maxPixelRatio: 1, fps: 30 });
        r.resize(540, 720);
        r.setConfig(DEFAULT_AVATAR);
        r.start();
        stopDraw = () => r.dispose();
        (window as unknown as { __r: unknown }).__r = r;
        stream = r.captureStream(30);
      }
      if (!alive) {
        stopDraw();
        return;
      }
      if (attach && hostRef.current) hostRef.current.appendChild(c);
      (window as unknown as { __canvas: HTMLCanvasElement; __stream: MediaStream }).__canvas = c;
      (window as unknown as { __stream: MediaStream }).__stream = stream;

      a.onicecandidate = (e) => e.candidate && b.addIceCandidate(e.candidate).catch(() => {});
      b.onicecandidate = (e) => e.candidate && a.addIceCandidate(e.candidate).catch(() => {});
      b.ontrack = (e) => {
        const v = videoRef.current!;
        if (v.srcObject !== e.streams[0]) v.srcObject = e.streams[0];
        v.play().catch(() => {});
      };
      stream.getTracks().forEach((t) => a.addTrack(t, stream));
      const offer = await a.createOffer();
      await a.setLocalDescription(offer);
      await b.setRemoteDescription(offer);
      const answer = await b.createAnswer();
      await b.setLocalDescription(answer);
      await a.setRemoteDescription(answer);
    })();

    const iv = setInterval(async () => {
      const v = videoRef.current;
      if (!v) return;
      let framesDecoded = 0;
      let framesSent = 0;
      let codec = "";
      (await b.getStats()).forEach((s) => {
        if (s.type === "inbound-rtp" && s.kind === "video") framesDecoded = s.framesDecoded ?? 0;
        if (s.type === "codec" && String(s.mimeType).startsWith("video")) codec = s.mimeType;
      });
      (await a.getStats()).forEach((s) => {
        if (s.type === "outbound-rtp" && s.kind === "video") framesSent = s.framesSent ?? 0;
      });
      const p = { rs: v.readyState, w: v.videoWidth, h: v.videoHeight, t: v.currentTime, framesDecoded, framesSent, ice: b.iceConnectionState, codec };
      (window as unknown as { __rtc: Probe }).__rtc = p;
      setProbe(p);
    }, 500);

    return () => {
      alive = false;
      clearInterval(iv);
      a.close();
      b.close();
      stopDraw();
    };
  }, [attach, src]);

  return (
    <div style={{ padding: 16, fontFamily: "monospace", color: "#ddd", background: "#111", minHeight: "100vh" }}>
      <p>
        src={src} attach={String(attach)}
      </p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div ref={hostRef} />
        <video ref={videoRef} autoPlay playsInline muted style={{ width: 180, background: "#000" }} />
      </div>
      <pre>{JSON.stringify(probe, null, 2)}</pre>
    </div>
  );
}

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense>
      <Loopback />
    </Suspense>
  );
}
