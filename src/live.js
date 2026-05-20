// Live pitch monitor: stream mic PCM via ffmpeg and redraw the analyze view
// in place. Reuses analyzePitchTrack (YIN) + renderChart so the on-screen
// output is identical to `awe analyze`.

import { spawn } from 'node:child_process';
import { analyzePitchTrack, detectOptions } from './pitch/yin.js';
import { renderChart } from './render/chart.js';
import { pickDefaultDevice } from './devices.js';
import { parsePitchBound } from './pitch/cents.js';
import {
  ANALYZE_SAMPLE_RATE,
  DEFAULT_A4,
  DEFAULT_TOLERANCE,
  HOP_SIZE,
  LIVE_Y_MIN_NOTE,
  LIVE_Y_MAX_NOTE,
} from './constants.js';

// opts: { device, a4, tolerance, color, chart, window, refresh }
export function live(opts = {}) {
  const device = opts.device || pickDefaultDevice();
  if (!device) {
    return Promise.reject(new Error('No capture device found. Run `awe devices`.'));
  }

  const a4 = opts.a4 ?? DEFAULT_A4;
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const color = opts.color ?? true;
  const chart = opts.chart ?? 'line';
  const windowSec = opts.window ?? 6; // rolling window shown on screen
  // Fixed Y axis keeps the GUI height constant frame-to-frame.
  const yMin = parsePitchBound(opts.minNote ?? LIVE_Y_MIN_NOTE, a4);
  const yMax = parsePitchBound(opts.maxNote ?? LIVE_Y_MAX_NOTE, a4);
  const refreshMs = opts.refresh ?? 200; // redraw cadence
  // Coarser hop than file analysis keeps each redraw cheap enough for live.
  const hopSize = Math.max(HOP_SIZE, 1024);
  // YIN tuning (threshold/rms/min-hz/max-hz) plus the live hop.
  const detect = { hopSize, ...detectOptions(opts) };

  const maxBytes = Math.floor(windowSec * ANALYZE_SAMPLE_RATE) * 4;
  let pcm = Buffer.alloc(0);

  const args = [
    '-hide_banner',
    '-loglevel',
    'error',
    '-f',
    'alsa',
    '-ac',
    '1',
    '-ar',
    String(ANALYZE_SAMPLE_RATE),
    '-i',
    device,
    '-f',
    'f32le',
    '-',
  ];
  const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

  return new Promise((resolve, reject) => {
    let stderr = '';
    ff.stderr.on('data', (c) => (stderr += c));

    // Keep only the most recent `windowSec` of audio.
    ff.stdout.on('data', (chunk) => {
      pcm = pcm.length ? Buffer.concat([pcm, chunk]) : chunk;
      if (pcm.length > maxBytes) pcm = pcm.subarray(pcm.length - maxBytes);
    });
    ff.on('error', reject);

    process.stdout.write('\x1b[?25l'); // hide cursor

    const draw = () => {
      const n = pcm.length >> 2; // 4 bytes per float32
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = pcm.readFloatLE(i << 2);
      const track = analyzePitchTrack(samples, ANALYZE_SAMPLE_RATE, detect);

      process.stdout.write('\x1b[H\x1b[2J'); // cursor home + clear screen
      console.log('🎤 LIVE pitch monitor — sing / play into the mic   (Ctrl+C to stop)');
      console.log(`device: ${device}   window: ${windowSec}s`);
      // Fixed Y axis + no per-note table -> constant frame height (no jumping).
      renderChart(track, { a4, tolerance, color, chart, yMin, yMax, showTable: false });
    };

    const timer = setInterval(draw, refreshMs);

    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      process.off('SIGINT', onSigint);
      try {
        ff.kill('SIGINT');
      } catch {
        // already gone
      }
      process.stdout.write('\x1b[?25h\n'); // restore cursor
      if (err) reject(err);
      else resolve();
    };
    const onSigint = () => finish();
    process.on('SIGINT', onSigint);

    ff.on('close', (code) => {
      if (code === 0 || code === 255 || code === null) finish();
      else finish(new Error(`ffmpeg exited ${code}: ${stderr.trim()}`));
    });
  });
}
