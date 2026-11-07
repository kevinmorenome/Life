import { describe, expect, it } from 'vitest';
import { formatSize, imageChars, sizeReport, summarizeLongTasks } from './perf';

describe('perf helpers', () => {
  it('counts only data URLs as image weight, at any depth', () => {
    const img = 'data:image/webp;base64,' + 'A'.repeat(100);
    expect(imageChars({ name: 'x', photo: img, nested: [{ p: img }] })).toBe(img.length * 2);
    expect(imageChars({ note: 'hello' })).toBe(0);
  });

  it('reports records, size and the biggest record', () => {
    const img = 'data:image/png;base64,' + 'B'.repeat(500);
    const r = sizeReport([{ id: 'a', photo: img }, { id: 'b' }]);
    expect(r.records).toBe(2);
    expect(r.imageChars).toBe(img.length);
    expect(r.maxChars).toBeGreaterThan(500);
    expect(r.chars).toBeGreaterThan(r.maxChars);
  });

  it('formats sizes', () => {
    expect(formatSize(10)).toBe('10 B');
    expect(formatSize(2048)).toBe('2 KB');
    expect(formatSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('summarizes long tasks, worst first', () => {
    const s = summarizeLongTasks([
      { ms: 60, at: 1, route: '#/a' },
      { ms: 300, at: 2, route: '#/b' },
      { ms: 90, at: 3, route: '#/a' },
    ]);
    expect(s.count).toBe(3);
    expect(s.totalMs).toBe(450);
    expect(s.worstMs).toBe(300);
    expect(s.worst[0].route).toBe('#/b');
  });
});
