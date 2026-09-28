/**
 * Hand landmarks as they cross from the detector (worker or main thread) to the
 * avatar. Numbers only — never pixels; they never leave the device.
 */
export interface HandDetection {
  /** MediaPipe handedness label (assumes a mirrored picture — see handMath.sideFor) */
  label: "Left" | "Right";
  score: number;
  /** 21 × xyz, normalised image coordinates of the (unmirrored) camera frame */
  image: Float32Array;
  /** 21 × xyz, metres, origin near the hand centre */
  world: Float32Array;
}

export interface HandsRaw {
  hands: HandDetection[];
}

/** `since`: when the camera frame became available (performance.now()) */
export type HandsCallback = (raw: HandsRaw, since: number) => void;

/** Detection interval for hands: ~15 fps is enough for gestures and halves the extra cost. */
export const HAND_INTERVAL_MS = 66;
