import { api } from "./client";

/** Normalised square crop: x/y — top-left as a fraction of width/height, size — side as a fraction of min(w, h). */
export interface PhotoCrop {
  x: number;
  y: number;
  size: number;
}

export const photoApi = {
  upload: (file: Blob, crop?: PhotoCrop) => {
    const fd = new FormData();
    fd.append("photo", file, "photo");
    if (crop) fd.append("crop", JSON.stringify(crop));
    return api<{ photo_url: string }>("/psychologist/photo/", { method: "POST", body: fd });
  },
  remove: () => api<void>("/psychologist/photo/", { method: "DELETE" }),
};

export const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
