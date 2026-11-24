import { useState } from 'react';
import type { Hand, ParsedScore } from '../score/types';
import { ScoreView } from '../score/ScoreView';
import { useComputerKeyboard } from '../input/useComputerKeyboard';
import { midiToName } from '../input/notes';
import { usePractice } from './usePractice';

interface Props {
  score: ParsedScore;
  xml: string;
  onBack: () => void;
}

export function PracticeScreen({ score, xml, onBack }: Props) {
  const p = usePractice(score);
  const kb = useComputerKeyboard(p.noteOn, p.noteOff);
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
        <span className="pill pill--neutral" title="MIDI keyboard support arrives in the next milestone">
          <span className="dot" /> Computer keys · octave {kb.octave}
        </span>
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
        <strong>Computer keys:</strong> A S D F G H J K L ; = white keys from C{kb.octave} ·
        W E T Y U O P = black keys · Z / X = octave down / up
      </footer>
    </div>
  );
}
