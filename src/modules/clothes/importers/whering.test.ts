import { describe, expect, it } from 'vitest';
import {
  brandLabel,
  convertItem,
  exportCurrency,
  mapCategory,
  sizeLabel,
  tagLabels,
  typeLabel,
  wheringId,
} from './whering';

const url = (uuid: string) =>
  `https://storage.googleapis.com/download/storage/v1/b/whering.appspot.com/o/nobg_images%2F${uuid}.png?generation=1&alt=media`;

describe('whering import', () => {
  it('maps categories', () => {
    const cases: [string, string][] = [
      ['SHORT-SLEEVED-TSHIRT', 'tops'],
      ['CABLEKNIT', 'tops'],
      ['TURTLENECK', 'tops'],
      ['PUFFERJACKET', 'outerwear'],
      ['BLAZER', 'outerwear'],
      ['STRAIGHT-LEG-JEANS', 'bottoms'],
      ['TROUSER-PANTS', 'bottoms'],
      ['PYJAMA-BOTTOMS', 'sleepwear'],
      ['RUNNING-SHORTS', 'activewear'],
      ['TRUNKS', 'underwear'],
      ['HIGH-SOCKS', 'underwear'],
      ['CANVAS-SNEAKERS', 'shoes'],
      ['ANKLE-BOOTS', 'shoes'],
      ['CROSSOVER-BAG', 'accessories'],
      ['BEANIE', 'accessories'],
      ['CAP', 'accessories'],
      ['OTHER-OTHER', 'other'],
    ];
    for (const [w, ours] of cases) expect([w, mapCategory(w)]).toEqual([w, ours]);
  });

  it('humanizes labels', () => {
    expect(typeLabel('SHORT-SLEEVED-TSHIRT')).toBe('short-sleeved T-shirt');
    expect(typeLabel('GRAPHIC-SHORT-SLEEVED-TSHIRT')).toBe('graphic short-sleeved T-shirt');
    expect(typeLabel('PUFFERJACKET')).toBe('puffer jacket');
    expect(typeLabel('STRAIGHT-LEG-JEANS')).toBe('straight-leg jeans');
    expect(typeLabel('TROUSER-PANTS')).toBe('trousers');
    expect(typeLabel('OTHER-UNDERWEAR')).toBe('underwear');
    expect(brandLabel('PULL & BEAR')).toBe('Pull & Bear');
    expect(brandLabel('H&M')).toBe('H&M');
    expect(brandLabel('DR. FRANKLIN')).toBe('Dr. Franklin');
    expect(sizeLabel("MEN'S S")).toBe("Men's S");
    expect(sizeLabel('MEN\'S EU 38')).toBe("Men's EU 38");
    expect(sizeLabel("MEN'S")).toBeUndefined();
    expect(sizeLabel("MEN'S OTHER")).toBeUndefined();
    expect(tagLabels(['STRAIGHT-SLEEVE', 'STRAIGHT SLEEVE', 'CASUAL'])).toEqual(['straight sleeve', 'casual']);
  });

  it('uses the photo uuid as a stable id', () => {
    const uuid = 'c1b1e71b-2489-4740-a731-0dc07545d206';
    expect(wheringId({ category: 'TSHIRT', imageUrls: [url(uuid)] }, 3)).toBe(`whering-${uuid}`);
    expect(wheringId({ category: 'TSHIRT' }, 3)).toBe('whering-3');
  });

  it('converts a full item', () => {
    const item = convertItem(
      {
        category: 'SHORT-SLEEVED-SHIRT',
        brand: 'ZARA',
        colors: ['BLUE', 'NAVY'],
        size: "MEN'S S",
        price: 12.999,
        currency: 'GBP',
        tags: ['CASUAL'],
        timesWorn: 2,
        state: 'GIFTED',
        imageUrls: [url('c1b1e71b-2489-4740-a731-0dc07545d206')],
      },
      0,
      { photo: 'data:image/webp;base64,x', createdAt: '2026-10-25T00:00:00.000Z' },
    );
    expect(item).toMatchObject({
      name: 'Blue & navy short-sleeved shirt',
      category: 'tops',
      brand: 'Zara',
      color: 'Blue, Navy',
      size: "Men's S",
      price: 13,
      tags: ['casual'],
      priorWears: 2,
      wears: [],
      notes: 'Gifted',
      status: 'active',
      photo: 'data:image/webp;base64,x',
    });
  });

  it('names many-color items without listing every color', () => {
    const item = convertItem(
      { category: 'TSHIRT', colors: ['BLUE', 'RED', 'YELLOW', 'MULTICOLOR'] },
      0,
      { createdAt: 'x' },
    );
    expect(item.name).toBe('T-shirt');
    expect(item.priorWears).toBeUndefined();
  });

  it('picks the most common currency', () => {
    expect(exportCurrency([{ category: 'a', currency: 'GBP' }, { category: 'b' }])).toBe('GBP');
    expect(exportCurrency([{ category: 'a' }])).toBeUndefined();
  });
});
