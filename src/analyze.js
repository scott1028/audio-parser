// Phase 2 orchestration: decode -> YIN pitch track -> render chart + stats.

import { decodeToPcm } from './decode.js';
import { analyzePitchTrack, detectOptions } from './pitch/yin.js';
import { renderChart } from './render/chart.js';
import { parsePitchBound } from './pitch/cents.js';
import { ANALYZE_SAMPLE_RATE, DEFAULT_A4, DEFAULT_TOLERANCE } from './constants.js';

// opts: { a4, tolerance, color }
export async function analyze(file, opts = {}) {
  if (!file) throw new Error('Usage: awe analyze <file> [--a4 440] [--tolerance 25]');

  const { samples, sampleRate } = await decodeToPcm(file, ANALYZE_SAMPLE_RATE);
  if (samples.length === 0) throw new Error(`No audio decoded from ${file}`);

  const durationSec = samples.length / sampleRate;
  console.log(`Analyzing ${file}  (${durationSec.toFixed(1)}s @ ${sampleRate}Hz, A4=${opts.a4 ?? DEFAULT_A4}Hz)`);

  const a4 = opts.a4 ?? DEFAULT_A4;
  const track = analyzePitchTrack(samples, sampleRate, detectOptions(opts));
  renderChart(track, {
    a4,
    tolerance: opts.tolerance ?? DEFAULT_TOLERANCE,
    color: opts.color ?? true,
    chart: opts.chart ?? 'line',
    yMin: parsePitchBound(opts.minNote, a4),
    yMax: parsePitchBound(opts.maxNote, a4),
  });
}
