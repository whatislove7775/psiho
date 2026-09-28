"use client";

import { forwardRef, useLayoutEffect, useState, type ReactNode } from "react";
import { Portal } from "@/ui";
import s from "./chat.module.css";

export interface ChatMenuItem {
  key: string;
  icon: ReactNode;
  label: string;
  /** one quiet line under the label (current state, what it does) */
  hint?: string;
  onClick: () => void;
  /** destructive / leaving actions: shown last, separated, in red */
  danger?: boolean;
  /** toggles: the state is shown as a small switch */
  checked?: boolean;
}

/**
 * The header «⋮» menu of a chat: groups separated by thin rules, each item = icon + label + one-line hint;
 * destructive items last and red. Desktop: a popover under the button; phones: the same content as a
 * bottom sheet. Portalled to <body>, so no transformed ancestor can shift or clip it.
 */
export const ChatMenu = forwardRef<HTMLDivElement, { anchor: HTMLElement | null; groups: ChatMenuItem[][]; onClose: () => void }>(
  function ChatMenu({ anchor, groups, onClose }, ref) {
    const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
    useLayoutEffect(() => {
      const place = () => {
        const r = anchor?.getBoundingClientRect();
        if (r) setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
      };
      place();
      window.addEventListener("resize", place);
      return () => window.removeEventListener("resize", place);
    }, [anchor]);
    const list = groups.filter((g) => g.length);
    return (
      <Portal>
        <div className={s.sheetMenuScrim} aria-hidden onMouseDown={onClose} />
        <div
          ref={ref}
          className={s.sheetMenu}
          role="menu"
          style={pos ? { top: pos.top, right: pos.right } : { visibility: "hidden" }}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
        >
          <span className={s.sheetMenuGrip} aria-hidden />
          {list.map((g, gi) => (
            <div key={gi} className={s.sheetMenuGroup} role="group">
              {g.map((it) => (
                <button
                  key={it.key}
                  type="button"
                  role={it.checked === undefined ? "menuitem" : "menuitemcheckbox"}
                  aria-checked={it.checked}
                  className={it.danger ? s.sheetMenuDanger : undefined}
                  onClick={() => {
                    onClose();
                    it.onClick();
                  }}
                >
                  <span className={s.sheetMenuIcon} aria-hidden>
                    {it.icon}
                  </span>
                  <span className={s.sheetMenuText}>
                    <span>{it.label}</span>
                    {it.hint && <small>{it.hint}</small>}
                  </span>
                  {it.checked !== undefined && <span className={s.sheetMenuSwitch} data-on={it.checked || undefined} aria-hidden />}
                </button>
              ))}
            </div>
          ))}
        </div>
      </Portal>
    );
  },
);
