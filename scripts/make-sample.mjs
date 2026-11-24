// Generates public/samples/ode-to-joy.musicxml — an easy arrangement of
// Beethoven's "Ode to Joy" (public domain), written for this project.
// Run: node scripts/make-sample.mjs
import { writeFileSync } from 'node:fs';

const DIV = 2; // divisions per quarter → eighth = 1
const dur = { e: 1, q: 2, 'q.': 3, h: 4, w: 8 };
const type = { e: 'eighth', q: 'quarter', 'q.': 'quarter', h: 'half', w: 'whole' };
const FINGER = { C4: 1, D4: 2, E4: 3, F4: 4, G4: 5 };

// note spec: "E4:q" | "C3+G3:h" (chord) | "G2:w~" (tie start) | "~G2:w" (tie stop)
function notes(spec, staff, voice) {
  let xml = '';
  for (const tok of spec.trim().split(/\s+/)) {
    let [pitches, d] = tok.split(':');
    const tieStop = pitches.startsWith('~');
    const tieStart = d.endsWith('~');
    pitches = pitches.replace('~', '');
    d = d.replace('~', '');
    pitches.split('+').forEach((p, i) => {
      const [, step, octave] = p.match(/^([A-G])(\d)$/);
      const finger = staff === 1 ? FINGER[p] : undefined;
      const ties = [tieStop && 'stop', tieStart && 'start'].filter(Boolean);
      xml += `      <note>${i > 0 ? '<chord/>' : ''}
        <pitch><step>${step}</step><octave>${octave}</octave></pitch>
        <duration>${dur[d]}</duration>${ties.map((t) => `<tie type="${t}"/>`).join('')}
        <voice>${voice}</voice><type>${type[d]}</type>${d === 'q.' ? '<dot/>' : ''}
        <staff>${staff}</staff>${
          ties.length || finger
            ? `
        <notations>${ties.map((t) => `<tied type="${t}"/>`).join('')}${
                finger ? `<technical><fingering>${finger}</fingering></technical>` : ''
              }</notations>`
            : ''
        }
      </note>
`;
    });
  }
  return xml;
}

const measures = [
  // [rightHand, leftHand, extra]
  ['E4:q E4:q F4:q G4:q', 'C3+G3:w', { forward: true }],
  ['G4:q F4:q E4:q D4:q', 'G2:w'],
  ['C4:q C4:q D4:q E4:q', 'C3:h E3:h'],
  ['E4:q. D4:e D4:h', 'G2:h B2:h', { ending: 1, backward: true }],
  ['D4:q. C4:e C4:h', 'G2:h C3:h', { ending: 2 }],
  ['D4:q D4:q E4:q C4:q', 'G2:w'],
  ['D4:q E4:e F4:e E4:q C4:q', 'C3:w'],
  ['D4:q E4:e F4:e E4:q D4:q', 'G2:w~'],
  ['C4:q D4:q G3:h', '~G2:w'],
  ['E4:q E4:q F4:q G4:q', 'C3+G3:w'],
  ['G4:q F4:q E4:q D4:q', 'G2:w'],
  ['C4:q C4:q D4:q E4:q', 'C3:h E3:h'],
  ['D4:q. C4:e C4:h', 'G2:h C3+E3+G3:h', { final: true }],
];

let body = '';
measures.forEach(([rh, lh, extra = {}], i) => {
  const n = i + 1;
  let m = `    <measure number="${n}">\n`;
  if (extra.forward || extra.ending) {
    m += `      <barline location="left">${
      extra.ending ? `<ending number="${extra.ending}" type="start">${extra.ending}.</ending>` : ''
    }${extra.forward ? '<repeat direction="forward"/>' : ''}</barline>\n`;
  }
  if (i === 0) {
    m += `      <attributes>
        <divisions>${DIV}</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>2</staves>
        <clef number="1"><sign>G</sign><line>2</line></clef>
        <clef number="2"><sign>F</sign><line>4</line></clef>
      </attributes>
`;
  }
  m += notes(rh, 1, 1);
  m += `      <backup><duration>${4 * DIV}</duration></backup>\n`;
  m += notes(lh, 2, 5);
  if (extra.ending || extra.backward || extra.final) {
    m += `      <barline location="right">${extra.backward || extra.final ? '<bar-style>light-heavy</bar-style>' : ''}${
      extra.ending ? `<ending number="${extra.ending}" type="stop"/>` : ''
    }${extra.backward ? '<repeat direction="backward"/>' : ''}</barline>\n`;
  }
  m += '    </measure>\n';
  body += m;
});

const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work><work-title>Ode to Joy (easy)</work-title></work>
  <identification>
    <creator type="composer">Ludwig van Beethoven</creator>
    <rights>Public domain melody. Arrangement made for Piano Learn, released under CC0.</rights>
  </identification>
  <part-list>
    <score-part id="P1"><part-name>Piano</part-name></score-part>
  </part-list>
  <part id="P1">
${body}  </part>
</score-partwise>
`;
writeFileSync(new URL('../public/samples/ode-to-joy.musicxml', import.meta.url), xml);
console.log('wrote public/samples/ode-to-joy.musicxml');
