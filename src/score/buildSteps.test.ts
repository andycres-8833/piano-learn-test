import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildSteps, expandRepeats, pitchToMidi } from './buildSteps';
import { readScoreFile } from './loadScore';
import { ScoreError } from './types';

const sample = readFileSync(resolve(__dirname, '../../public/samples/ode-to-joy.musicxml'), 'utf8');

/** Minimal two-staff score wrapper for focused fixtures. */
const score = (measures: string, staves = 2) => `<?xml version="1.0"?>
<score-partwise version="4.0">
  <part-list><score-part id="P1"><part-name>Piano</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes><divisions>1</divisions><staves>${staves}</staves></attributes>
      ${measures}
    </measure>
  </part>
</score-partwise>`;

const note = (step: string, octave: number, extra = '', staff = 1, duration = 1) =>
  `<note>${extra.includes('<chord/>') ? '<chord/>' : ''}${extra.includes('<grace/>') ? '<grace/>' : ''}
     <pitch><step>${step}</step><octave>${octave}</octave></pitch>
     ${extra.includes('<grace/>') ? '' : `<duration>${duration}</duration>`}
     ${extra.replace('<chord/>', '').replace('<grace/>', '')}
     <staff>${staff}</staff></note>`;

describe('pitchToMidi', () => {
  it('maps middle C and accidentals', () => {
    expect(pitchToMidi('C', 4)).toBe(60);
    expect(pitchToMidi('A', 4)).toBe(69);
    expect(pitchToMidi('F', 3, 1)).toBe(54);
    expect(pitchToMidi('B', 3, -1)).toBe(58);
  });
});

describe('expandRepeats', () => {
  const plain = { forwardRepeat: false, backwardRepeat: false, repeatTimes: 2, ending: null };
  it('plays a simple repeat twice', () => {
    const m = [plain, { ...plain, forwardRepeat: true }, plain, { ...plain, backwardRepeat: true }, plain];
    expect(expandRepeats(m).map((o) => o.index)).toEqual([0, 1, 2, 3, 1, 2, 3, 4]);
  });
  it('repeats from the start when there is no forward sign', () => {
    const m = [plain, { ...plain, backwardRepeat: true }, plain];
    expect(expandRepeats(m).map((o) => o.index)).toEqual([0, 1, 0, 1, 2]);
  });
  it('takes first and second endings', () => {
    const m = [
      plain,
      plain,
      { ...plain, ending: [1], backwardRepeat: true },
      { ...plain, ending: [2] },
      plain,
    ];
    const order = expandRepeats(m);
    expect(order.map((o) => o.index)).toEqual([0, 1, 2, 0, 1, 3, 4]);
    expect(order.map((o) => o.pass)).toEqual([0, 0, 0, 1, 1, 1, 0]);
  });
});

describe('buildSteps on the sample piece', () => {
  const parsed = buildSteps(sample);

  it('reads metadata', () => {
    expect(parsed.title).toBe('Ode to Joy (easy)');
    expect(parsed.composer).toBe('Ludwig van Beethoven');
    expect(parsed.measureCount).toBe(13);
  });

  it('expands the repeat with 1st/2nd endings', () => {
    expect(parsed.playOrder).toEqual([0, 1, 2, 3, 0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('groups chord notes into one step, sorted low to high, with hands', () => {
    const first = parsed.steps[0];
    expect(first.measureIndex).toBe(0);
    expect(first.offsetQ).toBe(0);
    expect(first.notes).toEqual([
      { midi: 48, hand: 'L' },
      { midi: 55, hand: 'L' },
      { midi: 64, hand: 'R', finger: 3 },
    ]);
  });

  it('does not ask for a tied continuation note again', () => {
    // Measure 9 (index 8): LH G2 is tied from measure 8, so only RH notes start there.
    const m9 = parsed.steps.filter((s) => s.measureIndex === 8);
    expect(m9.flatMap((s) => s.notes.map((n) => n.hand))).toEqual(['R', 'R', 'R']);
  });

  it('handles eighth-note offsets', () => {
    const m7 = parsed.steps.filter((s) => s.measureIndex === 6).map((s) => s.offsetQ);
    expect(m7).toEqual([0, 1, 1.5, 2, 3]);
  });
});

describe('buildSteps edge cases', () => {
  it('skips grace notes', () => {
    const parsed = buildSteps(score(note('D', 4, '<grace/>') + note('C', 4)));
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].notes[0].midi).toBe(60);
  });

  it('rejects scores without a grand staff', () => {
    expect(() => buildSteps(score(note('C', 4), 1))).toThrow(ScoreError);
  });

  it('rejects non-MusicXML text', () => {
    expect(() => buildSteps('<html><body>hi</body></html>')).toThrowError(/not a MusicXML/);
  });

  it('tracks backup so both staves start together', () => {
    const xml = score(
      note('E', 4, '', 1, 2) + '<backup><duration>2</duration></backup>' + note('C', 3, '', 2, 2),
    );
    const parsed = buildSteps(xml);
    expect(parsed.steps).toHaveLength(1);
    expect(parsed.steps[0].notes.map((n) => n.midi)).toEqual([48, 64]);
  });
});

describe('readScoreFile', () => {
  it('passes plain XML through', async () => {
    const buf = new TextEncoder().encode(sample).buffer;
    expect(await readScoreFile(buf as ArrayBuffer)).toContain('<score-partwise');
  });

  it('unzips a compressed .mxl using its container file', async () => {
    const zip = new JSZip();
    zip.file(
      'META-INF/container.xml',
      '<container><rootfiles><rootfile full-path="score/piece.xml"/></rootfiles></container>',
    );
    zip.file('score/piece.xml', sample);
    const buf = await zip.generateAsync({ type: 'arraybuffer' });
    const xml = await readScoreFile(buf);
    expect(buildSteps(xml).title).toBe('Ode to Joy (easy)');
  });
});
