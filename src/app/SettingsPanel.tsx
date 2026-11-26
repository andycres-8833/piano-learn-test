import { useEffect } from 'react';
import type { HintLevel } from '../feedback/hints';
import type { MidiStatus } from '../input/useMidiInput';
import type { KeyboardSize, Settings } from './settings';

interface Props {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  midi: MidiStatus;
  onClose: () => void;
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          className={`segmented__opt ${o.value === value ? 'segmented__opt--on' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const HINT_HELP: Record<HintLevel, string> = {
  off: 'Only shows which key you played.',
  light: 'Also says which way to go, e.g. “2 keys lower → C5”.',
  full: 'Also draws an arrow on the keyboard and the wrong note on the score.',
};

export function SettingsPanel({ settings, update, midi, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const devices = midi.state === 'connected' ? midi.devices : [];

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="drawer__scrim" onClick={onClose} />
      <aside className="drawer__panel">
        <div className="drawer__head">
          <h2 id="settings-title">Settings</h2>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close settings">✕</button>
        </div>

        <section className="field">
          <label className="field__label" htmlFor="midi-input">MIDI keyboard</label>
          {devices.length > 0 ? (
            <select
              id="midi-input"
              className="select"
              value={devices.some((d) => d.id === settings.midiInputId) ? settings.midiInputId : 'all'}
              onChange={(e) => update({ midiInputId: e.target.value })}
            >
              <option value="all">All connected keyboards</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          ) : (
            <p className="field__help">No keyboard connected. Plug one in over USB and it appears here.</p>
          )}
        </section>

        <section className="field">
          <span className="field__label">Keyboard size</span>
          <p className="field__help">Notes your keyboard can’t reach are skipped and shown faded on the score.</p>
          <Segmented<KeyboardSize>
            label="Keyboard size"
            value={settings.keyboardSize}
            options={[61, 76, 88].map((n) => ({ value: n as KeyboardSize, label: `${n} keys` }))}
            onChange={(keyboardSize) => update({ keyboardSize })}
          />
        </section>

        <section className="field">
          <span className="field__label">Hints for wrong keys</span>
          <Segmented<HintLevel>
            label="Hints"
            value={settings.hintLevel}
            options={[
              { value: 'off', label: 'Off' },
              { value: 'light', label: 'Light' },
              { value: 'full', label: 'Full' },
            ]}
            onChange={(hintLevel) => update({ hintLevel })}
          />
          <p className="field__help">{HINT_HELP[settings.hintLevel]}</p>
        </section>

        <section className="field">
          <span className="field__label">Display</span>
          <label className="switch">
            <input
              type="checkbox"
              checked={settings.showKeyboard}
              onChange={(e) => update({ showKeyboard: e.target.checked })}
            />
            <span className="switch__track" aria-hidden />
            Show on-screen keyboard
          </label>
        </section>
      </aside>
    </div>
  );
}
