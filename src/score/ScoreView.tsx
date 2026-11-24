import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { OpenSheetMusicDisplay, type GraphicalNote } from 'opensheetmusicdisplay';
import { type Hand, positionKey } from './types';

export type NoteState = 'upcoming' | 'current' | 'correct';

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
};

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

export function ScoreView({ xml, currentKey, playedKeys, wrongPulse, hands, onReady, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const bandRef = useRef<HTMLDivElement>(null);
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
        const state: NoteState =
          key === currentKey
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
    if (bandRect.top < 120 || bandRect.bottom > window.innerHeight - 40) {
      window.scrollBy({ top: bandRect.top - 140, behavior: 'smooth' });
    }
  }, [currentKey, playedKeys, renderCount, hands]);

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
        <div ref={hostRef} className="score-host" />
      </div>
    </div>
  );
}
