#!/usr/bin/env node
// CLI entry point. Dispatches: devices | record | play | analyze.

import { printDevices } from './devices.js';
import { record } from './record.js';
import { play } from './play.js';
import { analyze } from './analyze.js';
import { live } from './live.js';
import { DEFAULT_A4, DEFAULT_TOLERANCE } from './constants.js';

// Minimal flag parser: returns { _: [positionals], <flag>: value|true }.
function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

const HELP = `audio-wave-exaimer — pitch accuracy (cent deviation / pitch curve)

Usage:
  awe devices
  awe record [--device plughw:3,0] [--duration <sec>] [--out <file.mp3>]
  awe play <file.mp3>
  awe analyze <file.mp3> [--a4 ${DEFAULT_A4}] [--tolerance ${DEFAULT_TOLERANCE}] [--chart line|dots] [--no-color]
  awe live [--device plughw:3,0] [--a4 ${DEFAULT_A4}] [--tolerance ${DEFAULT_TOLERANCE}] [--chart line|dots] [--window 6] [--min-note C3] [--max-note C6] [--no-color]

  Fixed Y axis (stable height): --min-note / --max-note accept a note (e.g. C3) or Hz.
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  switch (cmd) {
    case 'devices':
      printDevices();
      break;

    case 'record':
      await record({
        device: typeof args.device === 'string' ? args.device : undefined,
        duration: args.duration ? Number(args.duration) : undefined,
        out: typeof args.out === 'string' ? args.out : undefined,
      });
      break;

    case 'play':
      await play(args._[1]);
      break;

    case 'analyze':
      await analyze(args._[1], {
        a4: args.a4 ? Number(args.a4) : DEFAULT_A4,
        tolerance: args.tolerance ? Number(args.tolerance) : DEFAULT_TOLERANCE,
        color: !args['no-color'],
        chart: args.chart === 'dots' ? 'dots' : 'line',
        minNote: typeof args['min-note'] === 'string' ? args['min-note'] : undefined,
        maxNote: typeof args['max-note'] === 'string' ? args['max-note'] : undefined,
      });
      break;

    case 'live':
      await live({
        device: typeof args.device === 'string' ? args.device : undefined,
        a4: args.a4 ? Number(args.a4) : DEFAULT_A4,
        tolerance: args.tolerance ? Number(args.tolerance) : DEFAULT_TOLERANCE,
        color: !args['no-color'],
        chart: args.chart === 'dots' ? 'dots' : 'line',
        window: args.window ? Number(args.window) : undefined,
        minNote: typeof args['min-note'] === 'string' ? args['min-note'] : undefined,
        maxNote: typeof args['max-note'] === 'string' ? args['max-note'] : undefined,
      });
      break;

    default:
      console.log(HELP);
      if (cmd && cmd !== 'help') process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(`Error: ${err.message}`);
  process.exitCode = 1;
});
