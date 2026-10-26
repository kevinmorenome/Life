import { describe, expect, it } from 'vitest';
import {
  brandLabel,
  convertItem,
  convertOutfit,
  detailsToItem,
  mapSeasons,
  occasionLabels,
  splitWears,
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
      ['SWIMMING-TRUNKS', 'swimwear'],
      ['BIKINI-TOP', 'swimwear'],
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

  it('has a readable label to use as the sub-category', () => {
    expect(mapCategory('POLO-SHIRT')).toBe('tops');
    expect(typeLabel('POLO-SHIRT')).toBe('polo shirt');
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

  it('keeps only the known last-worn date and counts the rest as undated', () => {
    expect(splitWears(5, '2026-07-20T10:00:00.000Z')).toEqual({ wears: ['2026-07-20'], priorWears: 4 });
    expect(splitWears(1, '2026-07-20T10:00:00.000Z')).toEqual({ wears: ['2026-07-20'], priorWears: undefined });
    expect(splitWears(3, null)).toEqual({ wears: [], priorWears: 3 });
    expect(splitWears(0, null)).toEqual({ wears: [], priorWears: undefined });
  });

  it('maps seasons and strips season words from occasions', () => {
    expect(mapSeasons(['autumn', 'winter'])).toEqual(['fall', 'winter']);
    expect(mapSeasons(['all_year_round'])).toEqual(['spring', 'summer', 'fall', 'winter']);
    expect(occasionLabels(['casual', 'everyday-errands', 'summer', 'wfh'])).toEqual(['casual', 'everyday errands', 'wfh']);
    expect(occasionLabels(['spring'])).toBeUndefined();
  });

  it('enriches an item with details', () => {
    const uuid = 'c1b1e71b-2489-4740-a731-0dc07545d206';
    const item = convertItem(
      { category: 'JEANS', tags: ['PLAIN'], timesWorn: 21, imageUrls: [url(uuid)] },
      0,
      {
        createdAt: 'fallback',
        updatedAt: '2026-10-25T00:00:00.000Z',
        details: {
          itemId: 'w1',
          imageUrl: url(uuid),
          type: 'jeans',
          price: 9.99,
          dateAdded: '2024-02-18T20:05:46.894Z',
          lastWorn: '2024-01-29T11:00:00.000Z',
          wornCount: 21,
          seasons: ['summer'],
          occasions: ['casual', 'spring'],
          fabric: ['cotton', 'elastane'],
          tags: ['medium-wash', 'plain'],
        },
      },
    );
    expect(item).toMatchObject({
      price: 9.99,
      seasons: ['summer'],
      occasions: ['casual'],
      material: 'Cotton, Elastane',
      tags: ['plain', 'medium wash'],
      wears: ['2024-01-29'],
      priorWears: 20,
      createdAt: '2024-02-18T20:05:46.894Z',
      updatedAt: '2026-10-25T00:00:00.000Z',
      status: 'active',
    });
  });

  it('ignores a date added in the future', () => {
    const item = convertItem({ category: 'JUMPER' }, 0, {
      createdAt: 'fallback',
      updatedAt: '2026-10-25T00:00:00.000Z',
      details: {
        itemId: 'x',
        imageUrl: 'u',
        type: 'jumper',
        dateAdded: '2026-11-17T23:00:00.000Z',
        createdAt: '2026-01-15T23:47:04.436Z',
      },
    });
    expect(item.createdAt).toBe('2026-01-15T23:47:04.436Z');
  });

  it('imports archived pieces from details alone, kept out of the active closet', () => {
    const d = {
      itemId: 'a1',
      imageUrl: url('4e581855-0d42-481f-ab77-fd23b7b52e35'),
      archived: true,
      brand: 'Zara',
      type: 'leather-sneakers',
      colors: ['White'],
      size: ['men EU EU 39'],
      wornCount: 0,
    };
    const item = convertItem(detailsToItem(d), 0, { createdAt: 'x', details: d });
    expect(item).toMatchObject({
      id: 'whering-4e581855-0d42-481f-ab77-fd23b7b52e35',
      name: 'White leather sneakers',
      category: 'shoes',
      brand: 'Zara',
      size: "Men's EU 39",
      status: 'storage',
    });
  });

  it('converts outfits, mapping piece ids and dropping unknown pieces', () => {
    const ids = new Map([['p1', 'whering-a'], ['p2', 'whering-b']]);
    const outfit = convertOutfit(
      {
        outfitId: 'o1',
        name: null,
        pieceIds: ['p1', 'p2', 'gone'],
        wornCount: 2,
        lastWorn: '2026-07-20T10:00:00.000Z',
        occasions: ['Dating', 'Winter'],
        styles: ['Casual'],
        createdAt: '2026-07-20T07:53:54.844Z',
      },
      (id) => ids.get(id),
      { now: 'now' },
    );
    expect(outfit).toEqual({
      id: 'whering-outfit-o1',
      name: undefined,
      itemIds: ['whering-a', 'whering-b'],
      tags: ['dating', 'casual'],
      wears: ['2026-07-20'],
      priorWears: 1,
      createdAt: '2026-07-20T07:53:54.844Z',
      updatedAt: 'now',
    });
  });
});
