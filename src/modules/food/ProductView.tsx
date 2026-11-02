import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { BatchList, type BatchAct } from './BatchList';
import { PictureControl } from './PictureControl';
import { comparePrices, offerShare, priceUnit } from './prices';
import { productRecord } from './productEdits';
import { averageUnitPrice, defaultStorage, perUnit, pluralize, pricePerItem, unitLabel, type ProductSummary } from './products';
import { formatAmount, formatQty, levelOptions, stockOf, usesSince } from './stock';
import { partLeftEvent, stockEvent } from './stockActions';

import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, STORAGES, type FoodProduct, type ProductType, type StockEvent, type Storage } from './types';

const STORAGE_LABELS = { fridge: 'Fridge', pantry: 'Pantry', freezer: 'Freezer' } as const;

/** One product: how it is tracked, and every time you bought it. */
const EVENT_TEXT = { use: 'Used', toss: 'Threw out', count: 'Counted', expiry: 'Use by', freeze: 'Froze', thaw: 'Took out' } as const;

export function ProductView({
  product,
  record,
  events,
  onSave,
  onEvent,
}: {
  product: ProductSummary;
  record?: FoodProduct;
  events: StockEvent[];
  onSave(p: FoodProduct): Promise<void>;
  onEvent(e: StockEvent): Promise<void>;
}) {
  const stock = stockOf(product, product.purchases, events, today());
  const uses = stock.tracked ? 0 : usesSince(events, product.purchases[0]?.date);
  const ask = (question: string, fallback: string): number | undefined => {
    const n = Number((window.prompt(question, fallback) ?? '').trim().replace(',', '.'));
    return Number.isFinite(n) && n >= 0 && n < 10_000 ? n : undefined;
  };
  const [note, setNote] = useState<BatchAct | null>(null);
  const comparison = comparePrices(product, today());
  const offers = offerShare(product);
  const [days, setDays] = useState(product.shelfLifeDays ? String(product.shelfLifeDays) : '');
  const [pack, setPack] = useState(product.packSize ? String(product.packSize) : '');
  const [label, setLabel] = useState(product.packLabel ?? '');

  // Spread the record first so fields this screen doesn't show survive; create it on the first change.
  const save = (patch: Partial<FoodProduct>) => onSave(productRecord(product, record, patch, new Date().toISOString()));
  const setType = (type: ProductType) => save({ type, ...(product.custom ? {} : { storage: defaultStorage(type) }) });
  const commitPack = () => {
    const n = Number(pack.replace(',', '.'));
    const packSize = pack.trim() && Number.isFinite(n) && n >= 2 && n <= 100 ? Math.round(n) : undefined;
    setPack(packSize ? String(packSize) : '');
    if (packSize !== product.packSize) save({ packSize });
  };
  const commitLabel = () => {
    const packLabel = label.trim().slice(0, 20) || undefined;
    setLabel(packLabel ?? '');
    if (packLabel !== product.packLabel) save({ packLabel });
  };
  const commitDays = () => {
    const n = Number(days.replace(',', '.'));
    const shelfLifeDays = days.trim() && Number.isFinite(n) && n >= 1 ? Math.round(n) : undefined;
    if (shelfLifeDays !== product.shelfLifeDays) save({ shelfLifeDays });
  };

  return (
    <>
      <PictureControl product={product} className="food-art-hero" size={72} onPhoto={(photo) => save({ photo: photo ?? undefined })} />
      <h1 className="page-title">{product.name}</h1>
      <p className="muted small">
        Bought {product.purchases.length}× · average {money(averageUnitPrice(product))}
        {product.packSize ? ' per pack' : perUnit(product.unit)}
        {product.packSize && ` · ${money(pricePerItem(averageUnitPrice(product), product.packSize))} per ${product.packLabel || 'item'}`}
      </p>

      <section className="food-gap">
        <p className="food-total">
          {stock.tracked ? formatAmount(stock.quantity, product.unit) : stock.quantity > 0 ? 'Have it' : 'Out'}
          {stock.tracked && <span className="muted small">{unitLabel(product, stock.quantity) || ' in stock'}</span>}
        </p>
        <p className="muted small">{[stock.status === 'ok' ? '' : stock.status.replace('-', ' '), stock.useBy ? `use by ${shortDate(stock.useBy)}` : '', !stock.tracked && uses > 0 ? `used ${uses}× since you bought it` : ''].filter(Boolean).join(' · ')}</p>
        <div className="chips food-gap">
          {stock.tracked ? (
            <>
              <button
                type="button"
                className="chip"
                onClick={() => {
                  const n = ask(`How much ${product.name} did you use?`, '1');
                  if (n) onEvent(stockEvent(product.id, 'use', n, 'app'));
                }}
              >
                Used some
              </button>
              {levelOptions(stock.quantity, product.unit, product.packSize).map((l) => (
                <button
                  key={l.fraction}
                  type="button"
                  className="chip"
                  onClick={() => {
                    const e = partLeftEvent(product.id, product.unit, stock, l.fraction, 'app');
                    if (e) onEvent(e);
                  }}
                >
                  {l.label}
                </button>
              ))}
            </>
          ) : (
            <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'use', 1, 'app'))}>
              Used it
            </button>
          )}
          <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'count', 0, 'app'))}>
            Finished
          </button>
          <button type="button" className="chip" disabled={stock.quantity <= 0} onClick={() => onEvent(stockEvent(product.id, 'toss', stock.quantity, 'app'))}>
            Threw out
          </button>
          {stock.tracked ? (
            <button
              type="button"
              className="chip"
              onClick={() => {
                const n = ask(`How many ${product.name} do you have now?`, formatQty(stock.quantity));
                if (n !== undefined) onEvent(stockEvent(product.id, 'count', n, 'app'));
              }}
            >
              I have…
            </button>
          ) : (
            <button type="button" className="chip" onClick={() => onEvent(stockEvent(product.id, 'count', 1, 'app'))}>
              Have it
            </button>
          )}
        </div>
      </section>

      {stock.tracked && stock.batches.length > 0 && (
        <>
          <h2 className="small muted food-h2">Batches</h2>
          <BatchList
            product={product}
            stock={stock}
            onAct={(a) => {
              onEvent(a.event);
              setNote(a);
            }}
          />
          {note && (
            <p className="muted small food-batch-note" role="status">
              {note.text}
              {note.undo && (
                <button
                  type="button"
                  className="chip"
                  onClick={() => {
                    for (const e of [note.undo!].flat()) onEvent(e);
                    setNote(null);
                  }}
                >
                  Undo
                </button>
              )}
            </p>
          )}
        </>
      )}

      <div className="form">
      <div className="field">
        <span>Type</span>
        <div className="chips">
          {PRODUCT_TYPES.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={product.type === t} onClick={() => setType(t)}>
              {PRODUCT_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Kept in</span>
        <div className="chips">
          {STORAGES.map((s: Storage) => (
            <button key={s} type="button" className="chip" aria-pressed={product.storage === s} onClick={() => save({ storage: s })}>
              {STORAGE_LABELS[s]}
            </button>
          ))}
        </div>
      </div>
      <div className="field">
        <span>Stock</span>
        <div className="chips">
          <button type="button" className="chip" aria-pressed={product.trackAmount} onClick={() => save({ trackAmount: undefined })}>
            Count how many
          </button>
          <button type="button" className="chip" aria-pressed={!product.trackAmount} onClick={() => save({ trackAmount: false })}>
            Just have it or out
          </button>
        </div>
        <span className="muted small">For spices, oil and sauces: a use is logged but never lowers it; tap Finished when it is all gone.</span>
      </div>
      {product.unit === 'pc' && product.trackAmount && (
        <div className="field-grid">
          <label className="field">
            <span>Items in a pack</span>
            <input inputMode="numeric" value={pack} onChange={(e) => setPack(e.target.value)} onBlur={commitPack} placeholder="e.g. 6" />
          </label>
          <label className="field">
            <span>One item is a</span>
            <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commitLabel} placeholder="e.g. can" />
          </label>
        </div>
      )}
      <label className="field">
        <span>Keeps for (days, optional)</span>
        <input inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} onBlur={commitDays} placeholder="e.g. 3" />
      </label>
      </div>

      {comparison && (
        <>
          <h2 className="small muted food-h2">Prices</h2>
          {comparison.cheaper && (
            <p className="food-saving">
              {comparison.cheaper.store} was {money(comparison.saving!)}{priceUnit(product)} cheaper ({Math.round(comparison.savingPct! * 100)}%) than {comparison.usual.store}, where you bought it last.
            </p>
          )}
          <ul className="game-list">
            {comparison.prices.map((p, i) => (
              <li key={p.store} className="game-line">
                <span>
                  {p.store}
                  {i === 0 && comparison.prices.length > 1 && <span className="muted small"> · cheapest</span>}
                </span>
                <span>
                  {money(p.regular)}{priceUnit(product)}
                  <span className="muted small">{[p.onOffer ? `paid ${money(p.paid)} on offer` : '', `${shortDate(p.date)}`, p.purchases > 1 ? `lowest ${money(p.lowestRegular)}` : ''].filter(Boolean).map((t) => ` · ${t}`).join('')}</span>
                </span>
              </li>
            ))}
          </ul>
          {offers.offers > 0 && (
            <p className="muted small">
              On offer {offers.offers} of {offers.of} times, saving {money(offers.saved)} in all. Prices compared are shelf prices, without offers.
            </p>
          )}
        </>
      )}

      {events.length > 0 && (
        <>
          <h2 className="small muted food-h2">Activity</h2>
          <ul className="game-list">
            {[...events]
              .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
              .slice(0, 8)
              .map((e) => (
                <li key={e.id} className="game-line">
                  {EVENT_TEXT[e.type]} {e.type === 'expiry' ? shortDate(e.useBy ?? e.date) : e.type === 'count' && e.quantity === 0 ? '→ finished' : !product.trackAmount && e.type !== 'count' ? '' : `${formatAmount(e.quantity, product.unit)}${unitLabel(product, e.quantity)}`}
                  <span className="muted small">{[shortDate(e.date), e.source === 'claude' ? 'via Claude' : e.source === 'check' ? 'weekly check' : ''].filter(Boolean).join(' · ')}</span>
                </li>
              ))}
          </ul>
        </>
      )}

      <h2 className="small muted food-h2">Purchases</h2>
      <ul className="game-list">
        {product.purchases.map((x, i) => (
          <li key={i}>
            <a className="game-row" href={href(`/food/receipt/${x.receiptId}`)}>
              <strong>
                {x.quantity}
                {x.unit !== 'pc' ? ` ${x.unit} ×` : product.packSize ? ` ${pluralize('pack', x.quantity)} of ${product.packSize} ×` : ' ×'} {money(x.unitPrice)} = {money(x.paid)}
              </strong>
              <span className="muted small">{[shortDate(x.date), x.store].join(' · ')}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}
