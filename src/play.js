// Playback an audio file to verify it has sound.
// Prefers ffplay; falls back to `ffmpeg -f wav - | aplay -`.

import { spawn, spawnSync } from 'node:child_process';

function hasBinary(bin) {
  const r = spawnSync('which', [bin], { stdio: 'ignore' });
  return r.status === 0;
}

export function play(file) {
  if (!file) return Promise.reject(new Error('Usage: awe play <file>'));

  if (hasBinary('ffplay')) {
    console.log(`Playing (ffplay): ${file}`);
    return run('ffplay', ['-hide_banner', '-nodisp', '-autoexit', file]);
  }

  if (hasBinary('aplay')) {
    console.log(`Playing (ffmpeg | aplay): ${file}`);
    return pipeFfmpegToAplay(file);
  }

  return Promise.reject(new Error('Neither ffplay nor aplay is available.'));
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`))
    );
  });
}

function pipeFfmpegToAplay(file) {
  return new Promise((resolve, reject) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', file, '-f', 'wav', '-']);
    const ap = spawn('aplay', ['-q', '-'], { stdio: ['pipe', 'inherit', 'inherit'] });
    ff.stdout.pipe(ap.stdin);
    ff.on('error', reject);
    ap.on('error', reject);
    ap.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`aplay exited with ${code}`))
    );
  });
}
