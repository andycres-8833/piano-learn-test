import { useEffect, useRef, useState } from 'react';

/**
 * Computer-keyboard piano, for testing without a MIDI keyboard.
 * Home row = white keys, row above = black keys (like most DAWs):
 *
 *    W E   T Y U   O P
 *   A S D F G H J K L ;
 *   C D E F G A B C D E
 *
 * Z / X shift the octave down / up.
 */
const KEY_OFFSETS: Record<string, number> = {
  KeyA: 0, KeyW: 1, KeyS: 2, KeyE: 3, KeyD: 4, KeyF: 5, KeyT: 6, KeyG: 7,
  KeyY: 8, KeyH: 9, KeyU: 10, KeyJ: 11, KeyK: 12, KeyO: 13, KeyL: 14, KeyP: 15, Semicolon: 16,
};

export function useComputerKeyboard(
  onNoteOn: (midi: number) => void,
  onNoteOff: (midi: number) => void,
  enabled = true,
) {
  const [octave, setOctave] = useState(4);
  const down = useRef(new Map<string, number>());
  const handlers = useRef({ onNoteOn, onNoteOff });
  handlers.current = { onNoteOn, onNoteOff };

  useEffect(() => {
    if (!enabled) return;
    const pressed = down.current;

    const releaseAll = () => {
      for (const midi of pressed.values()) handlers.current.onNoteOff(midi);
      pressed.clear();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.code === 'KeyZ') return setOctave((o) => Math.max(1, o - 1));
      if (e.code === 'KeyX') return setOctave((o) => Math.min(7, o + 1));
      const offset = KEY_OFFSETS[e.code];
      if (offset === undefined || pressed.has(e.code)) return;
      e.preventDefault();
      const midi = (octave + 1) * 12 + offset;
      pressed.set(e.code, midi);
      handlers.current.onNoteOn(midi);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const midi = pressed.get(e.code);
      if (midi === undefined) return;
      pressed.delete(e.code);
      handlers.current.onNoteOff(midi);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', releaseAll);
      releaseAll();
    };
  }, [enabled, octave]);

  return { octave, setOctave };
}
