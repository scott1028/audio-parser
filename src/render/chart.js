// Render a pitch curve + cent-deviation stats to the terminal.

import { analyzeHz, midiToName } from '../pitch/cents.js';
import { DEFAULT_A4, DEFAULT_TOLERANCE } from '../constants.js';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function colorize(s, code, enabled) {
  return enabled ? `${code}${s}${C.reset}` : s;
}

function median(arr) {
  if (arr.length === 0) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// Classify a cent value relative to tolerance: 'on' | 'sharp' | 'flat'.
function tuneClass(cents, tol) {
  if (cents > tol) return 'sharp';
  if (cents < -tol) return 'flat';
  return 'on';
}

const SYMBOL = { on: '●', sharp: '▲', flat: '▼' }; // ● ▲ ▼
const COLOR = { on: C.green, sharp: C.red, flat: C.cyan };

// track: [{ t, hz }]. opts: { a4, tolerance, color, width }.
export function renderChart(track, opts = {}) {
  const a4 = opts.a4 ?? DEFAULT_A4;
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  const color = opts.color ?? true;

  const voiced = track
    .filter((f) => f.hz != null)
    .map((f) => ({ t: f.t, ...analyzeHz(f.hz, a4) }));

  if (voiced.length === 0) {
    console.log('No pitched audio detected (silence or unvoiced only).');
    return;
  }

  printCurve(voiced, track, { tol, color, width: opts.width });
  printStats(voiced, tol, color);
  printNoteTable(voiced, color);
}

function printCurve(voiced, track, { tol, color, width }) {
  const labelW = 4; // e.g. "A#4 "
  const termW = process.stdout.columns || 100;
  const plotW = Math.max(20, Math.min(width ?? termW - labelW - 2, 120));

  // Y range: span of nearest notes across the recording.
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of voiced) {
    lo = Math.min(lo, v.nearestMidi);
    hi = Math.max(hi, v.nearestMidi);
  }
  // Pad one semitone above/below so markers don't sit on the edge.
  lo -= 1;
  hi += 1;

  // Bucket all frames (by time) into plot columns to keep the time axis
  // continuous even across silence.
  const t0 = track[0].t;
  const tEnd = track[track.length - 1].t;
  const span = tEnd - t0 || 1;

  // Per-column representative pitch (continuous midi) and tune class.
  const colMidi = new Array(plotW).fill(null);
  const colClass = new Array(plotW).fill(null);
  const buckets = Array.from({ length: plotW }, () => []);
  for (const v of voiced) {
    let c = Math.floor(((v.t - t0) / span) * plotW);
    if (c >= plotW) c = plotW - 1;
    if (c < 0) c = 0;
    buckets[c].push(v.midi);
  }
  for (let c = 0; c < plotW; c++) {
    const m = median(buckets[c]);
    if (m == null) continue;
    colMidi[c] = m;
    colClass[c] = tuneClass((m - Math.round(m)) * 100, tol);
  }

  console.log(`\nPitch Curve  (time ${t0.toFixed(1)}s → ${tEnd.toFixed(1)}s, each column ≈ ${(span / plotW).toFixed(2)}s)`);
  console.log(colorize('Y = note, X = time ──▶', C.dim, color) + '\n');

  // Draw from high notes (top) to low notes (bottom).
  for (let midi = hi; midi >= lo; midi--) {
    const label = midiToName(midi).padEnd(labelW);
    let line = '';
    for (let c = 0; c < plotW; c++) {
      if (colMidi[c] != null && Math.round(colMidi[c]) === midi) {
        const cls = colClass[c];
        line += colorize(SYMBOL[cls], COLOR[cls], color);
      } else {
        // Faint gridline on natural-note rows for readability.
        const isNatural = ![1, 3, 6, 8, 10].includes(((midi % 12) + 12) % 12);
        line += isNatural ? colorize('·', C.dim, color) : ' ';
      }
    }
    console.log(colorize(label, C.dim, color) + line);
  }

  // X axis with a few time ticks.
  console.log(' '.repeat(labelW) + colorize('└' + '─'.repeat(plotW - 1), C.dim, color));
  const ticks = 5;
  let axis = ' '.repeat(labelW);
  for (let i = 0; i < ticks; i++) {
    const tsec = t0 + (span * i) / (ticks - 1);
    const lbl = `${tsec.toFixed(1)}s`;
    const pos = Math.round((plotW - 1) * (i / (ticks - 1)));
    while (axis.length - labelW < pos) axis += ' ';
    axis += lbl;
  }
  console.log(colorize(axis, C.dim, color));

  // Legend.
  console.log(
    '\nLegend: ' +
      colorize(`${SYMBOL.on} on`, COLOR.on, color) +
      '  ' +
      colorize(`${SYMBOL.sharp} sharp (>+${tol}¢)`, COLOR.sharp, color) +
      '  ' +
      colorize(`${SYMBOL.flat} flat (<-${tol}¢)`, COLOR.flat, color)
  );
}

function printStats(voiced, tol, color) {
  const n = voiced.length;
  const absSum = voiced.reduce((s, v) => s + Math.abs(v.cents), 0);
  const onCount = voiced.filter((v) => Math.abs(v.cents) <= tol).length;
  let maxSharp = 0;
  let maxFlat = 0;
  for (const v of voiced) {
    if (v.cents > maxSharp) maxSharp = v.cents;
    if (v.cents < maxFlat) maxFlat = v.cents;
  }
  const pct = ((onCount / n) * 100).toFixed(1);
  const meanAbs = (absSum / n).toFixed(1);

  console.log('\nCent Deviation Summary');
  console.log(`  Voiced frames analyzed : ${n}`);
  console.log(`  Mean absolute deviation: ${meanAbs} cents`);
  console.log(`  In tune (±${tol}¢)        : ${onCount}/${n} (${pct}%)`);
  console.log(`  Max sharp / flat       : +${maxSharp.toFixed(0)}¢ / ${maxFlat.toFixed(0)}¢`);

  const verdict =
    Number(pct) >= 80 ? ['Good intonation', C.green]
      : Number(pct) >= 50 ? ['Some pitch drift', C.cyan]
        : ['Often off pitch', C.red];
  console.log('  Verdict                : ' + colorize(verdict[0], verdict[1], color));
}

function printNoteTable(voiced, color) {
  // Aggregate by nearest note, ordered by pitch.
  const map = new Map();
  for (const v of voiced) {
    const key = v.nearestMidi;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(v.cents);
  }
  const keys = [...map.keys()].sort((a, b) => a - b);

  console.log('\nPer-note average deviation');
  console.log(colorize('  note   frames   avg cents', C.dim, color));
  for (const k of keys) {
    const cs = map.get(k);
    const avg = cs.reduce((s, c) => s + c, 0) / cs.length;
    const sign = avg >= 0 ? '+' : '';
    const name = midiToName(k).padEnd(5);
    console.log(`  ${name}  ${String(cs.length).padStart(6)}   ${sign}${avg.toFixed(1)}¢`);
  }
}
