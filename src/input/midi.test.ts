import { describe, expect, it } from 'vitest';
import { parseMidiMessage } from './midi';

describe('parseMidiMessage', () => {
  it('reads note on (any channel)', () => {
    expect(parseMidiMessage([0x90, 60, 100])).toEqual({ type: 'on', note: 60 });
    expect(parseMidiMessage([0x93, 64, 1])).toEqual({ type: 'on', note: 64 });
  });

  it('treats note on with velocity 0 as note off', () => {
    expect(parseMidiMessage([0x90, 60, 0])).toEqual({ type: 'off', note: 60 });
  });

  it('reads note off', () => {
    expect(parseMidiMessage([0x80, 60, 64])).toEqual({ type: 'off', note: 60 });
  });

  it('ignores pedal, other messages and short data', () => {
    expect(parseMidiMessage([0xb0, 64, 127])).toBeNull(); // sustain pedal
    expect(parseMidiMessage([0xf8])).toBeNull(); // clock
    expect(parseMidiMessage(null)).toBeNull();
  });
});
