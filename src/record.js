// Phase 1: capture from an ALSA (USB) mic and encode to mp3 via ffmpeg.

import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  RECORD_SAMPLE_RATE,
  RECORD_CHANNELS,
  MP3_QUALITY,
} from './constants.js';
import { pickDefaultDevice } from './devices.js';

function defaultOutPath() {
  const ts = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')
    .replace('T', '_')
    .slice(0, 19);
  return `recordings/rec-${ts}.mp3`;
}

// Records to an mp3 file. Resolves when ffmpeg exits.
// opts: { device, duration (seconds, optional), out }
export function record(opts = {}) {
  const device = opts.device || pickDefaultDevice();
  const out = opts.out || defaultOutPath();

  if (!device) {
    return Promise.reject(
      new Error('No capture device found. Run `awe devices` to inspect.')
    );
  }

  mkdirSync(dirname(out), { recursive: true });

  const args = [
    '-hide_banner',
    '-f',
    'alsa',
    '-ac',
    String(RECORD_CHANNELS),
    '-ar',
    String(RECORD_SAMPLE_RATE),
    '-i',
    device,
    '-c:a',
    'libmp3lame',
    '-q:a',
    String(MP3_QUALITY),
  ];
  if (opts.duration) args.push('-t', String(opts.duration));
  args.push('-y', out);

  console.log(`Recording from ${device} -> ${out}`);
  console.log(
    opts.duration
      ? `Duration: ${opts.duration}s`
      : 'Press Ctrl+C to stop recording.'
  );

  return new Promise((resolve, reject) => {
    // 'inherit' stderr so the user sees ffmpeg's live recording stats.
    const ff = spawn('ffmpeg', args, { stdio: ['pipe', 'inherit', 'inherit'] });

    // On Ctrl+C, ask ffmpeg to finalize the file gracefully by sending 'q'.
    const onSigint = () => {
      try {
        ff.stdin.write('q');
      } catch {
        ff.kill('SIGINT');
      }
    };
    process.on('SIGINT', onSigint);

    ff.on('error', (err) => {
      process.off('SIGINT', onSigint);
      reject(err);
    });
    ff.on('close', (code) => {
      process.off('SIGINT', onSigint);
      // ffmpeg returns 255 when stopped via 'q'/SIGINT but still writes a
      // valid file, so treat that as success too.
      if (code === 0 || code === 255) {
        console.log(`\nSaved: ${out}`);
        resolve(out);
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}
