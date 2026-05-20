// Shared constants for recording and pitch analysis.

// Reference pitch for the equal-tempered scale (A4).
export const DEFAULT_A4 = 440;

// Note names per semitone, indexed by (midi % 12). Sharps only.
export const NOTE_NAMES = [
  'C',
  'C#',
  'D',
  'D#',
  'E',
  'F',
  'F#',
  'G',
  'G#',
  'A',
  'A#',
  'B',
];

// --- Recording (Phase 1) ---
// Capture sample rate handed to ffmpeg/ALSA. plughw converts as needed.
export const RECORD_SAMPLE_RATE = 44100;
// Mono is enough for pitch analysis and keeps files small.
export const RECORD_CHANNELS = 1;
// libmp3lame VBR quality (0=best, 9=worst). 2 is high quality.
export const MP3_QUALITY = 2;

// --- Analysis (Phase 2) ---
// Decode rate for analysis. Vocal/instrument fundamentals stay < ~1.1kHz,
// so 22050Hz is plenty and roughly halves the work versus 44100Hz.
export const ANALYZE_SAMPLE_RATE = 22050;
// YIN window: 2048 samples (~93ms @ 22050Hz), hop 512 (~23ms/frame).
export const FRAME_SIZE = 2048;
export const HOP_SIZE = 512;
// YIN absolute threshold for the cumulative-mean-normalized difference.
export const YIN_THRESHOLD = 0.12;
// Frames quieter than this RMS are treated as silence (unvoiced).
export const RMS_SILENCE = 0.005;
// Plausible fundamental range; results outside are discarded.
export const MIN_HZ = 65; // ~C2
export const MAX_HZ = 1100; // ~C#6

// Default fixed Y-axis range for the live view (note names), so the GUI
// height stays constant instead of rescaling per frame. Covers most singing.
export const LIVE_Y_MIN_NOTE = 'C3';
export const LIVE_Y_MAX_NOTE = 'C6';

// Default "in tune" tolerance in cents (±). Cent deviation is measured
// against the nearest semitone, so it always falls in [-50, +50]; ~25 cents
// is a reasonable line between "on pitch" and "noticeably sharp/flat".
export const DEFAULT_TOLERANCE = 25;
