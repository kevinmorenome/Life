import { describe, expect, it } from 'vitest';
import { isFlatPhoto } from './productPhoto';

describe('isFlatPhoto', () => {
  it('is true for a JPEG packshot and false for a cut-out or nothing', () => {
    expect(isFlatPhoto('data:image/jpeg;base64,AAAA')).toBe(true);
    expect(isFlatPhoto('data:image/webp;base64,AAAA')).toBe(false);
    expect(isFlatPhoto('data:image/png;base64,AAAA')).toBe(false);
    expect(isFlatPhoto(undefined)).toBe(false);
    expect(isFlatPhoto('')).toBe(false);
  });
});
