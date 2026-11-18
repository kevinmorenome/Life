import { describe, expect, it } from 'vitest';
import { itemsSubtotal, pairReceipts, parseNumber, parseReceiptText } from './receiptPdf';

// Made-up copy of the layout `pdftotext -layout` gives for a Wolt "Potvrda narudžbe" (U+200E marks included).
const CONFIRMATION = `Potvrda narudžbe #1794748881484

Podaci o narudžbi

Kupac                                                                                      Ime Prezime

ID narudžbe                                                               6af9a9b420634dcbcf416c41

Objekt                                                                                             Tian Tan

Vrsta narudžbe                                                                                     Dostava

Vrijeme dostave                                                                        15.11.2026 14:21

Način plaćanja

Revolut Pay                                                                                          ‎28,20




Stavka                                       % PDV-a       Količina     Bruto jedinična cijena       Cijena

Kiselo - ljuta juha s piletinom                   13%             1                        ‎3,30      ‎3,30

Juha od povrća                                    13%             1                        2,90      2,90

Pohana piletina u slatko - kiselom
                                                  13%             2                       11,00     22,00
umaku

Ukupno u EUR (uklj. PDV)                                                                             ‎28,20

Detalji prodavača: Songjiang D.o.o.
`;

const INVOICE = `Račun 60298/1/23

Podaci o narudžbi

ID narudžbe                                                            6af9a9b420634dcbcf416c41

Vrsta narudžbe                                                                                 Dostava

Vrijeme dostave                                                                    15.11.2026 14:21

Način plaćanja

Revolut Pay                                                                                       1,97

Stavka                                      % PDV-a        Količina   Bruto jedinična cijena    Cijena

Dostava                                            25%           1                     0,00      0,00

Naknada za uslugu                                                                                 1,97

   Naknada za uslugu                               25%           1                     2,82      2,82

   Popust na naknadu za uslugu Wolt+               25%           1                    -0,85     -0,85

Ukupno u EUR (uklj. PDV)                                                                          1,97
`;

describe('parseNumber', () => {
  it('reads decimal commas, thousands dots, negatives and invisible marks', () => {
    expect(parseNumber('‎11,00')).toBe(11);
    expect(parseNumber('-0,85')).toBe(-0.85);
    expect(parseNumber('1.234,50')).toBe(1234.5);
    expect(parseNumber('abc')).toBeUndefined();
  });
});

describe('parseReceiptText', () => {
  it('reads the order fields and every item, joining a wrapped name', () => {
    const r = parseReceiptText(CONFIRMATION);
    expect(r).toMatchObject({ kind: 'confirmation', orderId: '6af9a9b420634dcbcf416c41', venue: 'Tian Tan', orderType: 'Dostava', date: '2026-11-15', time: '14:21', paymentMethod: 'Revolut Pay', total: 28.2 });
    expect(r.items).toEqual([
      { name: 'Kiselo - ljuta juha s piletinom', vat: 13, qty: 1, unitPrice: 3.3, linePrice: 3.3 },
      { name: 'Juha od povrća', vat: 13, qty: 1, unitPrice: 2.9, linePrice: 2.9 },
      { name: 'Pohana piletina u slatko - kiselom umaku', vat: 13, qty: 2, unitPrice: 11, linePrice: 22 },
    ]);
    expect(itemsSubtotal(r.items)).toBe(28.2);
  });
  it('recognises the fee invoice and its number', () => {
    const r = parseReceiptText(INVOICE);
    expect(r).toMatchObject({ kind: 'invoice', invoiceNo: '60298/1/23', orderId: '6af9a9b420634dcbcf416c41', total: 1.97 });
  });
});

describe('pairReceipts', () => {
  it('finds each PDF by title, in any order', () => {
    const p = pairReceipts([INVOICE, CONFIRMATION]);
    expect(p.confirmation?.items).toHaveLength(3);
    expect(p.invoice?.total).toBe(1.97);
    // items + fees = the order total the app stores
    expect((p.confirmation!.total ?? 0) + (p.invoice!.total ?? 0)).toBeCloseTo(30.17, 2);
  });
});

describe('groupItems', () => {
  const row = (name: string, linePrice = 0) => ({ name, linePrice });
  it('reads options as part of the dish before them and fees apart', async () => {
    const { groupItems, optionChoice } = await import('./receiptPdf');
    const g = groupItems([
      row('Želiš li pribor za jelo?: Ne, hvala!'),
      row('Moj Wok', 8),
      row('Odaberi bazu: Široki rezanci'),
      row('Odaberi protein: Piletina', 2),
      row('Naknada za pakiranje', 0.5),
      row('Juha'),
    ]);
    expect(g.map((x) => [x.index, x.kind, x.options.length])).toEqual([[0, 'dish', 0], [1, 'dish', 2], [4, 'fee', 0], [5, 'dish', 0]]);
    expect(optionChoice('Odaberi bazu: Široki rezanci')).toBe('Široki rezanci');
    expect(optionChoice('Želite li pribor za jelo?: Ne, hvala!')).toBeUndefined();
    expect(optionChoice('Želiš li salvetu?: Da')).toBeUndefined();
    expect(optionChoice('Odaberi umak: Ne, hvala!')).toBeUndefined();
    expect(optionChoice('Odaberi dodatak: Bez dodatka')).toBeUndefined();
  });
  it('never turns the first row into an option', async () => {
    const { groupItems } = await import('./receiptPdf');
    expect(groupItems([{ name: 'Menu: Burger' }]).map((x) => x.kind)).toEqual(['dish']);
  });
});

describe('page breaks inside the item table', () => {
  it('keeps the rows on both sides of a form feed apart', () => {
    const text = `Potvrda narudžbe #1

Objekt                       Moj Wok bar

Stavka                       % PDV-a   Količina   Bruto jedinična cijena   Cijena

   Odaberi protein: Piletina                 13%          1                     2,00      2,00
\f   Odaberi posip: Indijski oraščići                 13%             1                      0,00     0,00

Ukupno u EUR (uklj. PDV)                                                                            2,00
`;
    const r = parseReceiptText(text);
    expect(r.items.map((i) => [i.name, i.linePrice])).toEqual([['Odaberi protein: Piletina', 2], ['Odaberi posip: Indijski oraščići', 0]]);
  });
});

describe('group orders', () => {
  const PAYMENT = `Potvrda plaćanja #2

Objekt                       Thai Thai street food

ID narudžbe                  6a9959c85fb437180bdd06c8

Moj komentar                 Group Order

Način plaćanja

Apple Pay                    12,06

Stavka                       Količina      Bruto jedinična cijena    Cijena

Hot thai pržena piletina                                       11,00

   Hot thai pržena piletina        1                      11,00     11,00

Naknada za pakiranje                     1               0,50      0,50

Ukupno u EUR                                                    12,64
`;
  it('reads another person’s payment as a payment, not as Wolt’s fees', () => {
    const r = parseReceiptText(PAYMENT);
    expect(r).toMatchObject({ kind: 'payment', comment: 'Group Order', paymentMethod: 'Apple Pay', total: 12.64 });
    expect(r.items.map((i) => [i.name, i.qty, i.linePrice])).toEqual([['Hot thai pržena piletina', 1, 11], ['Naknada za pakiranje', 1, 0.5]]);
    const p = pairReceipts([PAYMENT, CONFIRMATION, INVOICE]);
    expect(p.payments).toHaveLength(1);
    expect(p.invoice?.total).toBe(1.97);
  });
});
