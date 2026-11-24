const NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

/** 60 → "C4" */
export const midiToName = (midi: number) => `${NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;

export const KEYBOARD_RANGES = {
  61: { low: 36, high: 96 },
  76: { low: 28, high: 103 },
  88: { low: 21, high: 108 },
} as const;
