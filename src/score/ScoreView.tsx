import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, type GraphicalNote } from 'opensheetmusicdisplay';
import { type Hand, positionKey } from './types';

export type NoteState = 'upcoming' | 'current' | 'correct' | 'skipped';

interface Props {
  xml: string;
  /** Position key of the step to play now. */
  currentKey?: string;
  /** Position keys already played in the current run. */
  playedKeys: ReadonlySet<string>;
  /** Increments each time a wrong key is pressed, to flash the cursor. */
  wrongPulse: number;
  /** Hands the player is practising; notes of a disabled hand are never highlighted as "play now". */
  hands: Record<Hand, boolean>;
  /** Player's keyboard range; notes outside it are drawn faded (they're skipped). */
  range: { low: number; high: number };
  /** Full hints: a dashed ghost note at the pitch of the wrong key being held. */
  ghost?: { midi: number; label: string };
  /** Pixels at the bottom of the window covered by the on-screen keyboard. */
  bottomInset?: number;
  onReady?: () => void;
  onError?: (err: Error) => void;
}

interface Position {
  notes: GraphicalNote[];
  measureIndex: number;
}

const COLOR_VAR: Record<NoteState, string> = {
  upcoming: 'var(--note-upcoming)',
  current: 'var(--note-current)',
  correct: 'var(--note-correct)',
  skipped: 'var(--note-skipped)',
};

/** OSMD stores pitch as halfTone, where MIDI = halfTone + 12. */
const midiOf = (note: GraphicalNote) =>
  note.sourceNote && !note.sourceNote.isRest() ? note.sourceNote.halfTone + 12 : undefined;

const LETTER_OF_PC = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]; // C C# D D# E F F# G G# A A# B → letter index
/** Diatonic position (C0 = 0, D0 = 1 …). Black keys sit on the letter below (as sharps). */
const diatonic = (midi: number) => (Math.floor(midi / 12) - 1) * 7 + LETTER_OF_PC[midi % 12];
const TREBLE_TOP = diatonic(77); // F5, top line of the treble staff
const BASS_TOP = diatonic(57); // A3, top line of the bass staff

const UNIT_PX = 10; // OSMD draws 10px per unit at zoom 1

/** Walk the OSMD cursor once and index the graphical notes by (measure, onset). */
function indexPositions(osmd: OpenSheetMusicDisplay): Map<string, Position> {
  const map = new Map<string, Position>();
  const cursor = osmd.cursor;
  cursor.reset();
  const measures = osmd.Sheet.SourceMeasures;
  let guard = 0;
  while (!cursor.Iterator.EndReached && guard++ < 50_000) {
    const it = cursor.Iterator;
    const measureIndex = it.CurrentMeasureIndex;
    const measureStart = measures[measureIndex]?.AbsoluteTimestamp;
    if (measureStart) {
      const offsetQ = (it.CurrentSourceTimestamp.RealValue - measureStart.RealValue) * 4;
      const key = positionKey(measureIndex, offsetQ);
      if (!map.has(key)) {
        map.set(key, { notes: cursor.GNotesUnderCursor(), measureIndex });
      }
    }
    cursor.next();
  }
  cursor.reset();
  cursor.hide();
  return map;
}

/** Staff 1 of the piano part is the right hand, staff 2 the left. */
function handOf(note: GraphicalNote): Hand {
  const staff = note.sourceNote?.ParentStaff;
  const index = staff?.ParentInstrument?.Staves.indexOf(staff) ?? 0;
  return index === 1 ? 'L' : 'R';
}

function paintNote(note: GraphicalNote, color: string) {
  const g = (note as unknown as { getSVGGElement?: () => SVGGElement | undefined }).getSVGGElement?.();
  if (!g) return;
  g.querySelectorAll<SVGElement>('path, rect').forEach((el) => {
    el.style.fill = color;
    el.style.stroke = color;
  });
}

export function ScoreView({
  xml, currentKey, playedKeys, wrongPulse, hands, range, ghost, bottomInset = 0, onReady, onError,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const positionsRef = useRef(new Map<string, Position>());
  const [renderCount, setRenderCount] = useState(0);
  const handlers = useRef({ onReady, onError });
  handlers.current = { onReady, onError };

  // Load + render the score.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    host.innerHTML = '';
    const osmd = new OpenSheetMusicDisplay(host, {
      autoResize: false,
      backend: 'svg',
      drawTitle: false,
      drawSubtitle: false,
      drawComposer: false,
      drawLyricist: false,
      drawPartNames: false,
      drawFingerings: true,
      followCursor: false,
    });
    osmdRef.current = osmd;
    osmd
      .load(xml)
      .then(() => {
        if (cancelled) return;
        osmd.render();
        positionsRef.current = indexPositions(osmd);
        setRenderCount((n) => n + 1);
        handlers.current.onReady?.();
      })
      .catch((err: Error) => !cancelled && handlers.current.onError?.(err));
    return () => {
      cancelled = true;
      osmd.clear();
      osmdRef.current = null;
    };
  }, [xml]);

  // Re-render on resize (OSMD redraws the SVG, so colours are re-applied after).
  useEffect(() => {
    let timer: number | undefined;
    const onResize = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const osmd = osmdRef.current;
        if (!osmd || !osmd.IsReadyToRender()) return;
        osmd.render();
        positionsRef.current = indexPositions(osmd);
        setRenderCount((n) => n + 1);
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.clearTimeout(timer);
    };
  }, []);

  // Colour notes and move the cursor band.
  useLayoutEffect(() => {
    const osmd = osmdRef.current;
    const host = hostRef.current;
    const band = bandRef.current;
    if (!osmd || !host || !band || renderCount === 0) return;

    for (const [key, pos] of positionsRef.current) {
      for (const n of pos.notes) {
        const midi = midiOf(n);
        const outOfRange = midi !== undefined && (midi < range.low || midi > range.high);
        const state: NoteState = outOfRange
          ? 'skipped'
          : key === currentKey
            ? hands[handOf(n)] ? 'current' : 'upcoming'
            : playedKeys.has(key) ? 'correct' : 'upcoming';
        paintNote(n, COLOR_VAR[state]);
      }
    }

    const current = currentKey ? positionsRef.current.get(currentKey) : undefined;
    if (!current || current.notes.length === 0) {
      band.style.display = 'none';
      return;
    }
    // Horizontal extent: the notes at this position.
    const hostRect = host.getBoundingClientRect();
    let left = Infinity;
    let right = -Infinity;
    const active = current.notes.filter((n) => hands[handOf(n)]);
    for (const n of active.length ? active : current.notes) {
      const g = (n as unknown as { getSVGGElement?: () => SVGGElement | undefined }).getSVGGElement?.();
      const head = g?.querySelector('.vf-notehead') ?? g;
      if (!head) continue;
      const r = head.getBoundingClientRect();
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    // Vertical extent: from the top staff to the bottom staff of this measure.
    const staves = osmd.GraphicSheet.MeasureList[current.measureIndex] ?? [];
    const ys = staves.filter(Boolean).map((m) => m.PositionAndShape.AbsolutePosition.y);
    const zoom = osmd.zoom * UNIT_PX;
    if (!Number.isFinite(left) || ys.length === 0) {
      band.style.display = 'none';
      return;
    }
    const top = (Math.min(...ys) - 2.5) * zoom;
    const bottom = (Math.max(...ys) + 4 + 2.5) * zoom;
    const pad = 8;
    band.style.display = 'block';
    band.style.left = `${left - hostRect.left - pad}px`;
    band.style.width = `${right - left + pad * 2}px`;
    band.style.top = `${top}px`;
    band.style.height = `${bottom - top}px`;

    // Keep the current system in view, near the top.
    const bandRect = band.getBoundingClientRect();
    if (bandRect.top < 120 || bandRect.bottom > window.innerHeight - bottomInset - 24) {
      window.scrollBy({ top: bandRect.top - 140, behavior: 'smooth' });
    }

    // Ghost note for the wrong key, drawn on the staff it belongs to, just right of the cursor.
    const ghostEl = ghostRef.current;
    if (ghostEl) {
      if (ghost && staves.length) {
        const staffIndex = ghost.midi >= 60 || staves.length < 2 ? 0 : 1;
        const staffTop = staves[staffIndex]?.PositionAndShape.AbsolutePosition.y ?? ys[0];
        const topLine = staffIndex === 0 ? TREBLE_TOP : BASS_TOP;
        const yUnits = staffTop + (topLine - diatonic(ghost.midi)) * 0.5;
        ghostEl.style.display = 'flex';
        ghostEl.style.left = `${right - hostRect.left + 6}px`;
        ghostEl.style.top = `${yUnits * zoom}px`;
        ghostEl.querySelector('span')!.textContent = ghost.label;
      } else {
        ghostEl.style.display = 'none';
      }
    }
  }, [currentKey, playedKeys, renderCount, hands, range.low, range.high, ghost?.midi, ghost?.label, bottomInset]);

  // Flash the band red on a wrong key.
  useEffect(() => {
    const band = bandRef.current;
    if (!band || wrongPulse === 0) return;
    band.classList.remove('score-band--wrong');
    void band.offsetWidth; // restart the animation
    band.classList.add('score-band--wrong');
  }, [wrongPulse]);

  return (
    <div className="score-paper">
      <div className="score-stage">
        <div ref={bandRef} className="score-band" aria-hidden />
        <div ref={ghostRef} className="score-ghost" aria-hidden>
          <i />
          <span />
        </div>
        <div ref={hostRef} className="score-host" />
      </div>
    </div>
  );
}
