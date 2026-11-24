export type MidiNoteMessage = { type: 'on' | 'off'; note: number };

/**
 * Decode a raw MIDI message. Only note on / note off matter for wait mode;
 * everything else (pedal, pitch bend, clock …) is ignored.
 * A "note on" with velocity 0 is a note off, as many keyboards send it that way.
 */
export function parseMidiMessage(data: ArrayLike<number> | null | undefined): MidiNoteMessage | null {
  if (!data || data.length < 3) return null;
  const command = data[0] & 0xf0;
  const note = data[1];
  const velocity = data[2];
  if (command === 0x90) return { type: velocity > 0 ? 'on' : 'off', note };
  if (command === 0x80) return { type: 'off', note };
  return null;
}
