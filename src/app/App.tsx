import { useState } from 'react';
import { buildSteps } from '../score/buildSteps';
import { readScoreFile } from '../score/loadScore';
import { type ParsedScore, ScoreError } from '../score/types';
import { PracticeScreen } from './PracticeScreen';

interface Loaded {
  xml: string;
  score: ParsedScore;
}

const SAMPLE_URL = `${import.meta.env.BASE_URL}samples/ode-to-joy.musicxml`;

export function App() {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const open = async (getData: () => Promise<ArrayBuffer>) => {
    setBusy(true);
    setError(null);
    try {
      const xml = await readScoreFile(await getData());
      setLoaded({ xml, score: buildSteps(xml) });
    } catch (err) {
      setError(err instanceof ScoreError ? err.message : 'Something went wrong opening that file.');
      if (!(err instanceof ScoreError)) console.error(err);
    } finally {
      setBusy(false);
    }
  };

  const openFile = (file: File | undefined) => file && open(() => file.arrayBuffer());
  const openSample = () =>
    open(async () => {
      const res = await fetch(SAMPLE_URL);
      if (!res.ok) throw new Error(`Sample not found (${res.status})`);
      return res.arrayBuffer();
    });

  if (loaded) {
    return <PracticeScreen key={loaded.xml} {...loaded} onBack={() => setLoaded(null)} />;
  }

  return (
    <main className="start">
      <p className="eyebrow">Piano Learn</p>
      <h1>Learn a piece by playing along</h1>
      <p className="start__lead">
        Open a piano score and play it note by note. The score waits for you on every step.
      </p>

      <div className="start__actions">
        <button className="btn btn--primary" onClick={openSample} disabled={busy}>
          Try the sample piece
        </button>
        <label className="btn btn--secondary">
          Open a file…
          <input
            type="file"
            accept=".musicxml,.xml,.mxl"
            hidden
            onChange={(e) => {
              openFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </label>
      </div>

      <div
        className={`dropzone ${dragging ? 'dropzone--active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          openFile(e.dataTransfer.files[0]);
        }}
      >
        <strong>Drop a .musicxml or .mxl file here</strong>
        <span>Piano (grand staff) scores only</span>
      </div>

      {busy && <p className="muted">Opening…</p>}
      {error && (
        <div className="error-card" role="alert">
          <strong>That file couldn’t be opened.</strong> {error}
        </div>
      )}
    </main>
  );
}
