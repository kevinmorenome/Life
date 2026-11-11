import { describe, expect, it } from 'vitest';
import { alarmUrl, alarmWav } from './alarm';

describe('alarmWav', () => {
  it('is a valid mono 16-bit WAV of about 1.6 s with sound in it', () => {
    const w = alarmWav(8000);
    const v = new DataView(w.buffer);
    const tag = (at: number) => String.fromCharCode(...w.slice(at, at + 4));
    expect(tag(0)).toBe('RIFF');
    expect(tag(8)).toBe('WAVE');
    expect(tag(36)).toBe('data');
    expect(v.getUint16(22, true)).toBe(1);
    expect(v.getUint32(24, true)).toBe(8000);
    expect(v.getUint32(40, true)).toBe(8000 * 1.6 * 2);
    expect(v.getUint32(4, true)).toBe(w.length - 8);
    let loud = 0;
    for (let i = 44; i < w.length; i += 2) loud = Math.max(loud, Math.abs(v.getInt16(i, true)));
    expect(loud).toBeGreaterThan(10000);
  });
  it('makes a data URL', () => {
    expect(alarmUrl().startsWith('data:audio/wav;base64,UklGR')).toBe(true);
  });
});
