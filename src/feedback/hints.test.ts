import { describe, expect, it } from 'vitest';
import { hintFor, whiteKeysBetween } from './hints';

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, Fs4 = 66, G4 = 67, A4 = 69, B4 = 71;
const C5 = 72, E5 = 76, Cs4 = 61, A3 = 57, B3 = 59;

describe('whiteKeysBetween', () => {
  it('counts white keys only, ending on the target', () => {
    expect(whiteKeysBetween(E5, C5)).toBe(2);
    expect(whiteKeysBetween(C4, E4)).toBe(2);
    expect(whiteKeysBetween(E4, F4)).toBe(1);
    expect(whiteKeysBetween(Cs4, E4)).toBe(2); // from a black key: D4, E4
  });
});

describe('hintFor', () => {
  const none = new Set<number>();

  it('points lower with a white-key count and the target name', () => {
    expect(hintFor(E5, [C5], none)).toEqual({ text: '2 keys lower → C5', targetMidi: C5 });
  });

  it('points higher, singular "key"', () => {
    expect(hintFor(A3, [B3], none)?.text).toBe('1 key higher → B3');
  });

  it('says when it is the right note in the wrong octave', () => {
    expect(hintFor(C5, [C4], none)?.text).toBe('right note, one octave lower → C4');
    expect(hintFor(C4 - 24, [C4], none)?.text).toBe('right note, two octaves higher → C4');
  });

  it('describes black-key targets instead of counting', () => {
    expect(hintFor(E4, [Fs4], none)?.text).toBe('the black key just above F → F♯4');
  });

  it('aims at the nearest chord note that is not held yet', () => {
    // Chord C–E–G; C and E held; F pressed by mistake → G is the one missing.
    expect(hintFor(F4, [C4, E4, G4], new Set([C4, E4, F4]))?.text).toBe('1 key higher → G4');
    // Nothing held yet, A pressed → nearest is G (lower).
    expect(hintFor(A4, [C4, E4, G4], new Set([A4]))?.text).toBe('1 key lower → G4');
  });

  it('asks to let go when every needed key is already down', () => {
    expect(hintFor(B4, [C4, E4], new Set([C4, E4, B4]))).toEqual({
      text: 'let go of B4, the other keys are right',
    });
  });

  it('returns null when nothing is required', () => {
    expect(hintFor(D4, [], none)).toBeNull();
  });
});
