"use client";

/**
 * One shared WebSocket to /ws/chat/ per tab. Auth: short-lived signed token from
 * POST /chat/ws-token/. Reconnects with backoff; listeners survive reconnects.
 */
import { chatApi, type ChatMessage } from "@/lib/api/chat";

export type ChatEvent =
  | { type: "ready" }
  | { type: "message.new" | "message.updated"; message: ChatMessage }
  | { type: "message.hidden"; conversation: string; id: string }
  | { type: "conversation.updated"; conversation: string; retention: string }
  | { type: "conversation.cleared"; conversation: string }
  | { type: "typing"; conversation: string; role: string }
  | { type: "read"; conversation: string; role: string; at: string };

type Listener = (e: ChatEvent) => void;
type StatusListener = (online: boolean) => void;

function wsBase(): string {
  const dev = process.env.NEXT_PUBLIC_WS_DEV_URL;
  if (dev) return dev;
  const proto = window.location.protocol === "https:" ? "wss" : "ws";
  return `${proto}://${window.location.host}`;
}

class ChatSocket {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private ping: ReturnType<typeof setInterval> | null = null;
  private users = 0;
  online = false;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  onStatus(fn: StatusListener) {
    this.statusListeners.add(fn);
    fn(this.online);
    return () => {
      this.statusListeners.delete(fn);
    };
  }

  /** Ref-counted: the socket lives while at least one chat screen is mounted. */
  acquire() {
    this.users += 1;
    if (this.users === 1) void this.open();
    return () => {
      this.users -= 1;
      if (this.users <= 0) this.close();
    };
  }

  send(data: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(data));
  }

  private setOnline(v: boolean) {
    this.online = v;
    this.statusListeners.forEach((fn) => fn(v));
  }

  private async open() {
    if (this.ws || this.users <= 0) return;
    let token: string;
    try {
      token = (await chatApi.wsToken()).token;
    } catch {
      this.schedule();
      return;
    }
    if (this.users <= 0) return;
    const ws = new WebSocket(`${wsBase()}/ws/chat/?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let data: ChatEvent;
      try {
        data = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (data.type === "ready") {
        this.attempts = 0;
        this.setOnline(true);
      }
      this.listeners.forEach((fn) => fn(data));
    };
    ws.onclose = () => {
      if (this.ws === ws) this.ws = null;
      this.setOnline(false);
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      this.schedule();
    };
    ws.onerror = () => ws.close();
    this.ping = setInterval(() => this.send({ type: "ping" }), 25_000);
  }

  private schedule() {
    if (this.users <= 0 || this.timer) return;
    const delay = Math.min(30_000, 1000 * 2 ** this.attempts);
    this.attempts += 1;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.open();
    }, delay);
  }

  private close() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    const ws = this.ws;
    this.ws = null;
    ws?.close();
    this.setOnline(false);
  }
}

export const chatSocket = new ChatSocket();
