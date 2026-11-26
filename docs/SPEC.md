# Piano Learn — MVP Specification

**Status:** Draft v1 · 2026-11-24
**Design:** [Figma — Piano Learn MVP UI Draft](https://www.figma.com/design/5zWGeeYp1axEoN6NhnM4rG)

## 1. Summary

A browser app for beginner and self-taught pianists. The user uploads a piano score (MusicXML), connects a MIDI keyboard, and plays along. In **wait mode** the score advances only when the correct keys are held, with colour feedback on the score and an on-screen keyboard. Pieces are learned section by section through loops; progress is saved locally.

## 2. Goals and non-goals

### Goals (MVP)
- Load `.musicxml`, `.xml`, and `.mxl` piano (grand-staff) scores and render them as real sheet music.
- Read MIDI note on/off from a USB keyboard via Web MIDI.
- Wait-mode practice with clear visual feedback for correct and wrong notes.
- Per-hand practice, with the disabled hand optionally played back.
- Section looping with automatic advance after N clean passes.
- Local library and progress that persist with no backend.

### Out of scope for v1
Tempo/graded mode and metronome · accounts and cloud sync · mobile and iOS (deferred; may be wrapped later) · sustain-pedal input · D.C./D.S./Coda jump logic · grading grace notes and ornaments · octave-shift for small keyboards · difficulty-based auto-sectioning · non-piano instruments · practice-time tracking.

## 3. Platform and stack

| Concern | Choice |
|---|---|
| Target | Desktop/laptop Chrome and Edge (Web MIDI). Other browsers get an "unsupported browser" screen, with computer-keyboard input still available. |
| Framework | React + TypeScript + Vite |
| Score rendering | OpenSheetMusicDisplay (OSMD, BSD-3) |
| Audio | Tone.js + sampled piano (Salamander or similar CC-licensed samples) |
| `.mxl` unzip | JSZip |
| Storage | IndexedDB via `idb-keyval` |
| Hosting | Static site (GitHub Pages, Netlify, or Vercel) |
| Tests | Vitest for the engine and logic; Playwright smoke test for load → play |

## 4. Core behaviour

### 4.1 Input
- **MIDI:** auto-connect to the first input; switch devices in Settings. Hot-plug is handled through `onstatechange`.
- **Fallbacks:** the computer keyboard (two-row piano mapping, octave shift with Z/X) and clicking the on-screen piano. These are required for development and for users without a keyboard.
- **Keyboard size setting:** 61, 76, or 88 keys. Notes outside the range are auto-skipped and marked on the score.

### 4.2 Score model (built from the MusicXML via OSMD)
The score is flattened into an ordered list of **Steps**, in playback order, with simple repeats and voltas expanded.

```ts
type Hand = 'R' | 'L';
interface StepNote { midi: number; hand: Hand; finger?: number; osmdRef: unknown; }
interface Step {
  index: number;
  measure: number;          // 1-based printed bar number
  onset: Fraction;          // position within the expanded timeline
  notes: StepNote[];        // only notes that START at this onset
}
```

Rules applied when building Steps:
- A **tie continuation** is not a new onset. It is excluded from Steps and only needs to be held.
- **Grace notes** are skipped. For **ornaments**, only the principal note counts. **Arpeggiated chords** are treated as plain chords.
- **Pedal** markings are rendered but ignored.
- Repeats and first/second endings are expanded. D.C., D.S., and Coda are played as written, without jumps.
- Hand: staff 1 is R and staff 2 is L.

### 4.3 Wait-mode matching engine
State: the current Step and the set of keys held down (`held`).

A Step's **required** notes are its notes, filtered to the enabled hands, minus any notes out of range.

| Event | Result |
|---|---|
| A key is pressed that is not in *required* | **Wrong key.** Flash red, show the wrong-key hint (§4.4.1), add to the bar's error count, and mark the current pass as not clean. The Step is **blocked** while any wrong key is held. |
| `held ⊇ required` and no wrong key is held | **Step passes.** Notes turn green and the cursor advances. |
| A required note needs to be re-struck (the same pitch as in the previous step) | The key must be released and pressed again. Holding it from the previous step does not count. |

Notes:
- Order and timing within a chord don't matter. Only what is held at the same moment matters.
- Note duration is not graded. Only the onset (key down) is checked.
- Notes of a disabled hand are excluded from *required*. If "plays along" is on, they are played through Tone.js when their Step is reached.

### 4.4 Feedback
- **Score colours:** grey for upcoming, blue for the current step, green for correct, and a red flash for wrong. Notes outside the player's keyboard range are drawn faded and are skipped.
- **Cursor:** the OSMD cursor, styled as a soft blue band.
- **On-screen keyboard** (can be hidden): the next keys are shown in the hand colour (RH blue, LH orange) with fingering numbers. Pressed keys flash green (correct) or red (wrong).
- **Trouble-bar heat map** (toggle): each bar is tinted by its cumulative wrong-note count.
- **Auto-scroll:** the page scrolls so the cursor's system stays near the top.

#### 4.4.1 Wrong-key hints
Goal: help a self-learner correct the mistake without becoming dependent on hints. The **Hints** setting has three levels, and the default is **Light**.

| Level | What a wrong key shows |
|---|---|
| **Off** | Red flash and "You played E5". |
| **Light** (default) | Same as Off, plus a directive hint: "You played E5. Hint: 2 keys lower → C5". |
| **Full** | Same as Light, plus an arrow on the on-screen keyboard from the wrong key to the right one, and a dashed red ghost note on the staff at the pitch that was played. |

- Hints appear on the **first** wrong press.
- **Wording:** use "keys lower / keys higher" (pitch direction, so it matches both the staff and the keyboard), followed by "→" and the target note name.
- **Counting:** count white keys only. "N keys lower" means N white keys in that direction.
- **Target:** the nearest required note (by pitch) that isn't already held. If every required note is already held, the hint is "let go of E5, the other keys are right".
- **Special cases:**
  - Same letter, wrong octave: "right note, one octave lower → C4".
  - Black-key target (white-key counting can't reach it): "the black key just above F → F♯4".
- The ghost note and the arrow disappear when the wrong key is released. The text stays until the step passes.

### 4.5 Sections and loops
Modes:
- **Whole piece:** one section.
- **Pick bars:** click a bar, then shift-click (or drag) to set a custom range.
- **Auto:** split at double barlines, rehearsal marks, and key or time signature changes. Where none exist, fall back to 4-bar chunks.
- **Every N bars:** 4, 6, 10, or a custom number.

Loop behaviour:
- When a section ends, the run restarts from the section's first Step. A **clean pass** is a run with zero wrong keys.
- After **N clean passes** (default 3, adjustable in Settings) the section is marked **learned** and the app advances to the next section automatically. The user can move to the next or previous section at any time.
- When all sections are learned, the app offers a **final run-through** of the whole piece. A clean run marks the piece **Learned**.
- When a piece is reopened, practice resumes at the **last active section**.
- **Listen to section** plays the section's notes through Tone.js at a fixed comfortable tempo.

### 4.6 Sound
- The disabled hand plays along by default (can be muted).
- "Play my key presses aloud" is off by default. It is for controllers without speakers.
- No metronome.

## 5. Data model (IndexedDB)

```ts
interface PieceRecord {
  id: string;                 // uuid
  title: string; composer?: string;
  fileName: string;
  musicXml: string;           // decompressed XML text
  addedAt: number; lastPracticedAt?: number;
  isSample?: boolean;
}

interface ProgressRecord {
  pieceId: string;
  sectionMode: 'whole' | 'pick' | 'auto' | 'every';
  everyN?: number;
  sections: { startBar: number; endBar: number; cleanPasses: number; learned: boolean }[];
  activeSectionIndex: number;
  barErrors: Record<number, number>;   // bar number → wrong-key count
  handsEnabled: { R: boolean; L: boolean };
  pieceLearned: boolean;
}

interface Settings {
  midiInputId: 'all' | string;         // default 'all' (listen to every connected keyboard)
  hintLevel: 'off' | 'light' | 'full'; // default 'light'
  keyboardSize: 61 | 76 | 88;
  cleanPassesRequired: number;         // default 3
  echoKeys: boolean;                   // default false
  otherHandPlays: boolean;             // default true
  showKeyboard: boolean;               // default true
  showFingering: boolean;              // default true
  onboardingDone: boolean;
}
```

**Backup:** export all records as a single JSON file, and import it again (with a merge or replace prompt).

## 6. Screens
These match the frames in the Figma draft.
1. **First visit:** a checklist (browser, keyboard detected, press a key to test), then the actions *Try the sample piece*, *Upload my own*, or *Use computer keys*.
2. **Library:** piece cards (title, composer, progress bar, status, last practiced, and a CTA), a drop zone for uploads, the MIDI status pill, and a Backup menu.
3. **Practice:** a top bar (back, title, MIDI status, Settings); a toolbar (hand chips, section-mode segmented control, Listen, Restart, Trouble bars, zoom); a section strip (Prev, section pills showing status and pass count, Next); the score area; and the on-screen keyboard with a "Play now" hint.
4. **Settings panel:** MIDI input, keyboard size, clean passes, sound toggles, and display toggles.
5. **States:** unsupported browser, no keyboard found, a file that isn't a piano score, and the "section learned" toast.

## 7. Architecture

```
src/
  app/            routes, layout, providers
  midi/           MidiService (Web MIDI + computer-keyboard + on-screen sources → NoteEvent stream)
  score/          loadScore (xml/mxl), OSMD wrapper, buildSteps(), sectioner (auto/every/pick)
  engine/         WaitModeEngine (pure, framework-free; unit-tested)
  audio/          PianoSampler (Tone.js), section playback
  feedback/       score colouring, ghost notes, heat map overlay, cursor/scroll
  storage/        idb repositories, backup export/import
  ui/             components (Button, ToggleChip, SectionPill, PianoKeyboard, ...) + theme tokens
public/samples/   bundled public-domain sample piece
```

- The **engine is pure**: `(step, held, event) → {result, nextState}`. This makes it fully unit-testable without a browser.
- The **theme tokens** match the Figma variables (`color/note/*`, `color/hand/*`, `space/*`, `radius/*`). Restyling means editing one file.

## 8. Build plan (milestones)

| # | Milestone | Done when |
|---|---|---|
| 1 | Scaffold, file loading (xml and mxl), OSMD render, `buildSteps`, wait mode driven by the computer keyboard | The sample piece can be played start to finish with the keyboard. Engine unit tests pass. |
| 2 | Web MIDI, the full feedback colours, wrong-key hints (Off/Light/Full) with the ghost note and keyboard arrow, the on-screen keyboard with fingering, and settings for keyboard choice, keyboard size, hints, and showing the keyboard | A real keyboard drives the app. Wrong and right keys are shown on both the score and the keyboard, with a hint toward the right key. |
| 3 | Hand toggles, the sampled piano, the disabled hand playing along, Listen | Single-hand practice works, with audio. |
| 4 | Section modes, loops, clean passes, auto-advance, final run-through | The full learning loop works. |
| 5 | Library, IndexedDB persistence, resume, heat map, backup, onboarding and error states, applying the Figma design | The MVP is feature-complete. Deploy to static hosting. |

## 9. Acceptance criteria (selected)
- An unmodified MuseScore `.mxl` export of a piano piece loads and renders.
- For a chord C-E-G, pressing E, then G, then C (all held) passes. Pressing C-E-G plus F blocks the step until F is released.
- A tied note does not require a second press. A repeated C followed by C requires a release between the presses.
- With only the left hand enabled, right-hand notes are never required, and they play aloud if "plays along" is on.
- After 3 clean passes the section is marked learned and the next section starts. One wrong key resets that pass's clean status.
- Reloading the page restores the library, the section progress, and the active section.

## 10. Risks and open items
- **OSMD note mapping:** mapping OSMD graphical notes back to Steps for colouring needs a spike in M1.
- **Repeat expansion:** check that OSMD's repetition support suits Step building. Fallback: our own expander for simple repeats and voltas.
- **Sample licensing:** use CC0 or CC-BY piano samples and a public-domain score. Record attribution in the README.
