import { describe, expect, it } from 'vitest';
import { fitTiles, OUTFIT_PILL_HEIGHT, PILL_GAP, PILL_HEIGHT, slotsLeft } from './dayTiles';

describe('slotsLeft', () => {
  it('fits five text pills in an empty day', () => {
    expect(slotsLeft(0)).toBe(5);
  });
  it('shrinks as other pills take room', () => {
    expect(slotsLeft(OUTFIT_PILL_HEIGHT + PILL_GAP)).toBe(3);
    expect(slotsLeft(OUTFIT_PILL_HEIGHT + PILL_GAP + 2 * (PILL_HEIGHT + PILL_GAP))).toBe(1);
  });
  it('never goes below zero', () => {
    expect(slotsLeft(500)).toBe(0);
  });
});

describe('fitTiles', () => {
  it('shows everything that fits', () => {
    expect(fitTiles(3, 5)).toEqual({ shown: 3, more: 0 });
    expect(fitTiles(5, 5)).toEqual({ shown: 5, more: 0 });
  });
  it('keeps one slot for the more pill when they do not all fit', () => {
    expect(fitTiles(7, 5)).toEqual({ shown: 4, more: 3 });
    expect(fitTiles(2, 1)).toEqual({ shown: 0, more: 2 });
  });
  it('shows only the more pill when nothing fits', () => {
    expect(fitTiles(3, 0)).toEqual({ shown: 0, more: 3 });
  });
});
