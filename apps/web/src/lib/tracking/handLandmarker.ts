/**
 * MediaPipe HandLandmarker helpers shared by the detection worker and the
 * main-thread fallback. Loaded only when «Показывать руки» is on.
 */
import { HandLandmarker, type FilesetResolver, type HandLandmarkerResult } from "@mediapipe/tasks-vision";
import type { HandDetection, HandsRaw } from "./handTypes";

type Fileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

export async function createHandLandmarker(fileset: Fileset, model: string, delegates: ("GPU" | "CPU")[]) {
  for (const d of delegates) {
    try {
      const lm = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: model, delegate: d },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.55,
        minTrackingConfidence: 0.5,
      });
      return { lm, delegate: d };
    } catch {
      /* next delegate */
    }
  }
  return null;
}

/** Result → plain numbers (typed arrays, transferable). */
export function packHands(res: HandLandmarkerResult | null): HandsRaw {
  const hands: HandDetection[] = [];
  const n = res?.landmarks?.length ?? 0;
  for (let h = 0; h < n; h++) {
    const lm = res!.landmarks[h];
    const wl = res!.worldLandmarks?.[h];
    const cat = res!.handedness?.[h]?.[0] ?? res!.handednesses?.[h]?.[0];
    if (!lm || lm.length < 21 || !wl || wl.length < 21 || !cat) continue;
    const image = new Float32Array(63);
    const world = new Float32Array(63);
    for (let i = 0; i < 21; i++) {
      image[i * 3] = lm[i].x;
      image[i * 3 + 1] = lm[i].y;
      image[i * 3 + 2] = lm[i].z;
      world[i * 3] = wl[i].x;
      world[i * 3 + 1] = wl[i].y;
      world[i * 3 + 2] = wl[i].z;
    }
    hands.push({ label: cat.categoryName === "Right" ? "Right" : "Left", score: cat.score, image, world });
  }
  return { hands };
}

export function handsTransfer(raw: HandsRaw): Transferable[] {
  return raw.hands.flatMap((h) => [h.image.buffer, h.world.buffer]);
}
