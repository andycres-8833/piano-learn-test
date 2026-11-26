import { useRef } from 'react';
import type { StepNote } from '../score/types';
import { isWhite } from '../feedback/hints';
import { midiToName } from '../input/notes';

interface Props {
  low: number;
  high: number;
  /** Notes to play now (coloured by hand, with fingering). */
  next: StepNote[];
  held: ReadonlySet<number>;
  wrong: ReadonlySet<number>;
  /** Full hints: arrow from the wrong key to this key. */
  arrow?: { from: number; to: number };
  onNoteOn: (midi: number) => void;
  onNoteOff: (midi: number) => void;
}

const WHITE_W = 24;
const WHITE_H = 120;
const BLACK_W = 14;
const BLACK_H = 76;
const ARROW_SPACE = 30;

export function PianoKeyboard({ low, high, next, held, wrong, arrow, onNoteOn, onNoteOff }: Props) {
  // Start and end on white keys so the keyboard looks like a keyboard.
  const first = isWhite(low) ? low : low - 1;
  const last = isWhite(high) ? high : high + 1;

  const whiteX = new Map<number, number>();
  let x = 0;
  for (let m = first; m <= last; m++) {
    if (isWhite(m)) {
      whiteX.set(m, x);
      x += WHITE_W;
    }
  }
  const width = x;
  const keyCenter = (m: number) =>
    isWhite(m) ? whiteX.get(m)! + WHITE_W / 2 : whiteX.get(m - 1)! + WHITE_W;

  const nextByMidi = new Map(next.map((n) => [n.midi, n]));
  const pointerNote = useRef<number | null>(null);

  const fillFor = (m: number) => {
    if (wrong.has(m)) return 'var(--note-wrong)';
    if (held.has(m) && nextByMidi.has(m)) return 'var(--note-correct)';
    const n = nextByMidi.get(m);
    if (n) return n.hand === 'R' ? 'var(--hand-right)' : 'var(--hand-left)';
    if (held.has(m)) return 'var(--key-pressed)';
    return isWhite(m) ? 'var(--key-white)' : 'var(--key-black)';
  };

  const press = (m: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as Element).releasePointerCapture?.(e.pointerId);
    pointerNote.current = m;
    onNoteOn(m);
  };
  const release = () => {
    if (pointerNote.current !== null) onNoteOff(pointerNote.current);
    pointerNote.current = null;
  };

  const keys = [];
  // White keys first, black keys on top.
  for (const pass of ['white', 'black'] as const) {
    for (let m = first; m <= last; m++) {
      if ((pass === 'white') !== isWhite(m)) continue;
      if (m < low || m > high) continue;
      const white = isWhite(m);
      const kx = white ? whiteX.get(m)! : keyCenter(m) - BLACK_W / 2;
      const w = white ? WHITE_W : BLACK_W;
      const h = white ? WHITE_H : BLACK_H;
      const n = nextByMidi.get(m);
      const lit = n || held.has(m) || wrong.has(m);
      keys.push(
        <g key={m}>
          <rect
            className="piano__key"
            x={kx + (white ? 0.5 : 0)}
            y={ARROW_SPACE}
            width={w - (white ? 1 : 0)}
            height={h}
            rx={white ? 4 : 3}
            fill={fillFor(m)}
            stroke={white ? 'var(--border-strong)' : 'none'}
            onPointerDown={press(m)}
            onPointerUp={release}
            onPointerLeave={release}
            aria-label={midiToName(m)}
          />
          {n?.finger && !wrong.has(m) && (
            <text
              x={kx + w / 2}
              y={ARROW_SPACE + h - (white ? 12 : 10)}
              className="piano__finger"
              fill={lit ? 'var(--text-inverse)' : 'var(--text-primary)'}
            >
              {n.finger}
            </text>
          )}
          {m % 12 === 0 && white && (
            <text x={kx + w / 2} y={ARROW_SPACE + h + 14} className="piano__label">
              {midiToName(m)}
            </text>
          )}
        </g>,
      );
    }
  }

  let arrowEl = null;
  if (arrow && whiteX.size) {
    const x1 = keyCenter(arrow.from);
    const x2 = keyCenter(arrow.to);
    const y = ARROW_SPACE - 10;
    const dir = Math.sign(x2 - x1) || 1;
    arrowEl = (
      <g className="piano__arrow">
        <path d={`M ${x1} ${ARROW_SPACE + 2} L ${x1} ${y} L ${x2 - dir * 2} ${y}`} />
        <path d={`M ${x2 - dir * 8} ${y - 5} L ${x2} ${y} L ${x2 - dir * 8} ${y + 5}`} />
        <path d={`M ${x2} ${y} L ${x2} ${ARROW_SPACE + 2}`} />
      </g>
    );
  }

  return (
    <div className="piano" aria-label="On-screen keyboard">
      <svg
        viewBox={`0 0 ${width} ${ARROW_SPACE + WHITE_H + 20}`}
        preserveAspectRatio="xMidYMin meet"
        style={{ maxWidth: width * 1.6 }}
      >
        {keys}
        {arrowEl}
      </svg>
    </div>
  );
}
