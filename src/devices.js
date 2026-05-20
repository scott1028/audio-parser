// List ALSA capture devices by parsing `arecord -l`.

import { execFileSync } from 'node:child_process';

// Returns [{ card, device, name, alsa }], alsa being the plughw selector.
export function listCaptureDevices() {
  let out;
  try {
    out = execFileSync('arecord', ['-l'], { encoding: 'utf8' });
  } catch {
    return [];
  }

  // Lines look like:
  // card 3: ATR4697USB [ATR4697-USB], device 0: USB Audio [USB Audio]
  const re = /^card (\d+): [^[]+\[([^\]]+)\], device (\d+):/gm;
  const devices = [];
  let m;
  while ((m = re.exec(out)) !== null) {
    const card = Number(m[1]);
    const name = m[2].trim();
    const device = Number(m[3]);
    devices.push({ card, device, name, alsa: `plughw:${card},${device}` });
  }
  return devices;
}

// Pick a sensible default device: prefer a dedicated mic (name contains
// "mic" or a known USB mic), otherwise the first capture device.
export function pickDefaultDevice() {
  const devices = listCaptureDevices();
  if (devices.length === 0) return null;
  const preferred = devices.find((d) => /mic|ATR/i.test(d.name));
  return (preferred ?? devices[0]).alsa;
}

export function printDevices() {
  const devices = listCaptureDevices();
  if (devices.length === 0) {
    console.log('No ALSA capture devices found (is `arecord` installed?).');
    return;
  }
  console.log('Capture devices:');
  for (const d of devices) {
    console.log(`  ${d.alsa.padEnd(14)} ${d.name} (card ${d.card}, device ${d.device})`);
  }
  const def = pickDefaultDevice();
  console.log(`\nDefault for recording: ${def}`);
}
