// Decode any audio file to mono float32 PCM via ffmpeg.

import { spawn } from 'node:child_process';
import { ANALYZE_SAMPLE_RATE } from './constants.js';

// Resolves to { samples: Float32Array, sampleRate }.
export function decodeToPcm(file, sampleRate = ANALYZE_SAMPLE_RATE) {
  return new Promise((resolve, reject) => {
    const args = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      file,
      '-f',
      'f32le',
      '-ac',
      '1',
      '-ar',
      String(sampleRate),
      '-',
    ];
    const ff = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    const chunks = [];
    let stderr = '';
    ff.stdout.on('data', (c) => chunks.push(c));
    ff.stderr.on('data', (c) => (stderr += c));
    ff.on('error', reject);
    ff.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg decode failed (${code}): ${stderr.trim()}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      // Reinterpret the byte buffer as little-endian float32.
      const samples = new Float32Array(
        buf.buffer,
        buf.byteOffset,
        Math.floor(buf.byteLength / 4)
      );
      resolve({ samples, sampleRate });
    });
  });
}
