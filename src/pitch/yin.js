// YIN fundamental-frequency estimator (de Cheveigné & Kawahara, 2002).
// Pure JS, operates on Float32Array PCM. No dependencies.

import {
  FRAME_SIZE,
  HOP_SIZE,
  YIN_THRESHOLD,
  RMS_SILENCE,
  MIN_HZ,
  MAX_HZ,
} from '../constants.js';

// Detect f0 of a single frame. Returns { hz, probability } or null if unvoiced.
function detectFrame(frame, sampleRate, threshold) {
  const halfLen = frame.length >> 1;
  const yin = new Float32Array(halfLen);

  // Step 1: squared difference function.
  for (let tau = 1; tau < halfLen; tau++) {
    let sum = 0;
    for (let i = 0; i < halfLen; i++) {
      const delta = frame[i] - frame[i + tau];
      sum += delta * delta;
    }
    yin[tau] = sum;
  }

  // Step 2: cumulative mean normalized difference.
  yin[0] = 1;
  let runningSum = 0;
  for (let tau = 1; tau < halfLen; tau++) {
    runningSum += yin[tau];
    yin[tau] *= tau / (runningSum || 1);
  }

  // Step 3: absolute threshold — first dip below threshold, walk to its min.
  let tauEstimate = -1;
  for (let tau = 2; tau < halfLen; tau++) {
    if (yin[tau] < threshold) {
      while (tau + 1 < halfLen && yin[tau + 1] < yin[tau]) tau++;
      tauEstimate = tau;
      break;
    }
  }
  if (tauEstimate === -1) return null;

  // Step 4: parabolic interpolation around the chosen tau.
  const x0 = tauEstimate > 1 ? tauEstimate - 1 : tauEstimate;
  const x2 = tauEstimate + 1 < halfLen ? tauEstimate + 1 : tauEstimate;
  let betterTau;
  if (x0 === tauEstimate || x2 === tauEstimate) {
    betterTau = tauEstimate;
  } else {
    const s0 = yin[x0];
    const s1 = yin[tauEstimate];
    const s2 = yin[x2];
    const denom = 2 * (2 * s1 - s2 - s0);
    betterTau = denom !== 0 ? tauEstimate + (s2 - s0) / denom : tauEstimate;
  }

  return { hz: sampleRate / betterTau, probability: 1 - yin[tauEstimate] };
}

function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

// Slice the signal into overlapping frames and detect pitch per frame.
// Returns [{ t (seconds), hz (number|null) }, ...].
export function analyzePitchTrack(samples, sampleRate, opts = {}) {
  const frameSize = opts.frameSize ?? FRAME_SIZE;
  const hopSize = opts.hopSize ?? HOP_SIZE;
  const threshold = opts.threshold ?? YIN_THRESHOLD;
  const rmsSilence = opts.rmsSilence ?? RMS_SILENCE;
  const minHz = opts.minHz ?? MIN_HZ;
  const maxHz = opts.maxHz ?? MAX_HZ;

  const track = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    const frame = samples.subarray(start, start + frameSize);
    const t = start / sampleRate;

    if (rms(frame) < rmsSilence) {
      track.push({ t, hz: null });
      continue;
    }

    const res = detectFrame(frame, sampleRate, threshold);
    const hz = res && res.hz >= minHz && res.hz <= maxHz ? res.hz : null;
    track.push({ t, hz });
  }
  return track;
}
