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
  FRAME_SIZE,
  HOP_SIZE,
  LIVE_Y_MIN_NOTE,
  LIVE_Y_MAX_NOTE,
  LIVE_WINDOW_SEC,
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
  const windowSec = opts.window ?? LIVE_WINDOW_SEC; // rolling window shown on screen
  // Fixed Y axis keeps the GUI height constant frame-to-frame.
  const yMin = parsePitchBound(opts.minNote ?? LIVE_Y_MIN_NOTE, a4);
  const yMax = parsePitchBound(opts.maxNote ?? LIVE_Y_MAX_NOTE, a4);
  const refreshMs = opts.refresh ?? 200; // redraw cadence
  // Coarser hop than file analysis keeps each redraw cheap enough for live.
  const hopSize = Math.max(HOP_SIZE, 1024);
  // YIN tuning (threshold/rms/min-hz/max-hz) plus the live hop.
  const detect = { hopSize, ...detectOptions(opts) };

  // Incremental analysis with a committed history keeps past pitches fixed:
  // each instant is analyzed exactly once (hop-aligned to absolute samples)
  // and stored, so prior columns never get recomputed (no vertical jitter).
  let tail = Buffer.alloc(0); // unanalyzed samples; tail[0] == abs index tailStart
  let tailStart = 0; // absolute sample index of tail[0]
  let total = 0; // total samples received (now = total / sampleRate)
  const history = []; // [{ t (abs sec), hz }] — committed, never recomputed

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

    // Append incoming audio; never trim raw PCM here (analysis is incremental).
    ff.stdout.on('data', (chunk) => {
      total += chunk.length >> 2;
      tail = tail.length ? Buffer.concat([tail, chunk]) : chunk;
    });
    // Route spawn errors through finish() so the alt screen / cursor are
    // always restored (finish is defined below; the arrow defers the lookup).
    ff.on('error', (err) => finish(err));

    // Enter the alternate screen buffer (no scrollback) + hide cursor, so
    // redraws never accumulate history — the scrollbar can't keep growing.
    process.stdout.write('\x1b[?1049h\x1b[?25l');

    const draw = () => {
      // 1) Analyze only the new samples, hop-aligned to absolute positions, and
      //    commit results to history (each instant analyzed exactly once).
      const avail = tail.length >> 2;
      if (avail >= FRAME_SIZE) {
        const samples = new Float32Array(avail);
        for (let i = 0; i < avail; i++) samples[i] = tail.readFloatLE(i << 2);
        const local = analyzePitchTrack(samples, ANALYZE_SAMPLE_RATE, detect);
        for (const f of local) history.push({ t: tailStart / ANALYZE_SAMPLE_RATE + f.t, hz: f.hz });
        // Frames start at 0,hop,2hop…; dropping frames*hop leaves tail[0] at the
        // next unanalyzed frame start (keeps the overlap tail for the next frame).
        const drop = local.length * hopSize;
        tail = tail.subarray(drop << 2);
        tailStart += drop;
      }

      // 2) Trim committed history to the most recent `windowSec`, then shift to
      //    relative time so the axis always reads 0..windowSec (newest at right).
      const now = total / ANALYZE_SAMPLE_RATE;
      const cutoff = now - windowSec; // absolute time of the left edge
      while (history.length && history[0].t < cutoff) history.shift();
      const view = history.map((f) => ({ t: f.t - cutoff, hz: f.hz }));

      process.stdout.write('\x1b[H\x1b[2J'); // cursor home + clear screen
      console.log('🎤 LIVE pitch monitor — sing / play into the mic   (Ctrl+C to stop)');
      console.log(`device: ${device}   window: ${windowSec}s`);
      // Fixed Y axis + fixed X window -> stable height; committed hz -> no jitter.
      renderChart(view, {
        a4,
        tolerance,
        color,
        chart,
        yMin,
        yMax,
        tMin: 0,
        tMax: windowSec,
        showTable: false,
        showCentsRuler: true,
      });
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
      // Show cursor + leave the alternate screen buffer (restores prior view).
      process.stdout.write('\x1b[?25h\x1b[?1049l');
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
