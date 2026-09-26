/**
 * WebRTC Signaling Client
 * ------------------------
 * Управляет WebSocket-соединением с Django Channels сигнальным сервером.
 * Поддерживает автоматический реконнект с exponential backoff и уведомляет
 * подписчиков (onReconnect) о восстановлении, чтобы хук пересобрал ICE.
 */

/**
 * `from` is the sender's per-RTCPeerConnection id (random, regenerated on
 * every PC rebuild). It lets the receiver tell a fresh peer from a stale one
 * and resolve offer glare deterministically. The server relays the payload
 * verbatim, so it needs no changes.
 */
export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "answer"; sdp: RTCSessionDescriptionInit; from?: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit; from?: string }
  | { type: "ready"; from?: string }
  | { type: "bye"; from?: string }
  /** the client shows the avatar or (explicit opt-in) the real camera */
  | { type: "media"; face: "avatar" | "real"; from?: string }
  | { type: "peer-joined" }
  | { type: "peer-left" };

type MessageHandler   = (msg: SignalMessage) => void;
type ReconnectHandler = () => void;

export class SignalingClient {
  private ws:               WebSocket | null = null;
  private handlers          = new Set<MessageHandler>();
  private reconnectHandlers = new Set<ReconnectHandler>();
  private reconnectAttempts = 0;
  private isClosed          = false;   // set by disconnect() — stops auto-reconnect
  private readonly maxReconnects = 7;

  constructor(private readonly roomId: string, private readonly token = "") {}

  private buildUrl(): string {
    // Always derive from window.location at runtime — never from a build-time env var
    // that gets baked as ws://localhost and breaks for every user's browser.
    const q = this.token ? `?token=${encodeURIComponent(this.token)}` : "";
    if (typeof window === "undefined") return `ws://localhost/ws/signaling/${this.roomId}/${q}`;
    // Local development only: Next's dev server can't proxy WebSocket upgrades.
    const dev = process.env.NEXT_PUBLIC_WS_DEV_URL;
    if (dev) return `${dev}/ws/signaling/${this.roomId}/${q}`;
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws/signaling/${this.roomId}/${q}`;
  }

  connect(): Promise<void> {
    this.isClosed = false;

    return new Promise((resolve, reject) => {
      const url = this.buildUrl();
      this.ws = new WebSocket(url);
      let settled = false;
      const settle = (fn: () => void) => { if (!settled) { settled = true; fn(); } };

      this.ws.onopen = () => {
        const isReconnect = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;

        settle(resolve);
        if (isReconnect) {
          // Сигналинг восстановился после обрыва — уведомляем хук,
          // чтобы он переотправил "ready" и пересобрал offer/ICE.
          this.reconnectHandlers.forEach(h => h());
        }
      };

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SignalMessage;
          this.handlers.forEach(h => h(msg));
        } catch { /* ignore malformed */ }
      };

      this.ws.onerror = () => settle(() => reject(new Error("WebSocket connection failed")));

      this.ws.onclose = () => {
        if (this.isClosed) {
          settle(() => reject(new Error("disconnected")));
          return;
        }
        if (this.reconnectAttempts < this.maxReconnects) {
          this.reconnectAttempts++;
          const delay = Math.min(500 * 2 ** this.reconnectAttempts, 30_000);
          setTimeout(() => this.connect(), delay);
        }
      };
    });
  }

  send(msg: Exclude<SignalMessage, { type: "peer-joined" | "peer-left" }>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  onMessage(handler: MessageHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Вызывается когда WS переподключается после разрыва (не при первом connect). */
  onReconnect(handler: ReconnectHandler): () => void {
    this.reconnectHandlers.add(handler);
    return () => this.reconnectHandlers.delete(handler);
  }

  disconnect(): void {
    this.isClosed = true;
    this.reconnectAttempts = 0;
    this.handlers.clear();
    this.reconnectHandlers.clear();

    const ws = this.ws;
    this.ws = null;
    if (!ws) return;

    if (ws.readyState === WebSocket.CONNECTING) {
      // Closing a CONNECTING socket triggers a browser error.
      // Wait for it to open, then close immediately — this is silent.
      ws.onopen  = () => ws.close();
      ws.onclose = null;
      ws.onerror = null;
    } else {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: "bye" })); } catch { /* ignore */ }
      }
      ws.close();
    }
  }
}
