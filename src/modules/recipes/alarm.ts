/**
 * The cooking alarm as a small WAV file made in code (no download): three rising beeps, then quiet, about 1.6 s, meant
 * to loop. It is played through an `<audio>` element rather than Web Audio because iPhone mutes Web Audio when the
 * ring / silent switch is on, but plays media.
 */
export function alarmWav(sampleRate = 22050): Uint8Array {
  const seconds = 1.6;
  const n = Math.round(sampleRate * seconds);
  const pcm = new Int16Array(n);
  const beeps: [number, number][] = [
    [0, 880],
    [0.22, 1046.5],
    [0.44, 1318.5],
  ];
  for (const [at, freq] of beeps) {
    const start = Math.round(at * sampleRate);
    const len = Math.round(0.16 * sampleRate);
    for (let i = 0; i < len && start + i < n; i++) {
      const t = i / sampleRate;
      // Quick fade in and out so the beeps don't click.
      const env = Math.min(1, i / (0.01 * sampleRate), (len - i) / (0.02 * sampleRate));
      pcm[start + i] = Math.round(Math.sin(2 * Math.PI * freq * t) * env * 0.6 * 32767);
    }
  }
  const data = new Uint8Array(pcm.buffer);
  const out = new Uint8Array(44 + data.length);
  const view = new DataView(out.buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + data.length, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // bytes per second
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, data.length, true);
  out.set(data, 44);
  return out;
}

/** The alarm as a data URL, for `<audio src>`. */
export function alarmUrl(): string {
  let bin = '';
  for (const b of alarmWav()) bin += String.fromCharCode(b);
  return `data:audio/wav;base64,${btoa(bin)}`;
}
