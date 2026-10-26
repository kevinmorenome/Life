import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { itemColors, swatches as toSwatches } from './colors';
import { CalendarCheckIcon, PriceTagIcon, SparkleIcon, WardrobeIcon } from './icons';
import { HeroActions } from './HeroActions';
import { Insights, type Insight } from './Insights';
import { ItemThumb } from './ItemThumb';
import { OutfitBoard } from './OutfitBoard';
import { costPerWear, daysInCloset, lastWorn, wearCount } from './stats';
import { outfitName, outfitPieces, outfitsWithItem } from './outfits';
import { categoryLabel, label, type ClothingItem, type Outfit } from './types';
import { WearLog } from './WearLog';
import { withPriorWears, withWear, withoutWear, withoutWearOn } from './wear';

interface Props {
  item: ClothingItem;
  /** The whole closet, for resolving outfit pieces. */
  items: ClothingItem[];
  outfits: Outfit[];
  onSave: (item: ClothingItem) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const TABS = ['about', 'style', 'stats'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { about: 'About', style: 'Style', stats: 'Stats' };

export function ItemDetail({ item, items, outfits, onSave, onDelete }: Props) {
  const [tab, setTab] = useState<Tab>('about');
  const cpw = costPerWear(item);
  const total = wearCount(item);
  const inOutfits = outfitsWithItem(item.id, outfits);
  const wornToday = item.wears.includes(today());

  async function del() {
    if (confirm(`Delete “${item.name}”? This can’t be undone.`)) {
      await onDelete(item.id);
      navigate('/clothes');
    }
  }

  return (
    <article className="detail item-detail">
      <header className="hero">
        <div className="hero-top">
          <a className="back" href={href('/clothes')} aria-label="Back to closet">
            ←
          </a>
          <p className="hero-pill">
            {cpw != null ? money(cpw) : '—'} <span className="muted">/ {total} {total === 1 ? 'wear' : 'wears'}</span>
          </p>
        </div>
        <ItemThumb item={item} large />
        <h1>{item.name}</h1>
        <p className="muted small">{[item.brand, categoryLabel(item)].filter(Boolean).join(' · ')}</p>
        <HeroActions
          editPath={`/clothes/${item.id}/edit`}
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
          <a className="btn btn-primary" href={href(`/clothes/outfits/new/${item.id}`)}>
            Create outfit
          </a>
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
        {tab === 'about' && <About item={item} />}
        {tab === 'style' && <Style item={item} />}
        {tab === 'stats' && (
          <Stats item={item} outfits={inOutfits} onSave={onSave} />
        )}
      </div>
    </article>
  );
}

function About({ item }: { item: ClothingItem }) {
  const facts: [string, string | undefined][] = [
    ['Category', categoryLabel(item)],
    ['Status', label(item.status)],
    ['Brand', item.brand],
    ['Size', item.size],
    ['Material', item.material],
    ['Price', item.price != null ? money(item.price) : undefined],
    ['Purchased', item.purchaseDate && shortDate(item.purchaseDate)],
  ];
  const swatches = toSwatches(itemColors(item));
  return (
    <>
      {swatches.length > 0 && (
        <section className="tag-section">
          <h2>Colors</h2>
          <ul className="chips tag-list">
            {swatches.map((c) => (
              <li key={c.name} className="chip chip-static chip-color">
                <span className="dot" style={c.css ? { background: c.css } : undefined} aria-hidden />
                {c.name}
              </li>
            ))}
          </ul>
        </section>
      )}
      <dl className="rows">
        {facts
          .filter(([, v]) => v)
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
      </dl>
      {item.notes && <p className="notes">{item.notes}</p>}
    </>
  );
}

function Style({ item }: { item: ClothingItem }) {
  const groups: [string, string[] | undefined][] = [
    ['Seasons', item.seasons.map(label)],
    ['Occasions', item.occasions],
    ['Tags', item.tags],
  ];
  const shown = groups.filter(([, v]) => v && v.length > 0);
  return (
    <>
      {item.condition && (
        <dl className="rows">
          <div>
            <dt>Condition</dt>
            <dd>{label(item.condition)}</dd>
          </div>
        </dl>
      )}
      {shown.map(([title, values]) => (
        <section key={title} className="tag-section">
          <h2 className="small muted">{title}</h2>
          <ul className="chips tag-list">
            {values!.map((v) => (
              <li key={v} className="chip chip-static">
                {v}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {shown.length === 0 && !item.condition && (
        <p className="muted">
          Nothing here yet. <a href={href(`/clothes/${item.id}/edit`)}>Add seasons, occasions or tags.</a>
        </p>
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
