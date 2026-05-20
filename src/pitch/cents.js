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

const SEMITONE_OF = {
  C: 0, 'C#': 1, DB: 1, D: 2, 'D#': 3, EB: 3, E: 4, F: 5,
  'F#': 6, GB: 6, G: 7, 'G#': 8, AB: 8, A: 9, 'A#': 10, BB: 10, B: 11,
};

// Parse a note name like "C3", "A#4", "Bb2" to a MIDI number. Returns null
// if it doesn't look like a note name.
export function noteToMidi(name) {
  const m = String(name).trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const key = (m[1] + m[2]).toUpperCase();
  const semi = SEMITONE_OF[key];
  if (semi == null) return null;
  return (Number(m[3]) + 1) * 12 + semi;
}

// Resolve a Y-axis bound given as a note name ("C3") or a frequency in Hz
// ("130.8") to a MIDI value. Returns null for empty/invalid input.
export function parsePitchBound(s, a4 = DEFAULT_A4) {
  if (s == null || s === '') return null;
  const note = noteToMidi(s);
  if (note != null) return note;
  const hz = Number(s);
  return Number.isFinite(hz) && hz > 0 ? hzToMidi(hz, a4) : null;
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
