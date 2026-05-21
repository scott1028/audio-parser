// Render a pitch curve + cent-deviation stats to the terminal.

import { analyzeHz, midiToName } from '../pitch/cents.js';
import { DEFAULT_A4, DEFAULT_TOLERANCE, NOTE_NAMES } from '../constants.js';

const C = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
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

// 'gap' marks interpolated/held columns (no real pitch: silence or detect
// failure); drawn gray so it's clearly distinct from measured pitch.
const SYMBOL = { on: '●', sharp: '▲', flat: '▼', gap: '╌' };
const COLOR = { on: C.green, sharp: C.red, flat: C.cyan, gap: C.gray };

// track: [{ t, hz }].
// opts: { a4, tolerance, color, width, chart, yMin, yMax (MIDI), tMin, tMax, showTable, showCentsRuler }.
// Passing yMin+yMax fixes the Y axis (stable height, e.g. for live view).
// Passing tMin+tMax fixes the X axis to that time window (e.g. live 0..10s).
// showCentsRuler appends a one-octave (0..1200¢) ruler marking the current note
// (live only); it reserves extra bottom rows so the frame still fits the screen.
export function renderChart(track, opts = {}) {
  const a4 = opts.a4 ?? DEFAULT_A4;
  const tol = opts.tolerance ?? DEFAULT_TOLERANCE;
  const color = opts.color ?? true;
  const chart = opts.chart ?? 'line';
  const showTable = opts.showTable ?? true;
  const showCentsRuler = opts.showCentsRuler ?? false;
  const yMin = opts.yMin ?? null;
  const yMax = opts.yMax ?? null;
  const tWindow =
    opts.tMin != null && opts.tMax != null ? { tMin: opts.tMin, tMax: opts.tMax } : null;
  const fixedY = yMin != null && yMax != null;

  const voiced = track
    .filter((f) => f.hz != null)
    .map((f) => ({ t: f.t, ...analyzeHz(f.hz, a4) }));

  // Without a fixed axis there's nothing meaningful to draw when silent.
  if (voiced.length === 0 && !fixedY) {
    console.log('No pitched audio detected (silence or unvoiced only).');
    return;
  }

  // Reserve more bottom rows when the cents ruler is shown so the live frame
  // still fits the terminal without scrolling.
  const reserveBottom = showCentsRuler ? 20 : 14;
  const curveOpts = { tol, color, width: opts.width, yMin, yMax, tWindow, reserveBottom };
  if (chart === 'dots') {
    printCurve(voiced, track, curveOpts);
  } else {
    printLineCurve(voiced, track, curveOpts);
  }
  printStats(voiced, tol, color);
  if (showTable && voiced.length > 0) printNoteTable(voiced, color);
  if (showCentsRuler) printCentsRuler(voiced, { color, tol, width: opts.width });
}

function printCurve(voiced, track, { tol, color, width, yMin, yMax, tWindow }) {
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

  const { colMidi, colClass, t0, tEnd, span } = buildColumns(voiced, track, plotW, tol, tWindow);

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
function printLineCurve(voiced, track, { tol, color, width, yMin, yMax, tWindow, reserveBottom }) {
  const labelW = 4; // e.g. "A#4"
  // Reserve labelW+1 on the right too (┤ + mirrored note label).
  const plotW = plotWidth(width, labelW, labelW + 1);
  const { colMidi, colClass, t0, tEnd, span } = buildColumns(voiced, track, plotW, tol, tWindow);

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
  const maxRowsForTerm = Math.max(8, (process.stdout.rows || 40) - (reserveBottom ?? 14));
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

  // Fill every empty column so the line is continuous; filled columns are
  // class 'gap' (gray) to flag "no real pitch" (silence / detect failure).
  const fillMidi = colMidi.slice();
  const fillClass = colClass.slice();
  const first = colMidi.findIndex((m) => m != null);
  if (first === -1) {
    // Whole window unvoiced: neutral flat line at the vertical center.
    const mid = (minV + maxV) / 2;
    for (let c = 0; c < plotW; c++) {
      fillMidi[c] = mid;
      fillClass[c] = 'gap';
    }
  } else {
    let last = plotW - 1;
    while (colMidi[last] == null) last--;
    // Interior gaps: linear interpolation between the two surrounding notes.
    let prev = first;
    for (let c = first + 1; c <= last; c++) {
      if (colMidi[c] == null) continue;
      const gap = c - prev;
      if (gap > 1) {
        const v0 = colMidi[prev];
        const v1 = colMidi[c];
        for (let k = prev + 1; k < c; k++) {
          fillMidi[k] = v0 + ((v1 - v0) * (k - prev)) / gap;
          fillClass[k] = 'gap';
        }
      }
      prev = c;
    }
    // Leading / trailing gaps: hold the nearest real note (flat line).
    for (let c = 0; c < first; c++) {
      fillMidi[c] = colMidi[first];
      fillClass[c] = 'gap';
    }
    for (let c = last + 1; c < plotW; c++) {
      fillMidi[c] = colMidi[last];
      fillClass[c] = 'gap';
    }
  }

  // Draw connectors between consecutive columns (now always continuous).
  for (let c = 0; c < plotW - 1; c++) {
    const v0 = fillMidi[c];
    const v1 = fillMidi[c + 1];
    if (v0 == null || v1 == null) continue;
    const y0 = rowOf(v0);
    const y1 = rowOf(v1);
    // Gray when either endpoint is interpolated/held; else the real tune class.
    const cls = fillClass[c] === 'gap' || fillClass[c + 1] === 'gap' ? 'gap' : fillClass[c];
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
    // Same de-dup decides both sides so left/right labels align row-for-row.
    const changed = note !== lastNote;
    const leftLabel = changed ? note.padStart(labelW) : ' '.repeat(labelW);
    const rightLabel = changed ? note.padEnd(labelW) : ' '.repeat(labelW);
    lastNote = note;
    let line = '';
    for (let c = 0; c < plotW; c++) line += grid[r][c] != null ? grid[r][c] : ' ';
    console.log(
      colorize(leftLabel, C.dim, color) +
        colorize('┤', C.dim, color) +
        line +
        colorize('┤', C.dim, color) +
        colorize(rightLabel, C.dim, color)
    );
  }
  console.log(' '.repeat(labelW) + colorize('└' + '─'.repeat(plotW) + '┘', C.dim, color));
  printTimeAxis(t0, span, plotW, labelW + 1, color);

  console.log(
    '\nLegend: ' +
      colorize(`─ on`, COLOR.on, color) +
      '  ' +
      colorize(`─ sharp (>+${tol}¢)`, COLOR.sharp, color) +
      '  ' +
      colorize(`─ flat (<-${tol}¢)`, COLOR.flat, color) +
      '  ' +
      colorize(`╌ no pitch / interpolated`, COLOR.gap, color)
  );
}

// Plot width in columns, leaving room for the left axis labels (and the right
// mirrored labels when rightReserve > 0) so the full line never wraps.
function plotWidth(width, labelW, rightReserve = 0) {
  const termW = process.stdout.columns || 100;
  return Math.max(20, Math.min(width ?? termW - labelW - 2 - rightReserve, 120));
}

// Bucket voiced frames into `plotW` time columns.
// Returns { colMidi, colClass, t0, tEnd, span }; gaps are null.
// tWindow ({ tMin, tMax }) fixes the time axis instead of using the track span.
function buildColumns(voiced, track, plotW, tol, tWindow) {
  const t0 = tWindow ? tWindow.tMin : track.length ? track[0].t : 0;
  const tEnd = tWindow ? tWindow.tMax : track.length ? track[track.length - 1].t : 0;
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

// Write `text` into a char array starting at `col`, clamped to the row width.
// With overwrite:false, skips placement if any target cell is already used
// (keeps note labels from garbling each other on narrow terminals).
function placeText(arr, col, text, overwrite = true) {
  let start = col;
  if (start + text.length > arr.length) start = arr.length - text.length;
  if (start < 0) start = 0;
  if (!overwrite) {
    for (let i = 0; i < text.length; i++) if (arr[start + i] !== ' ') return false;
  }
  for (let i = 0; i < text.length; i++) arr[start + i] = text[i];
  return true;
}

// One-octave (0..1200¢) horizontal ruler marking where the current note sits,
// reproducing the equal-tempered cents axis (C C# D … C). "Current" is the most
// recent voiced frame (last element of `voiced`). Always prints a constant 5
// lines so the live frame height never jumps (marker line blank when silent).
function printCentsRuler(voiced, { color, tol, width }) {
  const termW = process.stdout.columns || 100;
  const rulerW = Math.max(24, Math.min(width ?? termW - 2, 120));
  const colOf = (cents) => Math.round((cents / 1200) * (rulerW - 1));

  const current = voiced.length ? voiced[voiced.length - 1] : null;

  // Header readout: note + signed cent deviation (colored) + frequency.
  let header;
  if (current) {
    const rounded = Math.round(current.cents); // String(-0) === "0", so no "-0¢"
    const sign = rounded > 0 ? '+' : '';
    const dev = colorize(`${sign}${rounded}¢`, COLOR[tuneClass(current.cents, tol)], color);
    header = `Now: ${current.note}  ${dev}   (${current.hz.toFixed(1)} Hz)`;
  } else {
    header = colorize('Now: —  (waiting for sound…)', C.dim, color);
  }

  // Number axis: 0/300/600/900 on their ticks, 1200 right-aligned, unit appended.
  const numbers = new Array(rulerW).fill(' ');
  for (const v of [0, 300, 600, 900, 1200]) {
    const label = String(v);
    const c = colOf(v);
    const start = v === 0 ? 0 : v === 1200 ? rulerW - label.length : c - (label.length >> 1);
    placeText(numbers, start, label);
  }

  // Tick line: ─ baseline with ┼ at every 100¢ and ├ / ┤ at the ends.
  const ticks = new Array(rulerW).fill('─');
  for (let v = 0; v <= 1200; v += 100) ticks[colOf(v)] = '┼';
  ticks[0] = '├';
  ticks[rulerW - 1] = '┤';

  // Note names at each 100¢ tick: C C# D … B C (skip on collision when narrow).
  const notes = new Array(rulerW).fill(' ');
  for (let k = 0; k <= 12; k++) {
    const name = k < 12 ? NOTE_NAMES[k] : 'C';
    placeText(notes, colOf(k * 100), name, false);
  }

  // Marker line: ▲ at the current note's position within the octave.
  const marker = new Array(rulerW).fill(' ');
  if (current) {
    const pcCents = (((current.midi % 12) + 12) % 12) * 100; // 0..1200
    marker[colOf(pcCents)] = colorize('▲', COLOR[tuneClass(current.cents, tol)], color);
  }

  console.log('\n' + header);
  console.log(colorize(numbers.join('') + ' ¢', C.dim, color));
  console.log(colorize(ticks.join(''), C.dim, color));
  console.log(colorize(notes.join(''), C.dim, color));
  console.log(marker.join(''));
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
