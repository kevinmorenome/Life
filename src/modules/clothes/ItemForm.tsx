import { useState, type FormEvent } from 'react';
import { newId } from '../../lib/db';
import { resizeImage } from '../../lib/image';
import { navigate } from '../../lib/router';
import { PALETTE, itemColors, swatchCss } from './colors';
import {
  CATEGORIES,
  SUBCATEGORIES,
  CONDITIONS,
  SEASONS,
  STATUSES,
  label,
  type Category,
  type ClothingItem,
  type Condition,
  type Season,
  type Status,
} from './types';

interface Props {
  existing?: ClothingItem;
  onSave: (item: ClothingItem) => Promise<void>;
}

export function ItemForm({ existing, onSave }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [category, setCategory] = useState<Category>(existing?.category ?? 'tops');
  const [subcategory, setSubcategory] = useState(existing?.subcategory ?? '');
  const [brand, setBrand] = useState(existing?.brand ?? '');
  const [colors, setColors] = useState<string[]>(existing ? itemColors(existing) : []);
  const [size, setSize] = useState(existing?.size ?? '');
  const [seasons, setSeasons] = useState<Season[]>(existing?.seasons ?? []);
  const [price, setPrice] = useState(existing?.price?.toString() ?? '');
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ?? '');
  const [status, setStatus] = useState<Status>(existing?.status ?? 'active');
  const [condition, setCondition] = useState<Condition | ''>(existing?.condition ?? '');
  const [photo, setPhoto] = useState(existing?.photo);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');

  const toggleSeason = (s: Season) =>
    setSeasons((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const toggleColor = (c: string) =>
    setColors((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]));
  // Names already on the item that the palette doesn't offer (legacy or imported) stay selectable.
  const colorOptions = [...PALETTE, ...colors.filter((c) => !PALETTE.includes(c))];

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      setPhoto(await resizeImage(file));
    } catch {
      setError('Could not read that image.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const parsedPrice = price.trim() === '' ? undefined : Number(price);
    if (parsedPrice != null && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      setError('Price must be a positive number.');
      return;
    }
    const now = new Date().toISOString();
    const item: ClothingItem = {
      // Keep fields this form doesn't edit (tags, priorWears, occasions…).
      ...existing,
      id: existing?.id ?? newId(),
      name: name.trim(),
      category,
      subcategory: subcategory.trim() || undefined,
      brand: brand.trim() || undefined,
      colors: colors.length ? colors : undefined,
      color: colors.length ? colors.join(', ') : undefined,
      size: size.trim() || undefined,
      seasons: SEASONS.filter((s) => seasons.includes(s)),
      price: parsedPrice,
      purchaseDate: purchaseDate || undefined,
      status,
      condition: condition || undefined,
      photo,
      notes: notes.trim() || undefined,
      wears: existing?.wears ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    await onSave(item);
    navigate(`/clothes/${item.id}`);
  }

  return (
    <form className="form" onSubmit={submit}>
      <h1>{existing ? 'Edit item' : 'New item'}</h1>

      <div className="photo-field">
        {photo ? (
          <img className="thumb thumb-large" src={photo} alt="" />
        ) : (
          <div className="thumb thumb-large thumb-empty">📷</div>
        )}
        <div className="photo-actions">
          <label className="btn">
            {photo ? 'Change photo' : 'Add photo'}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onPhoto(e.target.files?.[0])}
            />
          </label>
          {photo && (
            <button type="button" className="btn btn-ghost" onClick={() => setPhoto(undefined)}>
              Remove
            </button>
          )}
        </div>
      </div>

      <label className="field">
        <span>Name *</span>
        <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="White oxford shirt" />
      </label>

      <div className="field-grid">
        <label className="field">
          <span>Category</span>
          <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sub-category</span>
          <input
            list="subcategory-options"
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            placeholder="Polo shirt"
          />
          <datalist id="subcategory-options">
            {SUBCATEGORIES[category].map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Brand</span>
          <input value={brand} onChange={(e) => setBrand(e.target.value)} />
        </label>
        <label className="field">
          <span>Size</span>
          <input value={size} onChange={(e) => setSize(e.target.value)} />
        </label>
        <label className="field">
          <span>Condition</span>
          <select value={condition} onChange={(e) => setCondition(e.target.value as Condition | '')}>
            <option value="">—</option>
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {label(c)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price</span>
          <input
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0.00"
          />
        </label>
        <label className="field">
          <span>Purchased</span>
          <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </label>
      </div>

      <fieldset className="field">
        <legend>Seasons</legend>
        <div className="chips">
          {SEASONS.map((s) => (
            <button
              type="button"
              key={s}
              className="chip"
              aria-pressed={seasons.includes(s)}
              onClick={() => toggleSeason(s)}
            >
              {label(s)}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="field">
        <legend>Colors</legend>
        <div className="chips">
          {colorOptions.map((c) => (
            <button
              type="button"
              key={c}
              className="chip chip-color"
              aria-pressed={colors.includes(c)}
              onClick={() => toggleColor(c)}
            >
              <span className="dot" style={swatchCss(c) ? { background: swatchCss(c)! } : undefined} aria-hidden />
              {c}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="field">
        <span>Notes</span>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </label>

      {error && <p className="error">{error}</p>}

      <div className="form-actions">
        <button type="button" className="btn btn-ghost" onClick={() => history.back()}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Save
        </button>
      </div>
    </form>
  );
}
