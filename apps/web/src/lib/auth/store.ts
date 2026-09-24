"use client";

/**
 * Global auth state. The user object is fetched from /auth/me/ and cached in
 * memory only — nothing identifying is written to disk besides the JWTs.
 */
import { create } from "zustand";
import { ApiError, tokens } from "@/lib/api/client";
import { authApi } from "@/lib/api/endpoints";
import type { AuthResponse, Role, User } from "@/lib/api/types";
import type { AvatarConfig } from "@/lib/avatar/schema";

type Status = "idle" | "loading" | "authed" | "guest";

interface AuthState {
  user: User | null;
  status: Status;
  /** Load the current user if tokens exist. Safe to call many times. */
  bootstrap: () => Promise<void>;
  /** Store tokens + user after login/register/recover. */
  accept: (res: AuthResponse) => void;
  logout: () => void;
  setAvatar: (cfg: AvatarConfig) => Promise<void>;
  refreshUser: () => Promise<void>;
}

let inflight: Promise<void> | null = null;

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  status: "idle",

  bootstrap: async () => {
    if (get().status === "authed" || get().status === "loading") return inflight ?? undefined;
    if (!tokens.access && !tokens.refresh) {
      set({ status: "guest" });
      return;
    }
    set({ status: "loading" });
    inflight = authApi
      .me()
      .then((user) => set({ user, status: "authed" }))
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) tokens.clear();
        set({ user: null, status: "guest" });
      })
      .finally(() => (inflight = null));
    return inflight;
  },

  accept: (res) => {
    tokens.set(res.access, res.refresh);
    set({ user: res.user, status: "authed" });
  },

  logout: () => {
    tokens.clear();
    set({ user: null, status: "guest" });
  },

  setAvatar: async (cfg) => {
    const user = await authApi.updateMe({ avatar_config: cfg });
    set({ user });
  },

  refreshUser: async () => {
    const user = await authApi.me();
    set({ user, status: "authed" });
  },
}));

export function homeFor(role: Role | undefined): string {
  if (role === "psychologist") return "/pro";
  if (role === "admin") return "/admin";
  return "/app";
}
