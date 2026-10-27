import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { ChipEditor } from './ChipEditor';
import { FieldSheet, type FieldSpec } from './FieldSheet';
import { valuesOf, withField, type FieldKey } from './fields';
import { resizeImage } from '../../lib/image';
import { addChip, removeChip, withColors, withTags } from './chips';
import { PALETTE, itemColors, swatchCss } from './colors';
import { EyeIcon, EyeOffIcon } from '../../icons';
import { CalendarCheckIcon, CheckIcon, PriceTagIcon, SparkleIcon, WardrobeIcon } from './icons';
import { HeroActions } from './HeroActions';
import { Insights, type Insight } from './Insights';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { costPerWear, daysInCloset, lastWorn, wearCount } from './stats';
import { outfitName, outfitPieces, outfitsWithItem } from './outfits';
import {
  CATEGORIES,
  CONDITIONS,
  SEASONS,
  STATUSES,
  SUBCATEGORIES,
  categoryLabel,
  label,
  type ClothingItem,
  type Outfit,
  type Season,
} from './types';
import { markReviewed } from './review';
import { WearLog } from './WearLog';
import { withPriorWears, withWear, withoutWear, withoutWearOn } from './wear';

interface Props {
  item: ClothingItem;
  /** The whole closet, for resolving outfit pieces. */
  items: ClothingItem[];
  outfits: Outfit[];
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  /** Shown as a step of the review drawer: Save / Check later at the bottom, and close/remove hand back to the flow. */
  review?: { onSave: () => void; onLater: () => void; onClose: () => void; onRemoved: () => void };
}

const TABS = ['about', 'style', 'stats'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { about: 'About', style: 'Style', stats: 'Stats' };

export function ItemDetail({ item, items, outfits, onSave, onDelete, review }: Props) {
  const [tab, setTab] = useState<Tab>('about');
  const cpw = costPerWear(item);
  const total = wearCount(item);
  const inOutfits = outfitsWithItem(item.id, outfits);
  const wornToday = item.wears.includes(today());

  async function del() {
    if (confirm(`Delete “${item.name}”? This can’t be undone.`)) {
      await onDelete(item.id);
      if (review) review.onRemoved();
      else navigate('/clothes');
    }
  }

  return (
    <article className="detail item-detail">
      <header className="hero">
        <div className="hero-top">
          {review ? (
            <button type="button" className="back" aria-label="Close" onClick={review.onClose}>
              ✕
            </button>
          ) : (
            <a className="back" href={href('/clothes')} aria-label="Back to closet">
              ←
            </a>
          )}
          <p className="hero-pill">
            {cpw != null ? money(cpw) : '—'} <span className="muted">/ {total} {total === 1 ? 'wear' : 'wears'}</span>
          </p>
        </div>
        <label className="photo-edit" aria-label="Change photo">
          <ItemThumb item={item} large />
          <input
            type="file"
            accept="image/*"
            hidden
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) onSave({ ...item, photo: await resizeImage(file), updatedAt: new Date().toISOString() }).catch(() => {});
            }}
          />
        </label>
        <FieldTitle item={item} onSave={onSave} />
        <p className="muted small">{[item.brand, categoryLabel(item)].filter(Boolean).join(' · ')}</p>
        {item.needsReview && !review && (
          <p className="review-note">
            <span>Added automatically. Check the details.</span>
            <button
              type="button"
              className="filter-btn"
              aria-label="Mark as reviewed"
              onClick={() => onSave(markReviewed(item, new Date()))}
            >
              <CheckIcon />
            </button>
          </p>
        )}
        <HeroActions
          leading={
            item.status === 'active' || item.status === 'storage' ? (
              <button
                className={`icon-action icon-action-sm${item.status === 'storage' ? ' icon-action-on' : ''}`}
                aria-label={item.status === 'storage' ? 'Bring back to closet' : 'Put away in storage'}
                onClick={() =>
                  onSave({ ...item, status: item.status === 'storage' ? 'active' : 'storage', updatedAt: new Date().toISOString() })
                }
              >
                {item.status === 'storage' ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            ) : undefined
          }
          favorite={!!item.favorite}
          onToggleFavorite={() => onSave({ ...item, favorite: !item.favorite, updatedAt: new Date().toISOString() })}
          onDelete={del}
          deleteLabel="Delete item"
          menuItems={[
            {
              label: wornToday ? 'Undo wore it today' : 'Wore it today',
              icon: <CalendarCheckIcon />,
              onClick: () => onSave(wornToday ? withoutWearOn(item, today()) : withWear(item, today())),
            },
          ]}
        >
          {!review && (
            <a className="btn btn-primary" href={href(`/clothes/outfits/new/${item.id}`)}>
              Create outfit
            </a>
          )}
        </HeroActions>
      </header>

      {inOutfits.length > 0 && (
        <section className="use-with">
          <h2>Wear it with</h2>
          <ul className="use-with-row">
            {inOutfits.map((o) => (
              <li key={o.id}>
                <a href={href(`/clothes/outfits/${o.id}`)} className="use-with-card" title={outfitName(o)}>
                  <OutfitBoard pieces={outfitPieces(o, items)} />
                  <span className="small">{outfitName(o)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="seg" role="tablist" aria-label="Item sections">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls="tab-panel"
            onClick={() => setTab(t)}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      <div id="tab-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === 'about' && <About item={item} items={items} onSave={onSave} />}
        {tab === 'style' && <Style item={item} onSave={onSave} />}
        {tab === 'stats' && (
          <Stats item={item} outfits={inOutfits} onSave={onSave} />
        )}
      </div>

      {review && (
        <div className="form-actions sticky-actions">
          <button type="button" className="btn btn-ghost" onClick={review.onLater}>
            Check later
          </button>
          <button type="button" className="btn btn-primary" onClick={review.onSave}>
            Save
          </button>
        </div>
      )}
    </article>
  );
}

function About({ item, items, onSave }: { item: ClothingItem; items: ClothingItem[]; onSave: (item: ClothingItem) => Promise<void> }) {
  const colors = itemColors(item);
  return (
    <>
      <ChipEditor
        title="Colors"
        noun="color"
        values={colors}
        options={PALETTE}
        emptyHint="No colors yet."
        prefix={(c) => <span className="dot" style={swatchCss(c) ? { background: swatchCss(c)! } : undefined} aria-hidden />}
        onAdd={(c) => onSave(withColors(item, addChip(colors, c)))}
        onRemove={(c) => onSave(withColors(item, removeChip(colors, c)))}
      />
      <FieldRows item={item} items={items} onSave={onSave} />
      <NotesField item={item} onSave={onSave} />
    </>
  );
}

function Style({ item, onSave }: { item: ClothingItem; onSave: (item: ClothingItem) => Promise<void> }) {
  const touch = <T extends ClothingItem>(patch: Partial<T>) => onSave({ ...item, ...patch, updatedAt: new Date().toISOString() });
  const seasons = item.seasons.map(label);
  const occasions = item.occasions ?? [];
  return (
    <>
      <ChipEditor
        title="Seasons"
        noun="season"
        values={seasons}
        options={SEASONS.map(label)}
        emptyHint="No seasons yet."
        onAdd={(s) => touch({ seasons: SEASONS.filter((x) => item.seasons.includes(x) || x === (s.toLowerCase() as Season)) })}
        onRemove={(s) => touch({ seasons: item.seasons.filter((x) => x !== s.toLowerCase()) })}
      />
      <ChipEditor
        title="Occasions"
        noun="occasion"
        values={occasions}
        freeText
        emptyHint="No occasions yet."
        onAdd={(o) => touch({ occasions: addChip(occasions, o) })}
        onRemove={(o) => {
          const rest = removeChip(occasions, o);
          return touch({ occasions: rest.length ? rest : undefined });
        }}
      />
      <ChipEditor
        title="Tags"
        noun="tag"
        values={item.tags ?? []}
        freeText
        emptyHint="No tags yet."
        onAdd={(t) => onSave(withTags(item, addChip(item.tags ?? [], t)))}
        onRemove={(t) => onSave(withTags(item, removeChip(item.tags ?? [], t)))}
      />
    </>
  );
}

interface SaveProps {
  item: ClothingItem;
  onSave: (item: ClothingItem) => Promise<void>;
}

const SELECT = (values: readonly string[]) => values.map((v) => ({ value: v, label: label(v) }));

/** Tappable value pill; opens a sheet and saves on Apply. */
function FieldRows({ item, items, onSave }: SaveProps & { items: ClothingItem[] }) {
  const chipOptions = (key: 'brand' | 'size' | 'material' | 'subcategory', extra: string[] = []) =>
    valuesOf(items, key, extra).map((v) => ({ value: v, label: v }));
  const [open, setOpen] = useState<FieldKey | null>(null);
  const rows: { key: FieldKey; spec: Omit<FieldSpec, 'key' | 'title'>; title: string; value: string; shown?: string }[] = [
    { key: 'category', title: 'Category', spec: { kind: 'select', options: SELECT(CATEGORIES) }, value: item.category, shown: label(item.category) },
    {
      key: 'subcategory',
      title: 'Sub-category',
      spec: { kind: 'select', creatable: true, clearable: true, placeholder: 'Polo shirt', options: chipOptions('subcategory', SUBCATEGORIES[item.category]) },
      value: item.subcategory ?? '',
    },
    { key: 'brand', title: 'Brand', spec: { kind: 'select', creatable: true, clearable: true, placeholder: 'Brand name', options: chipOptions('brand') }, value: item.brand ?? '' },
    { key: 'size', title: 'Size', spec: { kind: 'select', creatable: true, clearable: true, placeholder: 'M', options: chipOptions('size') }, value: item.size ?? '' },
    { key: 'material', title: 'Material', spec: { kind: 'select', creatable: true, clearable: true, placeholder: 'Cotton, Elastane', options: chipOptions('material') }, value: item.material ?? '' },
    {
      key: 'price',
      title: 'Price',
      spec: { kind: 'number', clearable: true, placeholder: '0.00' },
      value: item.price != null ? String(item.price) : '',
      shown: item.price != null ? money(item.price) : undefined,
    },
    {
      key: 'purchaseDate',
      title: 'Purchased',
      spec: { kind: 'date', clearable: true },
      value: item.purchaseDate ?? '',
      shown: item.purchaseDate && shortDate(item.purchaseDate),
    },
    { key: 'status', title: 'Status', spec: { kind: 'select', options: SELECT(STATUSES) }, value: item.status, shown: label(item.status) },
    {
      key: 'condition',
      title: 'Condition',
      spec: { kind: 'select', clearable: true, options: SELECT(CONDITIONS) },
      value: item.condition ?? '',
      shown: item.condition && label(item.condition),
    },
  ];
  const current = rows.find((r) => r.key === open);

  return (
    <>
      <dl className="rows field-rows">
        {rows.map((r) => {
          const text = r.shown ?? r.value;
          return (
            <div key={r.key}>
              <dt>{r.title}</dt>
              <dd>
                <button className={`field-pill${text ? '' : ' field-empty'}`} onClick={() => setOpen(r.key)} aria-label={`Edit ${r.title.toLowerCase()}`}>
                  <span className="field-pill-text">{text || 'Add'}</span>
                </button>
              </dd>
            </div>
          );
        })}
      </dl>
      {current && (
        <FieldSheet
          spec={{ key: current.key, title: current.title, ...current.spec }}
          value={current.value}
          onClose={() => setOpen(null)}
          onApply={async (v) => {
            const next = withField(item, current.key, v);
            if (!next) return false;
            await onSave(next);
            return true;
          }}
        />
      )}
    </>
  );
}

/** Notes as a text area; saves when you leave the field. */
function NotesField({ item, onSave }: SaveProps) {
  const [draft, setDraft] = useState(item.notes ?? '');
  return (
    <section className="notes-field">
      <h2>Notes</h2>
      <textarea
        rows={4}
        value={draft}
        placeholder="Add notes"
        aria-label="Notes"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const next = withField(item, 'notes', draft);
          if (next && (next.notes ?? '') !== (item.notes ?? '')) onSave(next);
        }}
      />
    </section>
  );
}

/** The item name, tap to rename. */
function FieldTitle({ item, onSave }: SaveProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <h1>
        <button className="title-edit" onClick={() => setOpen(true)} aria-label="Rename item">
          {item.name}
        </button>
      </h1>
      {open && (
        <FieldSheet
          spec={{ key: 'name', title: 'Name', kind: 'text' }}
          value={item.name}
          onClose={() => setOpen(false)}
          onApply={async (v) => {
            const next = withField(item, 'name', v);
            if (!next) return false;
            await onSave(next);
            return true;
          }}
        />
      )}
    </>
  );
}

interface StatsProps {
  item: ClothingItem;
  /** Outfits that include the item. */
  outfits: Outfit[];
  onSave: (item: ClothingItem) => Promise<void>;
}

function Stats({ item, outfits, onSave }: StatsProps) {
  const outfitCount = outfits.length;
  const last = lastWorn(item);
  const cpw = costPerWear(item);
  const undated = item.priorWears ?? 0;

  const insights: Insight[] = [
    { value: last ? shortDate(last) : 'Never', label: 'Last worn', tone: 'lime', icon: <CalendarCheckIcon /> },
    { value: `${daysInCloset(item, today())} days`, label: 'In the closet', tone: 'blue', icon: <WardrobeIcon /> },
    { value: String(outfitCount), label: outfitCount === 1 ? 'Outfit made' : 'Outfits made', tone: 'purple', icon: <SparkleIcon /> },
    { value: cpw != null ? money(cpw) : '—', label: 'Cost per wear', tone: 'orange', icon: <PriceTagIcon /> },
  ];

  return (
    <>
      <section className="card total-use">
        <h2>Total wears</h2>
        <div className="total-row">
          <div>
            <span className="stat-value">{item.wears.length}</span>
            <span className="stat-label">Logged</span>
          </div>
          <div className="stepper">
            <button
              className="step"
              aria-label="Remove an undated wear"
              disabled={undated === 0}
              onClick={() => onSave(withPriorWears(item, -1))}
            >
              −
            </button>
            <div>
              <span className="stat-value">{undated}</span>
              <span className="stat-label">No date</span>
            </div>
            <button className="step" aria-label="Add an undated wear" onClick={() => onSave(withPriorWears(item, 1))}>
              +
            </button>
          </div>
          <div>
            <span className="stat-value">{wearCount(item)}</span>
            <span className="stat-label">Total</span>
          </div>
        </div>
      </section>

      <Insights insights={insights} />

      <WearLog
        wears={item.wears}
        noteFor={(d) => {
          const names = outfits.filter((o) => o.wears.includes(d)).map(outfitName);
          return names.length ? `with ${names.join(', ')}` : undefined;
        }}
        onAdd={(d) => onSave(withWear(item, d))}
        onRemove={(i) => onSave(withoutWear(item, i))}
      />
    </>
  );
}
