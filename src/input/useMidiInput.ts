import { useEffect, useRef, useState } from 'react';
import { parseMidiMessage } from './midi';

export type MidiStatus =
  | { state: 'unsupported' }
  | { state: 'pending' }
  | { state: 'denied' }
  | { state: 'no-device' }
  | { state: 'connected'; names: string[] };

/**
 * Connects to every MIDI keyboard plugged in (and any plugged in later) and
 * forwards note on / note off. No setup needed: plug in and play.
 */
export function useMidiInput(onNoteOn: (midi: number) => void, onNoteOff: (midi: number) => void): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>(() =>
    typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
      ? { state: 'pending' }
      : { state: 'unsupported' },
  );
  const handlers = useRef({ onNoteOn, onNoteOff });
  handlers.current = { onNoteOn, onNoteOff };

  useEffect(() => {
    if (!('requestMIDIAccess' in navigator)) return;
    let access: MIDIAccess | null = null;
    let cancelled = false;
    /** Notes held on each device, so unplugging releases them. */
    const held = new Map<string, Set<number>>();
    const attached = new Set<string>();

    const onMessage = (input: MIDIInput) => (e: MIDIMessageEvent) => {
      const msg = parseMidiMessage(e.data);
      if (!msg) return;
      const notes = held.get(input.id) ?? new Set<number>();
      held.set(input.id, notes);
      if (msg.type === 'on') {
        notes.add(msg.note);
        handlers.current.onNoteOn(msg.note);
      } else {
        notes.delete(msg.note);
        handlers.current.onNoteOff(msg.note);
      }
    };

    const sync = () => {
      if (!access || cancelled) return;
      const names: string[] = [];
      access.inputs.forEach((input) => {
        if (input.state !== 'connected') return;
        names.push(input.name || 'MIDI keyboard');
        if (!attached.has(input.id)) {
          input.onmidimessage = onMessage(input);
          attached.add(input.id);
        }
      });
      // Release notes from devices that went away.
      for (const id of [...attached]) {
        const input = access.inputs.get(id);
        if (!input || input.state !== 'connected') {
          held.get(id)?.forEach((n) => handlers.current.onNoteOff(n));
          held.delete(id);
          attached.delete(id);
        }
      }
      setStatus(names.length ? { state: 'connected', names } : { state: 'no-device' });
    };

    navigator
      .requestMIDIAccess()
      .then((a) => {
        if (cancelled) return;
        access = a;
        a.onstatechange = sync;
        sync();
      })
      .catch(() => !cancelled && setStatus({ state: 'denied' }));

    return () => {
      cancelled = true;
      if (access) {
        access.onstatechange = null;
        access.inputs.forEach((input) => {
          input.onmidimessage = null;
        });
      }
      held.forEach((notes) => notes.forEach((n) => handlers.current.onNoteOff(n)));
    };
  }, []);

  return status;
}
