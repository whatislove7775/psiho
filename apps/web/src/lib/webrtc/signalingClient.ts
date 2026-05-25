/**
 * WebRTC Signaling Client
 * ------------------------
 * Управляет WebSocket-соединением с Django Channels сигнальным сервером.
 * Поддерживает автоматический реконнект с exponential backoff и уведомляет
 * подписчиков (onReconnect) о восстановлении, чтобы хук пересобрал ICE.
 */

export type SignalMessage =
  | { type: "offer"; sdp: RTCSessionDescriptionInit }
  | { type: "answer"; sdp: RTCSessionDescriptionInit }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit }
  | { type: "ready" }
  | { type: "bye" }
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

  constructor(
    private readonly roomId: string,
    private readonly wsBaseUrl: string = (() => {
      const envWs = process.env.NEXT_PUBLIC_WS_URL;
      if (envWs) return envWs.replace(/\/$/, "");
      if (typeof window === "undefined") return "ws://localhost";
      const proto = window.location.protocol === "https:" ? "wss" : "ws";
      return `${proto}://${window.location.host}`;
    })()
  ) {}

  connect(): Promise<void> {
    this.isClosed = false;

    return new Promise((resolve, reject) => {
      const url = `${this.wsBaseUrl}/ws/signaling/${this.roomId}/`;
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        const isReconnect = this.reconnectAttempts > 0;
        this.reconnectAttempts = 0;

        if (!isReconnect) {
          resolve();
        } else {
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

      this.ws.onerror = () => reject(new Error("WebSocket connection failed"));

      this.ws.onclose = () => {
        if (this.isClosed) return;
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
    this.send({ type: "bye" });
    this.ws?.close();
    this.ws = null;
    this.handlers.clear();
    this.reconnectHandlers.clear();
  }
}
