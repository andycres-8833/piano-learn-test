import { midiToName } from '../input/notes';

export type HintLevel = 'off' | 'light' | 'full';

export interface Hint {
  /** Text after "Hint:", e.g. "2 keys lower → C5". */
  text: string;
  /** The key the player should press instead (undefined when the fix is to let go). */
  targetMidi?: number;
}

const WHITE_PCS = new Set([0, 2, 4, 5, 7, 9, 11]);
export const isWhite = (midi: number) => WHITE_PCS.has(((midi % 12) + 12) % 12);
const LETTERS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];

/** Number of white keys passed when moving from `from` to `to` (ending on `to`). */
export function whiteKeysBetween(from: number, to: number): number {
  let count = 0;
  if (to > from) {
    for (let m = from + 1; m <= to; m++) if (isWhite(m)) count++;
  } else {
    for (let m = from - 1; m >= to; m--) if (isWhite(m)) count++;
  }
  return count;
}

const OCTAVE_WORDS = ['', 'one', 'two', 'three', 'four'];

/**
 * Directive hint for a wrong key (see docs/SPEC.md §4.4.1).
 * @param wrong     the wrong key that was pressed
 * @param required  MIDI notes the current step needs
 * @param held      keys currently held down
 */
export function hintFor(wrong: number, required: number[], held: ReadonlySet<number>): Hint | null {
  if (required.length === 0) return null;
  const missing = required.filter((m) => !held.has(m));
  if (missing.length === 0) {
    return { text: `let go of ${midiToName(wrong)}, the other keys are right` };
  }

  // Nearest missing note by pitch; on a tie prefer the lower one.
  const target = [...missing].sort((a, b) => Math.abs(a - wrong) - Math.abs(b - wrong) || a - b)[0];
  const name = midiToName(target);
  const dir = target < wrong ? 'lower' : 'higher';

  if (target % 12 === wrong % 12) {
    const octaves = Math.abs(target - wrong) / 12;
    const word = OCTAVE_WORDS[octaves] ?? String(octaves);
    return { text: `right note, ${word} octave${octaves > 1 ? 's' : ''} ${dir} → ${name}`, targetMidi: target };
  }

  if (!isWhite(target)) {
    const below = LETTERS[(target - 1) % 12];
    return { text: `the black key just above ${below} → ${name}`, targetMidi: target };
  }

  const n = whiteKeysBetween(wrong, target);
  return { text: `${n} key${n === 1 ? '' : 's'} ${dir} → ${name}`, targetMidi: target };
}
