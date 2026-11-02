import { describe, expect, it } from 'vitest';
import { iconKind } from './foodIcons';

describe('iconKind', () => {
  it.each([
    ['Staropramen beer 6-pack', 'drink', 'pc', 'can'],
    ['Somersby lime cider 0.5 L', 'drink', 'pc', 'can'],
    ['Chicken breast fillet', 'fresh', 'kg', 'chicken'],
    ['Cucumber', 'fresh', 'kg', 'cucumber'],
    ['Carrots', 'fresh', 'pc', 'carrot'],
    ['Paprika mix', 'fresh', 'pc', 'pepper'],
    ['Smoked paprika', 'staple', 'pc', 'spice'],
    ['Italian-style hummus 200 g', 'staple', 'pc', 'jar'],
    ['Tortellini with prosciutto 500 g', 'staple', 'pc', 'pasta'],
    ['Oat drink 3.5%', 'staple', 'pc', 'milk'],
    ["Lay's salted chips", 'snack', 'pc', 'chips'],
    ['Crispy coated peanuts', 'snack', 'pc', 'nuts'],
    ['Peanut butter', 'staple', 'pc', 'jar'],
    ['Olive oil', 'staple', 'pc', 'oil'],
    ['Pivo Ožujsko', 'drink', 'pc', 'can'],
    ['Krastavac', 'fresh', 'kg', 'cucumber'],
  ] as const)('%s → %s', (name, type, unit, kind) => {
    expect(iconKind(name, type, unit)).toBe(kind);
  });

  it('falls back on the type, then a plain box', () => {
    expect(iconKind('Mystery 7', 'drink', 'pc')).toBe('can');
    expect(iconKind('Mystery 7', 'snack', 'pc')).toBe('chips');
    expect(iconKind('Mystery 7', 'fresh', 'kg')).toBe('cucumber');
    expect(iconKind('Mystery 7', 'staple', 'pc')).toBe('box');
  });
});
