/** P2: pictures inside article texts and 1–5 star ratings (apps/content). */
import { api } from "./client";

export interface ArticleImage {
  id: string;
  /** ≤1600 px wide WebP, e.g. /media/content/<hex>.webp */
  url: string;
  /** 800 px wide */
  md: string;
  width: number;
  height: number;
}

export const IMAGE_HINT = "JPG, PNG или WebP до 10 МБ, лучше от 1600 px в ширину";

export const articleImageApi = {
  upload: (file: Blob) => {
    const fd = new FormData();
    fd.append("image", file, "image");
    return api<ArticleImage>("/content/images/", { method: "POST", body: fd });
  },
};

export interface RatingState {
  avg: number | null;
  count: number;
  /** Your stars (signed in), else null. */
  mine: number | null;
  /** Signed-in client/specialist who isn't the author. */
  can_rate: boolean;
}

export const ratingApi = {
  get: (slug: string, auth: boolean) =>
    api<RatingState>(`/content/articles/${encodeURIComponent(slug)}/rating/`, { auth }),
  set: (slug: string, stars: number) =>
    api<RatingState>(`/content/articles/${encodeURIComponent(slug)}/rating/`, { method: "PUT", body: { stars } }),
  clear: (slug: string) => api<RatingState>(`/content/articles/${encodeURIComponent(slug)}/rating/`, { method: "DELETE" }),
};
