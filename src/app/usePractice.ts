import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type EngineEvent, WaitModeEngine } from '../engine/WaitModeEngine';
import { type Hand, type ParsedScore, type Step, positionKey } from '../score/types';

const keyOf = (s: Step) => positionKey(s.measureIndex, s.offsetQ);
const sourceOrder = (s: Step) => s.measureIndex * 10_000 + s.offsetQ;

/**
 * Keys of the steps played in the current straight run: walk back from the
 * current step and stop at a repeat jump, so a repeated passage starts grey.
 */
function playedRun(steps: Step[], current: number, start: number): Set<string> {
  const keys = new Set<string>();
  for (let i = current - 1; i >= start; i--) {
    if (i + 1 < steps.length && i + 1 <= current && sourceOrder(steps[i]) >= sourceOrder(steps[i + 1])) break;
    keys.add(keyOf(steps[i]));
  }
  return keys;
}

export interface Feedback {
  kind: 'wrong' | 'finished';
  midi?: number;
  clean?: boolean;
}

export function usePractice(score: ParsedScore, range: { low: number; high: number }) {
  const [hands, setHandsState] = useState<Record<Hand, boolean>>({ R: true, L: true });
  const engineRef = useRef<WaitModeEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new WaitModeEngine(score.steps, { hands, range });
  }
  const engine = engineRef.current;

  // Bumped after every engine change so React re-renders.
  const [, setVersion] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [wrongPulse, setWrongPulse] = useState(0);
  const [held, setHeld] = useState<ReadonlySet<number>>(new Set());

  const handle = useCallback((events: EngineEvent[]) => {
    for (const ev of events) {
      if (ev.type === 'wrong-key') {
        setFeedback({ kind: 'wrong', midi: ev.midi });
        setWrongPulse((n) => n + 1);
      } else if (ev.type === 'step-passed') {
        setFeedback((f) => (f?.kind === 'wrong' ? null : f));
      } else if (ev.type === 'section-finished') {
        setFeedback({ kind: 'finished', clean: ev.clean });
      }
    }
    setHeld(new Set(engine.heldKeys));
    setVersion((v) => v + 1);
  }, [engine]);

  // Keyboard size changed in Settings: restart with the new range.
  const rangeKey = `${range.low}-${range.high}`;
  const firstRange = useRef(rangeKey);
  useEffect(() => {
    if (firstRange.current === rangeKey) return;
    firstRange.current = rangeKey;
    setFeedback(null);
    handle(engine.setOptions({ range }));
  }, [rangeKey]);

  const noteOn = useCallback((midi: number) => handle(engine.noteOn(midi)), [engine, handle]);
  const noteOff = useCallback((midi: number) => handle(engine.noteOff(midi)), [engine, handle]);
  const restart = useCallback(() => {
    setFeedback(null);
    handle(engine.restart());
  }, [engine, handle]);
  const setHands = useCallback(
    (next: Record<Hand, boolean>) => {
      setHandsState(next);
      setFeedback(null);
      handle(engine.setOptions({ hands: next }));
    },
    [engine, handle],
  );

  const step = engine.currentStep;
  const finished = engine.finished;
  const currentKey = !finished && step ? keyOf(step) : undefined;
  const stepIndex = engine.stepIndex;
  const playedKeys = useMemo(
    () => (finished ? new Set(score.steps.map(keyOf)) : playedRun(score.steps, stepIndex, 0)),
    [score.steps, stepIndex, finished],
  );

  return {
    hands,
    setHands,
    step,
    required: finished ? [] : engine.requiredNotes(),
    finished,
    clean: engine.clean,
    held,
    wrongKeys: engine.wrongKeys,
    currentKey,
    playedKeys,
    feedback,
    wrongPulse,
    noteOn,
    noteOff,
    restart,
  };
}
