/** Личные настройки, которые «переезжают» с аккаунтом: GET/PATCH/DELETE /api/v1/me/settings/ (docs/API.md). */
import { api } from "./client";
import type { ExitTarget, StealthPreset } from "@/lib/privacy/stealth";

export interface ServerSettings {
  stealth?: { enabled?: boolean; preset?: StealthPreset; exit?: ExitTarget; wipe?: boolean };
  screen_protect?: boolean;
  v?: number;
}

export interface SettingsResponse {
  settings: ServerSettings;
  updated_at: string | null;
}

export const prefsApi = {
  get: () => api<SettingsResponse>("/me/settings/"),
  save: (body: ServerSettings) => api<SettingsResponse>("/me/settings/", { method: "PATCH", body }),
  remove: () => api<SettingsResponse>("/me/settings/", { method: "DELETE" }),
};
