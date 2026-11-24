import type { Hand, Step, StepNote } from '../score/types';

export interface EngineOptions {
  /** Hands the player must play. Notes of other hands are never required. */
  hands: Record<Hand, boolean>;
  /** Lowest/highest MIDI note on the player's keyboard. Notes outside are skipped. */
  range: { low: number; high: number };
  /** First and last step index (inclusive) of the active section. */
  section?: { start: number; end: number };
}

export type EngineEvent =
  | { type: 'correct-key'; midi: number; step: number }
  | { type: 'wrong-key'; midi: number; step: number; measureIndex: number }
  | { type: 'step-passed'; step: number }
  | { type: 'step-skipped'; step: number; reason: 'no-required-notes' }
  | { type: 'section-finished'; clean: boolean };

/**
 * Wait-mode matching rules (see docs/SPEC.md §4.3):
 * - A step passes when every required note is held down at the same time
 *   and no wrong key is held.
 * - Pressing a key that is not required is a wrong key: it blocks the step
 *   while it is held and makes the current pass "not clean".
 * - Keys already held when a step starts don't count for that step; they must
 *   be released and pressed again (repeated notes need a re-strike).
 * - Only key-down matters, not how long the note is held.
 */
export class WaitModeEngine {
  private held = new Set<number>();
  /** Keys held from before the current step began. */
  private stale = new Set<number>();
  /** Keys that were wrong when pressed and are still down. */
  private wrongHeld = new Set<number>();
  private _stepIndex: number;
  private _clean = true;
  private _finished = false;

  constructor(
    private readonly steps: Step[],
    private options: EngineOptions,
  ) {
    this._stepIndex = this.sectionStart;
    this.skipEmptySteps();
  }

  get stepIndex() {
    return this._stepIndex;
  }
  get currentStep(): Step | undefined {
    return this.steps[this._stepIndex];
  }
  get clean() {
    return this._clean;
  }
  get finished() {
    return this._finished;
  }
  get heldKeys(): ReadonlySet<number> {
    return this.held;
  }
  get wrongKeys(): ReadonlySet<number> {
    return this.wrongHeld;
  }

  private get sectionStart() {
    return this.options.section?.start ?? 0;
  }
  private get sectionEnd() {
    return this.options.section?.end ?? this.steps.length - 1;
  }

  isRequired(note: StepNote) {
    const { hands, range } = this.options;
    return hands[note.hand] && note.midi >= range.low && note.midi <= range.high;
  }

  /** Notes the player must hold to pass the current step. */
  requiredNotes(step = this.currentStep): StepNote[] {
    return step ? step.notes.filter((n) => this.isRequired(n)) : [];
  }

  /** Restart at the beginning of the section (or a given step). Returns skip events. */
  restart(stepIndex = this.sectionStart): EngineEvent[] {
    this._stepIndex = stepIndex;
    this._clean = true;
    this._finished = false;
    this.stale = new Set(this.held);
    this.wrongHeld.clear();
    return this.skipEmptySteps();
  }

  setOptions(options: Partial<EngineOptions>): EngineEvent[] {
    this.options = { ...this.options, ...options };
    return this.restart();
  }

  noteOn(midi: number): EngineEvent[] {
    if (this._finished || this.held.has(midi)) return [];
    this.held.add(midi);
    const step = this.currentStep;
    if (!step) return [];

    const events: EngineEvent[] = [];
    if (this.requiredNotes(step).some((n) => n.midi === midi)) {
      events.push({ type: 'correct-key', midi, step: step.index });
    } else {
      this.wrongHeld.add(midi);
      this._clean = false;
      events.push({ type: 'wrong-key', midi, step: step.index, measureIndex: step.measureIndex });
    }
    return events.concat(this.tryAdvance());
  }

  noteOff(midi: number): EngineEvent[] {
    if (!this.held.delete(midi)) return [];
    this.stale.delete(midi);
    this.wrongHeld.delete(midi);
    if (this._finished) return [];
    // Releasing a wrong key can unblock a step whose notes are all held.
    return this.tryAdvance();
  }

  private tryAdvance(): EngineEvent[] {
    const required = this.requiredNotes();
    if (required.length === 0 || this.wrongHeld.size > 0) return [];
    const satisfied = required.every((n) => this.held.has(n.midi) && !this.stale.has(n.midi));
    if (!satisfied) return [];
    return [{ type: 'step-passed', step: this._stepIndex }, ...this.advance()];
  }

  private advance(): EngineEvent[] {
    // Everything held now has been "used"; the next step needs fresh presses.
    this.stale = new Set(this.held);
    if (this._stepIndex >= this.sectionEnd) {
      this._finished = true;
      return [{ type: 'section-finished', clean: this._clean }];
    }
    this._stepIndex++;
    return this.skipEmptySteps();
  }

  /** Steps with nothing for the player to do (e.g. other hand only) pass on their own. */
  private skipEmptySteps(): EngineEvent[] {
    const events: EngineEvent[] = [];
    while (!this._finished && this.currentStep && this.requiredNotes().length === 0) {
      events.push({ type: 'step-skipped', step: this._stepIndex, reason: 'no-required-notes' });
      if (this._stepIndex >= this.sectionEnd) {
        this._finished = true;
        events.push({ type: 'section-finished', clean: this._clean });
        break;
      }
      this._stepIndex++;
    }
    return events;
  }
}
