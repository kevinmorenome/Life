import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { comparePrices, offerShare, priceUnit } from './prices';
import { productRecord } from './productEdits';
import { averageUnitPrice, defaultStorage, perUnit, pluralize, pricePerItem, type ProductSummary } from './products';
import { PRODUCT_TYPES, PRODUCT_TYPE_LABELS, STORAGES, STORAGE_LABELS, type FoodProduct, type ProductType, type Storage } from './types';

/**
 * What is known about a product beyond its stock: how it is tracked (type, place, pack, shelf life), what it costs
 * where, and the receipts it was on. The lower part of the product page, and the section that opens and closes at
 * the bottom of the stock sheet.
 */
export function ProductInfo({ product, record, onSave }: { product: ProductSummary; record?: FoodProduct; onSave(p: FoodProduct): Promise<void> | void }) {
  const comparison = comparePrices(product, today());
  const offers = offerShare(product);
  const [days, setDays] = useState(product.shelfLifeDays ? String(product.shelfLifeDays) : '');
  const [pack, setPack] = useState(product.packSize ? String(product.packSize) : '');
  const [label, setLabel] = useState(product.packLabel ?? '');

  // Spread the record first so fields this screen doesn't show survive; create it on the first change.
  const save = (patch: Partial<FoodProduct>) => onSave(productRecord(product, record, patch, new Date().toISOString()));
  const setType = (type: ProductType) => save({ type, ...(product.custom ? {} : { storage: defaultStorage(type, product.kind) }) });
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
      <h2 className="small muted food-h2">How it is tracked</h2>
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

      <h2 className="small muted food-h2">Purchases</h2>
      <p className="muted small">
        Bought {product.purchases.length}× · average {money(averageUnitPrice(product))}
        {product.packSize ? ' per pack' : perUnit(product.unit)}
        {product.packSize && ` · ${money(pricePerItem(averageUnitPrice(product), product.packSize))} per ${product.packLabel || 'item'}`}
      </p>
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
