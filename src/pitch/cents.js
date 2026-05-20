// Convert frequency to musical pitch and cent deviation from equal temperament.

import { DEFAULT_A4, NOTE_NAMES } from '../constants.js';

// MIDI note number for a frequency. A4 (440Hz) = 69.
export function hzToMidi(hz, a4 = DEFAULT_A4) {
  return 69 + 12 * Math.log2(hz / a4);
}

export function midiToHz(midi, a4 = DEFAULT_A4) {
  return a4 * 2 ** ((midi - 69) / 12);
}

// Note name with octave for an integer MIDI number, e.g. 69 -> "A4".
export function midiToName(midi) {
  const m = Math.round(midi);
  const name = NOTE_NAMES[((m % 12) + 12) % 12];
  const octave = Math.floor(m / 12) - 1;
  return `${name}${octave}`;
}

// Full pitch info for a frequency:
// { hz, midi, nearestMidi, note, cents } where cents in [-50, +50].
export function analyzeHz(hz, a4 = DEFAULT_A4) {
  const midi = hzToMidi(hz, a4);
  const nearestMidi = Math.round(midi);
  return {
    hz,
    midi,
    nearestMidi,
    note: midiToName(nearestMidi),
    cents: (midi - nearestMidi) * 100,
  };
}
