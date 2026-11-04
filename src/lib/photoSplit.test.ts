import { describe, expect, it } from 'vitest';
import { joinPhoto, splitPhoto } from './photoSplit';

const img = 'data:image/webp;base64,AAAA';

describe('splitPhoto', () => {
  it('moves a photo out of the record and flags it', () => {
    const { local, action } = splitPhoto({ id: 'a', photo: img });
    expect(local).toEqual({ id: 'a', hasPhoto: true });
    expect(action).toEqual({ kind: 'set', data: img });
  });
  it('keeps the stored picture when a record read from the store is saved again', () => {
    const { local, action } = splitPhoto({ id: 'a', hasPhoto: true });
    expect(local).toEqual({ id: 'a', hasPhoto: true });
    expect(action.kind).toBe('keep');
  });
  it('removes the picture when hasPhoto is cleared or never set', () => {
    const { local, action } = splitPhoto({ id: 'a', hasPhoto: false });
    expect(local).toEqual({ id: 'a' });
    expect(action.kind).toBe('remove');
    expect(splitPhoto({ id: 'b', hasPhoto: undefined }).action.kind).toBe('remove');
  });
  it('a new photo wins over an old flag', () => {
    expect(splitPhoto({ id: 'a', hasPhoto: true, photo: img }).action).toEqual({ kind: 'set', data: img });
  });
});

describe('joinPhoto', () => {
  it('puts the image back and drops the local flag', () => {
    expect(joinPhoto({ id: 'a', hasPhoto: true }, img)).toEqual({ id: 'a', photo: img });
    expect(joinPhoto({ id: 'a', hasPhoto: true }, undefined)).toEqual({ id: 'a' });
  });
});
