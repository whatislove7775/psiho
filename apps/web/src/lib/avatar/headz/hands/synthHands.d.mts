export declare const GESTURES: string[];
export declare function handPoints(gesture?: string): number[][];
export declare function synthDetection(o?: {
  gesture?: string;
  hand?: "right" | "left";
  at?: { x: number; y: number };
  pxPerM?: number;
  aspect?: number;
  rot?: number[] | null;
}): { label: "Left" | "Right"; score: number; image: Float32Array; world: Float32Array };
