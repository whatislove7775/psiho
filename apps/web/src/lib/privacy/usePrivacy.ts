"use client";

import { useCallback, useEffect, useState } from "react";
import { prefsApi } from "@/lib/api/prefs";
import { DEFAULT_PREFS, PRIVACY_EVENT, PRIVACY_KEY, readPrefs, writePrefs, type PrivacyPrefs } from "./stealth";

/** Live privacy prefs of this browser (updates across tabs and components). */
export function usePrivacyPrefs(): [PrivacyPrefs, (patch: (p: PrivacyPrefs) => PrivacyPrefs) => void, boolean] {
  const [prefs, setPrefs] = useState<PrivacyPrefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const read = () => setPrefs(readPrefs());
    read();
    setReady(true);
    const onStorage = (e: StorageEvent) => e.key === PRIVACY_KEY && read();
    window.addEventListener(PRIVACY_EVENT, read);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(PRIVACY_EVENT, read);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((patch: (p: PrivacyPrefs) => PrivacyPrefs) => {
    const prev = readPrefs();
    const next = writePrefs(patch(prev));
    setPrefs(next);
    if (next.sync) pushToAccount(next);
    else if (prev.sync) prefsApi.remove().catch(() => undefined); // «не запоминать в аккаунте» — стираем копию
  }, []);

  return [prefs, update, ready];
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
function pushToAccount(p: PrivacyPrefs) {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    prefsApi.save({ stealth: p.stealth, screen_protect: p.screen_protect, v: p.v }).catch(() => undefined);
  }, 400);
}

let synced = false;
/**
 * Once per page load in the cabinet: reconcile this browser with the account copy.
 * The newer version (by `v`) wins; nothing is sent when sync is off on this device.
 */
export function syncPrivacyPrefs() {
  if (synced) return;
  synced = true;
  prefsApi
    .get()
    .then(({ settings }) => {
      const local = readPrefs();
      const remoteV = settings.v ?? 0;
      if (settings.stealth && remoteV > local.v) {
        writePrefs(
          {
            ...local,
            stealth: { ...local.stealth, ...settings.stealth },
            screen_protect: settings.screen_protect ?? local.screen_protect,
            sync: true,
            v: remoteV,
          },
          { touch: false },
        );
      } else if (local.sync && local.v > remoteV) {
        pushToAccount(local);
      }
    })
    .catch(() => {
      synced = false;
    });
}
