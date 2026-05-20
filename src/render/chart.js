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

// Bridge up to this many consecutive empty columns in the line chart, so
// brief detection dropouts in a sustained note don't break the line.
const GAP_BRIDGE = 2;

// track: [{ t, hz }].
// opts: { a4, tolerance, color, width, chart, yMin, yMax (MIDI), showTable }.
// Passing yMin+yMax fixes the Y axis (stable height, e.g. for live view).
export function renderChart(track, opts = {}) {
  const a4 = opts.a4 ?? DEFAULT_A4;
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  const color = opts.color ?? true;
  const chart = opts.chart ?? 'line';
  const showTable = opts.showTable ?? true;
  const yMin = opts.yMin ?? null;
  const yMax = opts.yMax ?? null;
  const fixedY = yMin != null && yMax != null;

  const voiced = track
    .filter((f) => f.hz != null)
    .map((f) => ({ t: f.t, ...analyzeHz(f.hz, a4) }));

  // Without a fixed axis there's nothing meaningful to draw when silent.
  if (voiced.length === 0 && !fixedY) {
    console.log('No pitched audio detected (silence or unvoiced only).');
    return;
  }

  const curveOpts = { tol, color, width: opts.width, yMin, yMax };
  if (chart === 'dots') {
    printCurve(voiced, track, curveOpts);
  } else {
    printLineCurve(voiced, track, curveOpts);
  }
  printStats(voiced, tol, color);
  if (showTable && voiced.length > 0) printNoteTable(voiced, color);
}

function printCurve(voiced, track, { tol, color, width, yMin, yMax }) {
  const labelW = 4; // e.g. "A#4 "
  const plotW = plotWidth(width, labelW);

  // Y range: fixed when yMin/yMax given, else span of detected notes.
  let lo;
  let hi;
  if (yMin != null && yMax != null) {
    lo = Math.round(Math.min(yMin, yMax));
    hi = Math.round(Math.max(yMin, yMax));
  } else {
    lo = Infinity;
    hi = -Infinity;
    for (const v of voiced) {
      lo = Math.min(lo, v.nearestMidi);
      hi = Math.max(hi, v.nearestMidi);
    }
    // Pad one semitone above/below so markers don't sit on the edge.
    lo -= 1;
    hi += 1;
  }

  const { colMidi, colClass, t0, tEnd, span } = buildColumns(voiced, track, plotW, tol);

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
  printTimeAxis(t0, span, plotW, labelW, color);

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

// Connected line chart (asciichart style) of the continuous pitch contour.
function printLineCurve(voiced, track, { tol, color, width, yMin, yMax }) {
  const labelW = 4; // e.g. "A#4"
  const plotW = plotWidth(width, labelW);
  const { colMidi, colClass, t0, tEnd, span } = buildColumns(voiced, track, plotW, tol);

  // MIDI range: fixed when yMin/yMax given (stable height), else auto-fit.
  const fixedY = yMin != null && yMax != null;
  let minV;
  let maxV;
  if (fixedY) {
    minV = Math.min(yMin, yMax);
    maxV = Math.max(yMin, yMax);
  } else {
    minV = Infinity;
    maxV = -Infinity;
    for (const m of colMidi) {
      if (m == null) continue;
      if (m < minV) minV = m;
      if (m > maxV) maxV = m;
    }
    if (!Number.isFinite(minV)) {
      minV = 57; // A3
      maxV = 69; // A4
    }
    // Pad so the line isn't glued to the edge.
    minV -= 0.5;
    maxV += 0.5;
    if (maxV - minV < 1) {
      maxV += 0.5;
      minV -= 0.5;
    }
  }
  const range = maxV - minV;
  // Auto: ~2 rows/semitone for smoothness. Fixed: ~1 row/semitone, but always
  // capped to the terminal height so the frame fits and stays a constant size.
  const maxRowsForTerm = Math.max(8, (process.stdout.rows || 40) - 14);
  const rows = Math.min(
    maxRowsForTerm,
    Math.max(8, Math.round(range * (fixedY ? 1 : 2)) + 1)
  );
  const rowOf = (v) => {
    const r = Math.round(((maxV - v) / range) * (rows - 1)); // 0 = top
    return r < 0 ? 0 : r > rows - 1 ? rows - 1 : r; // clamp out-of-range to edge
  };

  const grid = Array.from({ length: rows }, () => new Array(plotW).fill(null));
  const put = (r, c, ch, cls) => {
    grid[r][c] = colorize(ch, COLOR[cls], color);
  };

  // Bridge short gaps (<= GAP_BRIDGE empty columns) by linear interpolation so
  // brief dropouts don't break the line; longer gaps stay as real breaks.
  const fillMidi = colMidi.slice();
  const fillClass = colClass.slice();
  let prev = -1;
  for (let c = 0; c < plotW; c++) {
    if (colMidi[c] == null) continue;
    const gap = c - prev;
    if (prev >= 0 && gap > 1 && gap - 1 <= GAP_BRIDGE) {
      const v0 = colMidi[prev];
      const v1 = colMidi[c];
      for (let k = prev + 1; k < c; k++) {
        const m = v0 + ((v1 - v0) * (k - prev)) / gap;
        fillMidi[k] = m;
        fillClass[k] = tuneClass((m - Math.round(m)) * 100, tol);
      }
    }
    prev = c;
  }

  // Draw connectors between consecutive (bridged) voiced columns.
  for (let c = 0; c < plotW - 1; c++) {
    const v0 = fillMidi[c];
    const v1 = fillMidi[c + 1];
    if (v0 == null || v1 == null) continue;
    const y0 = rowOf(v0);
    const y1 = rowOf(v1);
    const cls = fillClass[c];
    if (y0 === y1) {
      put(y0, c, '─', cls);
    } else {
      put(y1, c, y0 > y1 ? '╭' : '╰', cls);
      put(y0, c, y0 > y1 ? '╯' : '╮', cls);
      const lo = Math.min(y0, y1);
      const hi = Math.max(y0, y1);
      for (let y = lo + 1; y < hi; y++) put(y, c, '│', cls);
    }
  }
  // Mark isolated voiced columns (real gaps / last column) so they stay visible.
  for (let c = 0; c < plotW; c++) {
    if (fillMidi[c] == null) continue;
    const r = rowOf(fillMidi[c]);
    if (grid[r][c] == null) put(r, c, SYMBOL[fillClass[c]], fillClass[c]);
  }

  console.log(`\nPitch Curve (line)  time ${t0.toFixed(1)}s → ${tEnd.toFixed(1)}s`);
  console.log(colorize('Y = pitch, X = time ──▶', C.dim, color) + '\n');

  let lastNote = null;
  for (let r = 0; r < rows; r++) {
    const v = maxV - (r / (rows - 1)) * range;
    const note = midiToName(Math.round(v));
    const label = note !== lastNote ? note.padStart(labelW) : ' '.repeat(labelW);
    lastNote = note;
    let line = '';
    for (let c = 0; c < plotW; c++) line += grid[r][c] != null ? grid[r][c] : ' ';
    console.log(colorize(label, C.dim, color) + colorize('┤', C.dim, color) + line);
  }
  console.log(' '.repeat(labelW) + colorize('└' + '─'.repeat(plotW), C.dim, color));
  printTimeAxis(t0, span, plotW, labelW + 1, color);

  console.log(
    '\nLegend: ' +
      colorize(`─ on`, COLOR.on, color) +
      '  ' +
      colorize(`─ sharp (>+${tol}¢)`, COLOR.sharp, color) +
      '  ' +
      colorize(`─ flat (<-${tol}¢)`, COLOR.flat, color)
  );
}

// Plot width in columns, leaving room for the left axis labels.
function plotWidth(width, labelW) {
  const termW = process.stdout.columns || 100;
  return Math.max(20, Math.min(width ?? termW - labelW - 2, 120));
}

// Bucket voiced frames into `plotW` time columns.
// Returns { colMidi, colClass, t0, tEnd, span }; gaps are null.
function buildColumns(voiced, track, plotW, tol) {
  const t0 = track.length ? track[0].t : 0;
  const tEnd = track.length ? track[track.length - 1].t : 0;
  const span = tEnd - t0 || 1;

  const buckets = Array.from({ length: plotW }, () => []);
  for (const v of voiced) {
    let c = Math.floor(((v.t - t0) / span) * plotW);
    if (c >= plotW) c = plotW - 1;
    if (c < 0) c = 0;
    buckets[c].push(v.midi);
  }

  const colMidi = new Array(plotW).fill(null);
  const colClass = new Array(plotW).fill(null);
  for (let c = 0; c < plotW; c++) {
    const m = median(buckets[c]);
    if (m == null) continue;
    colMidi[c] = m;
    colClass[c] = tuneClass((m - Math.round(m)) * 100, tol);
  }
  return { colMidi, colClass, t0, tEnd, span };
}

function printTimeAxis(t0, span, plotW, leftPad, color) {
  const ticks = 5;
  let axis = ' '.repeat(leftPad);
  for (let i = 0; i < ticks; i++) {
    const tsec = t0 + (span * i) / (ticks - 1);
    const lbl = `${tsec.toFixed(1)}s`;
    const pos = Math.round((plotW - 1) * (i / (ticks - 1)));
    while (axis.length - leftPad < pos) axis += ' ';
    axis += lbl;
  }
  console.log(colorize(axis, C.dim, color));
}

function printStats(voiced, tol, color) {
  const n = voiced.length;
  if (n === 0) {
    // Keep the same number of lines so the live frame height stays constant.
    console.log('\nCent Deviation Summary');
    console.log('  Voiced frames analyzed : 0');
    console.log('  Mean absolute deviation: —');
    console.log(`  In tune (±${tol}¢)        : —`);
    console.log('  Max sharp / flat       : —');
    console.log('  Verdict                : ' + colorize('(waiting for sound…)', C.dim, color));
    return;
  }
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
