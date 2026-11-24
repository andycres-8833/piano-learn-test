import { describe, expect, it } from 'vitest';
import type { Step, StepNote } from '../score/types';
import { type EngineOptions, WaitModeEngine } from './WaitModeEngine';

const C4 = 60, D4 = 62, E4 = 64, F4 = 65, G4 = 67, C3 = 48;

const step = (index: number, notes: Partial<StepNote>[], measureIndex = 0): Step => ({
  index,
  measureIndex,
  measureNumber: String(measureIndex + 1),
  offsetQ: index,
  pass: 0,
  notes: notes.map((n) => ({ midi: 60, hand: 'R', ...n })),
});

const opts: EngineOptions = { hands: { R: true, L: true }, range: { low: 21, high: 108 } };
const types = (events: { type: string }[]) => events.map((e) => e.type);

describe('WaitModeEngine', () => {
  it('passes a single note and moves on', () => {
    const e = new WaitModeEngine([step(0, [{ midi: C4 }]), step(1, [{ midi: D4 }])], opts);
    expect(types(e.noteOn(C4))).toEqual(['correct-key', 'step-passed']);
    expect(e.stepIndex).toBe(1);
  });

  it('accepts a chord pressed in any order once all keys are held', () => {
    const e = new WaitModeEngine(
      [step(0, [{ midi: C4 }, { midi: E4 }, { midi: G4 }]), step(1, [{ midi: D4 }])],
      opts,
    );
    expect(types(e.noteOn(E4))).toEqual(['correct-key']);
    expect(types(e.noteOn(G4))).toEqual(['correct-key']);
    expect(e.stepIndex).toBe(0);
    expect(types(e.noteOn(C4))).toEqual(['correct-key', 'step-passed']);
    expect(e.stepIndex).toBe(1);
  });

  it('does not pass a chord if a note was released before the last was pressed', () => {
    const e = new WaitModeEngine([step(0, [{ midi: C4 }, { midi: E4 }]), step(1, [{ midi: D4 }])], opts);
    e.noteOn(C4);
    e.noteOff(C4);
    e.noteOn(E4);
    expect(e.stepIndex).toBe(0);
  });

  it('blocks on a wrong key until it is released', () => {
    const e = new WaitModeEngine(
      [step(0, [{ midi: C4 }, { midi: E4 }, { midi: G4 }]), step(1, [{ midi: D4 }])],
      opts,
    );
    e.noteOn(C4);
    e.noteOn(E4);
    expect(types(e.noteOn(F4))).toEqual(['wrong-key']);
    expect(types(e.noteOn(G4))).toEqual(['correct-key']);
    expect(e.stepIndex).toBe(0);
    expect(types(e.noteOff(F4))).toEqual(['step-passed']);
    expect(e.stepIndex).toBe(1);
    expect(e.clean).toBe(false);
  });

  it('requires a repeated note to be struck again', () => {
    const e = new WaitModeEngine([step(0, [{ midi: C4 }]), step(1, [{ midi: C4 }]), step(2, [{ midi: D4 }])], opts);
    e.noteOn(C4);
    expect(e.stepIndex).toBe(1);
    // Still holding C4: nothing happens until it is re-struck.
    expect(e.stepIndex).toBe(1);
    e.noteOff(C4);
    expect(e.stepIndex).toBe(1);
    expect(types(e.noteOn(C4))).toEqual(['correct-key', 'step-passed']);
    expect(e.stepIndex).toBe(2);
  });

  it('does not count a key held over from the previous step as wrong', () => {
    // C4 is held (tie-like) while the next step asks for E4.
    const e = new WaitModeEngine([step(0, [{ midi: C4 }]), step(1, [{ midi: E4 }]), step(2, [{ midi: D4 }])], opts);
    e.noteOn(C4);
    expect(types(e.noteOn(E4))).toEqual(['correct-key', 'step-passed']);
    expect(e.clean).toBe(true);
  });

  it('ignores the disabled hand and skips steps that only have its notes', () => {
    const e = new WaitModeEngine(
      [
        step(0, [{ midi: C3, hand: 'L' }, { midi: E4, hand: 'R' }]),
        step(1, [{ midi: C3, hand: 'L' }]),
        step(2, [{ midi: D4, hand: 'R' }]),
      ],
      { ...opts, hands: { R: true, L: false } },
    );
    expect(e.requiredNotes().map((n) => n.midi)).toEqual([E4]);
    const ev = e.noteOn(E4);
    expect(types(ev)).toEqual(['correct-key', 'step-passed', 'step-skipped']);
    expect(e.stepIndex).toBe(2);
  });

  it('skips notes outside the keyboard range', () => {
    const e = new WaitModeEngine(
      [step(0, [{ midi: 30 }, { midi: C4 }]), step(1, [{ midi: D4 }])],
      { ...opts, range: { low: 36, high: 96 } },
    );
    expect(types(e.noteOn(C4))).toEqual(['correct-key', 'step-passed']);
  });

  it('reports the end of a section and whether the pass was clean', () => {
    const steps = [step(0, [{ midi: C4 }]), step(1, [{ midi: D4 }]), step(2, [{ midi: E4 }])];
    const e = new WaitModeEngine(steps, { ...opts, section: { start: 0, end: 1 } });
    e.noteOn(C4);
    const ev = e.noteOn(D4);
    expect(ev.at(-1)).toEqual({ type: 'section-finished', clean: true });
    expect(e.finished).toBe(true);
    expect(e.noteOn(E4)).toEqual([]);

    e.noteOff(C4);
    e.noteOff(D4);
    e.restart();
    e.noteOn(G4);
    e.noteOff(G4);
    e.noteOn(C4);
    expect(e.noteOn(D4).at(-1)).toEqual({ type: 'section-finished', clean: false });
  });

  it('ignores key-repeat (noteOn for a key already down)', () => {
    const e = new WaitModeEngine([step(0, [{ midi: C4 }, { midi: E4 }]), step(1, [{ midi: D4 }])], opts);
    e.noteOn(C4);
    expect(e.noteOn(C4)).toEqual([]);
  });
});
