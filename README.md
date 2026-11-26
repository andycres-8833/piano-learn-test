# Piano Learn

Learn a piano piece by playing along. Open a MusicXML score, play it on a MIDI keyboard
(or your computer keyboard), and the score waits for you on every note.

- **Spec:** [docs/SPEC.md](docs/SPEC.md)
- **Design draft:** [Figma](https://www.figma.com/design/5zWGeeYp1axEoN6NhnM4rG)

## Run it

```bash
npm install
npm run dev     # http://localhost:5173 — use Chrome or Edge
npm test        # unit tests (parser + wait-mode engine)
npm run build   # static site in dist/
```

## Status

Milestones 1–2 of 5 (see the spec for the full plan):

- [x] Open `.musicxml` / `.xml` / `.mxl` piano scores and draw them (OpenSheetMusicDisplay)
- [x] Score → playable steps (chords, ties, grace notes, repeats and 1st/2nd endings)
- [x] Wait mode: the cursor waits for the right keys; wrong keys block until released
- [x] Computer-keyboard input (A–; white keys, W–P black keys, Z/X octave)
- [x] MIDI keyboard: plug in over USB and it connects automatically (Chrome/Edge)
- [x] Right/left hand toggles
- [x] On-screen keyboard: next keys by hand with fingering, pressed keys green/red, clickable
- [x] Wrong-key hints — Off / Light (default, "2 keys lower → C5") / Full (adds keyboard arrow + ghost note)
- [x] Settings: which MIDI keyboard, keyboard size (61/76/88, out-of-range notes skipped and faded), hints, show keyboard — remembered in the browser
- [ ] Sound (milestone 3) · Sections & loops (milestone 4) · Library & progress (milestone 5)

## Credits

- Sample piece: *Ode to Joy* (L. v. Beethoven, public domain), easy arrangement written for this
  project and released under CC0 — regenerate with `node scripts/make-sample.mjs`.
- Score rendering: [OpenSheetMusicDisplay](https://opensheetmusicdisplay.org/) (BSD-3-Clause).
