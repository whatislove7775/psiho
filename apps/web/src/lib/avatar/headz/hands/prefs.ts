"use client";

/**
 * Per-device preferences of the floating hands, stored locally:
 *   «Показывать руки»      avatar.hands     (default ON)
 *   «Реакции жестами»      avatar.gestures  (default ON) — 👍/👎 and raise-hand from gestures
 * plus the session-only automatic switch-off on a slow connection (netGuard):
 * hands stay ON as a preference but are not run while `autoOff` is set, until
 * the user turns them on again explicitly (menu / mirror page) — then they
 * stay on for this page session.
 * Every open toggle and camera hook follows a change immediately.
 */
import { useCallback, useSyncExternalStore } from "react";

const KEY = "avatar.hands";
const GKEY = "avatar.gestures";
const EVENT = "avatar-hands-pref";

function read(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== "0";
  } catch {
    return true;
  }
}
function write(key: string, on: boolean) {
  try {
    window.localStorage.setItem(key, on ? "1" : "0");
  } catch {
    /* private mode: still applies to this page */
  }
}

export interface HandsPrefState {
  /** the stored preference */
  pref: boolean;
  gestures: boolean;
  /** switched off automatically this session (slow internet) */
  autoOff: boolean;
  /** hands actually run */
  on: boolean;
}

let state: HandsPrefState | null = null;
/** the user re-enabled hands after an automatic switch-off: don't switch off again this session */
let userForced = false;
const SERVER: HandsPrefState = { pref: true, gestures: true, autoOff: false, on: true };

function snapshot(): HandsPrefState {
  if (!state) {
    const pref = read(KEY);
    state = { pref, gestures: read(GKEY), autoOff: false, on: pref };
  }
  return state;
}
function update(patch: Partial<HandsPrefState>) {
  const s = { ...snapshot(), ...patch };
  s.on = s.pref && !s.autoOff;
  state = s;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(cb: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === GKEY) {
      const s = snapshot();
      state = { ...s, pref: read(KEY), gestures: read(GKEY) };
      state.on = state.pref && !state.autoOff;
      cb();
    }
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function readHandsPref(): boolean {
  return snapshot().on;
}

/** User toggle: on → also clears an automatic switch-off (and keeps hands on for this session). */
export function writeHandsPref(on: boolean) {
  write(KEY, on);
  if (on && snapshot().autoOff) userForced = true;
  update({ pref: on, autoOff: on ? false : snapshot().autoOff });
}

export function writeGesturesPref(on: boolean) {
  write(GKEY, on);
  update({ gestures: on });
}

/** Called by netGuard: slow connection → hands off for this session (unless the user turned them back on). */
export function reportSlowNetwork() {
  if (userForced || snapshot().autoOff) return;
  update({ autoOff: true });
}

export function useHandsState(): HandsPrefState {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER);
}

/** [hands actually on, set] — the switch in menus shows the effective state */
export function useHandsPref(): [boolean, (on: boolean) => void] {
  const s = useHandsState();
  const set = useCallback((v: boolean) => writeHandsPref(v), []);
  return [s.on, set];
}

export function useGesturesPref(): [boolean, (on: boolean) => void] {
  const s = useHandsState();
  const set = useCallback((v: boolean) => writeGesturesPref(v), []);
  return [s.gestures, set];
}

/** The one quiet line shown while hands are switched off automatically. */
export const SLOW_NET_NOTE = "Руки выключены: медленный интернет";
