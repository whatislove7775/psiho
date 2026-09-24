"use client";

import { useCallback, useReducer } from "react";

interface State<T> {
  past: T[];
  present: T;
  future: T[];
  /** coalescing key + time of the last push (slider drags become one step) */
  lastKey: string | null;
  lastAt: number;
}

type Action<T> =
  | { type: "set"; value: T; key?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; value: T };

const LIMIT = 80;
const COALESCE_MS = 700;

function reducer<T>(s: State<T>, a: Action<T>): State<T> {
  switch (a.type) {
    case "set": {
      if (Object.is(a.value, s.present)) return s;
      const now = Date.now();
      const merge = a.key != null && a.key === s.lastKey && now - s.lastAt < COALESCE_MS;
      return {
        past: merge ? s.past : [...s.past, s.present].slice(-LIMIT),
        present: a.value,
        future: [],
        lastKey: a.key ?? null,
        lastAt: now,
      };
    }
    case "undo": {
      if (!s.past.length) return s;
      return {
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future],
        lastKey: null,
        lastAt: 0,
      };
    }
    case "redo": {
      if (!s.future.length) return s;
      return {
        past: [...s.past, s.present],
        present: s.future[0],
        future: s.future.slice(1),
        lastKey: null,
        lastAt: 0,
      };
    }
    case "reset":
      return { past: [], present: a.value, future: [], lastKey: null, lastAt: 0 };
  }
}

/** Undo/redo stack. `set(value, key)` merges rapid changes with the same key. */
export function useHistory<T>(initial: T) {
  const [state, dispatch] = useReducer(reducer<T>, undefined, () => ({
    past: [],
    present: initial,
    future: [],
    lastKey: null,
    lastAt: 0,
  }));
  const set = useCallback((value: T, key?: string) => dispatch({ type: "set", value, key }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const reset = useCallback((value: T) => dispatch({ type: "reset", value }), []);
  return {
    value: state.present,
    set,
    undo,
    redo,
    reset,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
