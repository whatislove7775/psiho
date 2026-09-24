import type { AvatarConfig } from "../schema";

/** MediaPipe FaceLandmarker result subset the engine consumes. */
export interface FaceResult {
  faceBlendshapes?: { categories: { score: number; categoryName: string }[] }[];
  facialTransformationMatrixes?: { data: number[] | Float32Array }[];
}

/**
 * Camera framing presets:
 *  - "face"     tight head shot (thumbnails, call tile)
 *  - "portrait" head + shoulders (studio, call main view)
 */
export type Framing = "face" | "portrait";

export interface RendererOptions {
  /** CSS colour or null for transparent background. Default null. */
  background?: string | null;
  framing?: Framing;
  /** Cap devicePixelRatio (default 2). */
  maxPixelRatio?: number;
  /** When no tracking arrives: blink, breathe, glance around. Default true. */
  idle?: boolean;
  /** Mirror blendshapes L↔R like a selfie camera. Default true. */
  mirror?: boolean;
  /** Target render fps (default 30). */
  fps?: number;
  /** Required for canvas.captureStream() on some browsers. Default false. */
  preserveDrawingBuffer?: boolean;
}

export interface AvatarRendererApi {
  readonly canvas: HTMLCanvasElement;
  setConfig(cfg: AvatarConfig): void;
  applyFaceResult(result: FaceResult | null | undefined): void;
  /** Directly set expression weights (ARKit names), e.g. for studio previews. */
  setExpression(weights: Record<string, number>): void;
  setIdle(enabled: boolean): void;
  setFraming(framing: Framing): void;
  /** Slowly rotate the head toward (yaw, pitch) radians — used by studio drag. */
  lookAt(yaw: number, pitch: number): void;
  resize(width: number, height: number): void;
  start(): void;
  stop(): void;
  captureStream(fps?: number): MediaStream;
  dispose(): void;
}
