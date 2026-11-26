import { useEffect, useRef, useState } from 'react';
import { parseMidiMessage } from './midi';

export type MidiStatus =
  | { state: 'unsupported' }
  | { state: 'pending' }
  | { state: 'denied' }
  | { state: 'no-device' }
  | { state: 'connected'; names: string[]; devices: MidiDevice[] };

export interface MidiDevice {
  id: string;
  name: string;
}

/**
 * Connects to MIDI keyboards (including ones plugged in later) and forwards
 * note on / note off. With `selectedId = 'all'` every keyboard is used, so no
 * setup is needed; otherwise only the chosen keyboard is listened to.
 */
export function useMidiInput(
  onNoteOn: (midi: number) => void,
  onNoteOff: (midi: number) => void,
  selectedId: 'all' | string = 'all',
): MidiStatus {
  const [status, setStatus] = useState<MidiStatus>(() =>
    typeof navigator !== 'undefined' && 'requestMIDIAccess' in navigator
      ? { state: 'pending' }
      : { state: 'unsupported' },
  );
  const handlers = useRef({ onNoteOn, onNoteOff });
  handlers.current = { onNoteOn, onNoteOff };
  const selected = useRef(selectedId);
  const syncRef = useRef<() => void>(() => {});

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
      const sel = selected.current;
      // Only the chosen keyboard counts (if it's unplugged, fall back to all).
      // Note-offs always pass so nothing gets stuck after switching.
      const chosenConnected = sel !== 'all' && access?.inputs.get(sel)?.state === 'connected';
      if (msg.type === 'on' && chosenConnected && sel !== input.id) return;
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
      const devices: MidiDevice[] = [];
      access.inputs.forEach((input) => {
        if (input.state !== 'connected') return;
        devices.push({ id: input.id, name: input.name || 'MIDI keyboard' });
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
      const sel = selected.current;
      const active = sel === 'all' ? devices : devices.filter((d) => d.id === sel);
      const names = (active.length ? active : devices).map((d) => d.name);
      setStatus(devices.length ? { state: 'connected', names, devices } : { state: 'no-device' });
    };

    syncRef.current = sync;
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

  // Switching keyboards: refresh the status (names shown in the pill).
  useEffect(() => {
    selected.current = selectedId;
    syncRef.current();
  }, [selectedId]);

  return status;
}
