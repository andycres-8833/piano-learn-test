import { type Hand, type ParsedScore, type Step, type StepNote, ScoreError } from './types';

const STEP_SEMITONES: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

interface MeasureInfo {
  number: string;
  forwardRepeat: boolean;
  backwardRepeat: boolean;
  repeatTimes: number;
  /** Ending (volta) numbers this measure belongs to, or null. */
  ending: number[] | null;
  /** Notes that start in this measure, keyed by offset (quarters). */
  onsets: Map<number, StepNote[]>;
}

const child = (el: Element, name: string) =>
  Array.from(el.children).find((c) => c.localName === name) ?? null;
const children = (el: Element, name: string) =>
  Array.from(el.children).filter((c) => c.localName === name);
const text = (el: Element | null, name: string) => {
  if (!el) return null;
  const c = child(el, name);
  return c ? (c.textContent ?? '').trim() : null;
};

export function pitchToMidi(step: string, octave: number, alter = 0): number {
  return (octave + 1) * 12 + STEP_SEMITONES[step] + alter;
}

function parseEndingNumbers(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}

/** Pick the piano part: the first part that declares two staves. */
function findPianoPart(doc: Document): Element {
  const parts = Array.from(doc.getElementsByTagName('part'));
  if (parts.length === 0) throw new ScoreError('empty', 'This file has no music in it.');
  for (const part of parts) {
    const staves = part.getElementsByTagName('staves')[0];
    if (staves && parseInt(staves.textContent ?? '1', 10) === 2) return part;
  }
  throw new ScoreError(
    'not-piano',
    `This file has ${parts.length} part${parts.length === 1 ? '' : 's'} but no piano grand staff. ` +
      'Piano Learn supports piano scores with a treble and bass staff.',
  );
}

function readMeasures(part: Element): MeasureInfo[] {
  let divisions = 1;
  const out: MeasureInfo[] = [];

  for (const [i, m] of children(part, 'measure').entries()) {
    const info: MeasureInfo = {
      number: m.getAttribute('number') ?? String(i + 1),
      forwardRepeat: false,
      backwardRepeat: false,
      repeatTimes: 2,
      ending: null,
      onsets: new Map(),
    };
    let pos = 0; // in divisions
    let lastOnset = 0;

    for (const el of Array.from(m.children)) {
      switch (el.localName) {
        case 'attributes': {
          const d = text(el, 'divisions');
          if (d) divisions = parseFloat(d);
          break;
        }
        case 'backup':
          pos -= parseFloat(text(el, 'duration') ?? '0');
          break;
        case 'forward':
          pos += parseFloat(text(el, 'duration') ?? '0');
          break;
        case 'barline': {
          const repeat = child(el, 'repeat');
          if (repeat) {
            const dir = repeat.getAttribute('direction');
            if (dir === 'forward') info.forwardRepeat = true;
            if (dir === 'backward') {
              info.backwardRepeat = true;
              const times = parseInt(repeat.getAttribute('times') ?? '2', 10);
              if (!Number.isNaN(times)) info.repeatTimes = times;
            }
          }
          const ending = child(el, 'ending');
          if (ending && ending.getAttribute('type') === 'start') {
            info.ending = parseEndingNumbers(ending.getAttribute('number'));
          }
          break;
        }
        case 'note': {
          const isChord = !!child(el, 'chord');
          const isGrace = !!child(el, 'grace');
          const isRest = !!child(el, 'rest');
          const duration = parseFloat(text(el, 'duration') ?? '0');
          const onset = isChord ? lastOnset : pos;

          if (!isGrace && !isRest) {
            const pitch = child(el, 'pitch');
            const ties = children(el, 'tie').map((t) => t.getAttribute('type'));
            const isTieContinuation = ties.includes('stop');
            if (pitch && !isTieContinuation) {
              const midi = pitchToMidi(
                text(pitch, 'step') ?? 'C',
                parseInt(text(pitch, 'octave') ?? '4', 10),
                parseFloat(text(pitch, 'alter') ?? '0'),
              );
              const staff = parseInt(text(el, 'staff') ?? '1', 10);
              const hand: Hand = staff === 2 ? 'L' : 'R';
              const fingerEl = el.getElementsByTagName('fingering')[0];
              const finger = fingerEl ? parseInt(fingerEl.textContent ?? '', 10) : NaN;
              const offsetQ = onset / divisions;
              const key = Math.round(offsetQ * 1000) / 1000;
              const list = info.onsets.get(key) ?? [];
              if (!list.some((n) => n.midi === midi)) {
                list.push({ midi, hand, ...(Number.isNaN(finger) ? {} : { finger }) });
              }
              info.onsets.set(key, list);
            }
          }
          if (!isChord && !isGrace) {
            lastOnset = pos;
            pos += duration;
          }
          break;
        }
      }
    }
    out.push(info);
  }
  return out;
}

/**
 * Expand simple repeats and first/second endings into a playback order.
 * D.C./D.S./Coda are intentionally not followed (MVP scope).
 */
export function expandRepeats(measures: Pick<MeasureInfo, 'forwardRepeat' | 'backwardRepeat' | 'repeatTimes' | 'ending'>[]) {
  const order: { index: number; pass: number }[] = [];
  const jumpsTaken = new Map<number, number>();
  let repeatStart = 0;
  let pass = 1;
  let i = 0;
  let guard = 0;

  while (i < measures.length && guard++ < 10_000) {
    const m = measures[i];
    if (m.forwardRepeat && i !== repeatStart) {
      repeatStart = i;
      pass = 1;
    }
    if (m.ending && m.ending.length > 0 && !m.ending.includes(pass)) {
      i++;
      continue;
    }
    if (!m.ending && i > repeatStart && measures[i - 1]?.ending && !m.backwardRepeat) {
      // Left the endings block: back to normal playback, and a later
      // backward repeat without a forward sign jumps back to here.
      pass = 1;
      repeatStart = i;
    }
    order.push({ index: i, pass: pass - 1 });

    if (m.backwardRepeat) {
      const taken = jumpsTaken.get(i) ?? 0;
      if (taken < m.repeatTimes - 1) {
        jumpsTaken.set(i, taken + 1);
        pass++;
        i = repeatStart;
        continue;
      }
      repeatStart = i + 1;
    }
    i++;
  }
  return order;
}

export function buildSteps(xml: string | Document): ParsedScore {
  const doc = typeof xml === 'string' ? new DOMParser().parseFromString(xml, 'application/xml') : xml;
  if (doc.getElementsByTagName('parsererror').length > 0 || !doc.getElementsByTagName('score-partwise')[0]) {
    throw new ScoreError(
      'not-musicxml',
      'This file is not a MusicXML score (expected <score-partwise>).',
    );
  }

  const title =
    doc.getElementsByTagName('work-title')[0]?.textContent?.trim() ||
    doc.getElementsByTagName('movement-title')[0]?.textContent?.trim() ||
    'Untitled';
  const composerEl = Array.from(doc.getElementsByTagName('creator')).find(
    (c) => c.getAttribute('type') === 'composer',
  );

  const measures = readMeasures(findPianoPart(doc));
  const order = expandRepeats(measures);

  const steps: Step[] = [];
  for (const { index, pass } of order) {
    const m = measures[index];
    const offsets = Array.from(m.onsets.keys()).sort((a, b) => a - b);
    for (const offsetQ of offsets) {
      const notes = [...m.onsets.get(offsetQ)!].sort((a, b) => a.midi - b.midi);
      steps.push({
        index: steps.length,
        measureIndex: index,
        measureNumber: m.number,
        offsetQ,
        pass,
        notes,
      });
    }
  }
  if (steps.length === 0) throw new ScoreError('empty', 'This score has no notes to play.');

  return {
    title,
    composer: composerEl?.textContent?.trim() || undefined,
    measureCount: measures.length,
    playOrder: order.map((o) => o.index),
    steps,
  };
}
