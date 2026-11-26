import { useCallback, useState } from 'react';
import type { HintLevel } from '../feedback/hints';

export type KeyboardSize = 61 | 76 | 88;

export interface Settings {
  /** 'all' listens to every connected MIDI keyboard; otherwise one input's id. */
  midiInputId: 'all' | string;
  keyboardSize: KeyboardSize;
  hintLevel: HintLevel;
  showKeyboard: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  midiInputId: 'all',
  keyboardSize: 88,
  hintLevel: 'light',
  showKeyboard: true,
};

const STORAGE_KEY = 'piano-learn:settings';

function load(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const s = { ...DEFAULT_SETTINGS, ...parsed };
    // Guard against values from older versions.
    if (![61, 76, 88].includes(s.keyboardSize)) s.keyboardSize = 88;
    if (!['off', 'light', 'full'].includes(s.hintLevel)) s.hintLevel = 'light';
    return s;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Settings remembered in this browser (survive reloads; per device). */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage can be unavailable (private mode); settings still apply for this visit.
      }
      return next;
    });
  }, []);
  return [settings, update] as const;
}
