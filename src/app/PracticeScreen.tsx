import { useState } from 'react';
import type { Hand, ParsedScore } from '../score/types';
import { ScoreView } from '../score/ScoreView';
import { useComputerKeyboard } from '../input/useComputerKeyboard';
import { type MidiStatus, useMidiInput } from '../input/useMidiInput';
import { midiToName } from '../input/notes';
import { usePractice } from './usePractice';

function MidiPill({ status }: { status: MidiStatus }) {
  switch (status.state) {
    case 'connected':
      return (
        <span className="pill pill--ok" title={status.names.join(', ')}>
          <span className="dot dot--ok" /> {status.names[0]}
          {status.names.length > 1 ? ` +${status.names.length - 1}` : ''} · connected
        </span>
      );
    case 'pending':
      return <span className="pill pill--neutral"><span className="dot" /> Looking for a keyboard…</span>;
    case 'no-device':
      return (
        <span className="pill pill--neutral" title="Plug in a MIDI keyboard over USB and it will connect automatically.">
          <span className="dot" /> No keyboard found · plug one in
        </span>
      );
    case 'denied':
      return (
        <span className="pill pill--warn" title="Allow MIDI access for this site in the browser's address bar, then reload.">
          <span className="dot dot--wrong" /> MIDI access blocked
        </span>
      );
    case 'unsupported':
      return (
        <span className="pill pill--warn" title="Use Chrome or Edge on a computer to connect a MIDI keyboard.">
          <span className="dot dot--wrong" /> This browser can’t use MIDI
        </span>
      );
  }
}

interface Props {
  score: ParsedScore;
  xml: string;
  onBack: () => void;
}

export function PracticeScreen({ score, xml, onBack }: Props) {
  const p = usePractice(score);
  const kb = useComputerKeyboard(p.noteOn, p.noteOff);
  const midi = useMidiInput(p.noteOn, p.noteOff);
  const [renderError, setRenderError] = useState<string | null>(null);

  const toggleHand = (hand: Hand) => {
    const next = { ...p.hands, [hand]: !p.hands[hand] };
    if (!next.R && !next.L) return; // keep at least one hand on
    p.setHands(next);
  };

  return (
    <div className="practice">
      <header className="topbar">
        <button className="btn btn--ghost" onClick={onBack}>← Pieces</button>
        <div className="topbar__title">
          <h1>{score.title}</h1>
          <p>
            {score.composer ? `${score.composer} · ` : ''}
            {score.measureCount} bars
          </p>
        </div>
        <MidiPill status={midi} />
      </header>

      <div className="toolbar">
        <div className="toolbar__group">
          {(['R', 'L'] as Hand[]).map((h) => (
            <button
              key={h}
              className={`chip ${p.hands[h] ? 'chip--on' : ''}`}
              aria-pressed={p.hands[h]}
              onClick={() => toggleHand(h)}
            >
              <span className={`dot dot--${h === 'R' ? 'rh' : 'lh'}`} />
              {h === 'R' ? 'Right hand' : 'Left hand'}
            </button>
          ))}
        </div>
        <div className="toolbar__spacer" />
        <button className="btn btn--secondary" onClick={p.restart}>↺ Restart</button>
      </div>

      <div className="status" role="status" aria-live="polite">
        {p.finished ? (
          <span className={p.clean ? 'status__ok' : ''}>
            {p.clean ? '🎉 Clean run, no wrong keys!' : 'Finished! Try again for a clean run.'}
          </span>
        ) : (
          <>
            <span className="status__label">Play now:</span>
            {p.required.map((n) => (
              <span
                key={n.midi}
                className={`note-tag note-tag--${n.hand === 'R' ? 'rh' : 'lh'} ${p.held.has(n.midi) ? 'note-tag--held' : ''}`}
              >
                {midiToName(n.midi)}
                {n.finger ? <sup>{n.finger}</sup> : null}
              </span>
            ))}
            {p.step && <span className="status__bar">Bar {p.step.measureNumber}</span>}
            {p.feedback?.kind === 'wrong' && p.feedback.midi !== undefined && (
              <span className="status__wrong">
                You played {midiToName(p.feedback.midi)}
                {p.wrongKeys.size > 0 ? ' (let go to continue)' : ''}
              </span>
            )}
          </>
        )}
      </div>

      {renderError ? (
        <div className="error-card">The score could not be drawn: {renderError}</div>
      ) : (
        <ScoreView
          xml={xml}
          currentKey={p.currentKey}
          playedKeys={p.playedKeys}
          wrongPulse={p.wrongPulse}
          hands={p.hands}
          onError={(e) => setRenderError(e.message)}
        />
      )}

      <footer className="kb-help">
        <strong>No keyboard? Use computer keys:</strong> A S D F G H J K L ; = white keys from C{kb.octave} ·
        W E T Y U O P = black keys · Z / X = octave down / up
      </footer>
    </div>
  );
}
