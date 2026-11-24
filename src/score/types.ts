export type Hand = 'R' | 'L';

export interface StepNote {
  /** MIDI note number (60 = middle C). */
  midi: number;
  hand: Hand;
  finger?: number;
}

/**
 * One moment in the piece where at least one new note starts.
 * Steps are listed in playback order (repeats expanded).
 */
export interface Step {
  index: number;
  /** 0-based index of the measure in the source file. */
  measureIndex: number;
  /** Printed measure number (from the file, falls back to index + 1). */
  measureNumber: string;
  /** Offset from the start of the measure, in quarter notes. */
  offsetQ: number;
  /** Which pass through the measure this is (0 = first time, 1 = repeat …). */
  pass: number;
  notes: StepNote[];
}

export interface ParsedScore {
  title: string;
  composer?: string;
  measureCount: number;
  /** Source measure indices in playback order. */
  playOrder: number[];
  steps: Step[];
}

export class ScoreError extends Error {
  constructor(
    public readonly code: 'not-musicxml' | 'not-piano' | 'empty' | 'bad-archive',
    message: string,
  ) {
    super(message);
  }
}

/** Key that identifies a (measure, onset) position, shared with the renderer. */
export const positionKey = (measureIndex: number, offsetQ: number) =>
  `${measureIndex}:${Math.round(offsetQ * 1000)}`;
