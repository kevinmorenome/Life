import { useState } from 'react';
import { money, shortDate, today } from '../../lib/format';
import { href, navigate } from '../../lib/router';
import { ItemThumb } from './ItemThumb';
import { OutfitCollage } from './OutfitCollage';
import { costPerWear, daysInCloset, lastWorn, wearCount } from './stats';
import { outfitName, outfitPieces, outfitsWithItem } from './outfits';
import { label, type ClothingItem, type Outfit } from './types';
import { withPriorWears, withWear, withoutWear } from './wear';

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
  const [wearDate, setWearDate] = useState(today());
  const cpw = costPerWear(item);
  const total = wearCount(item);
  const inOutfits = outfitsWithItem(item.id, outfits);

  async function del() {
    if (confirm(`Delete “${item.name}”? This can’t be undone.`)) {
      await onDelete(item.id);
      navigate('/clothes');
    }
  }

  return (
    <article className="detail">
      <a className="back" href={href('/clothes')}>
        ← Closet
      </a>

      <header className="hero">
        <p className="hero-pill">
          {cpw != null ? money(cpw) : '—'} <span className="muted">/ {total} {total === 1 ? 'wear' : 'wears'}</span>
        </p>
        <ItemThumb item={item} large />
        <h1>{item.name}</h1>
        <p className="muted small">{[item.brand, label(item.category)].filter(Boolean).join(' · ')}</p>
        <div className="hero-actions">
          <a className="btn" href={href(`/clothes/${item.id}/edit`)}>
            Edit
          </a>
          <button className="btn" onClick={() => onSave(withWear(item, today()))}>
            Wore it today
          </button>
          <a className="btn btn-primary" href={href(`/clothes/outfits/new/${item.id}`)}>
            Create outfit
          </a>
        </div>
      </header>

      {inOutfits.length > 0 && (
        <section className="use-with">
          <h2>Wear it with</h2>
          <ul className="use-with-row">
            {inOutfits.map((o) => (
              <li key={o.id}>
                <a href={href(`/clothes/outfits/${o.id}`)} className="use-with-card" title={outfitName(o)}>
                  <OutfitCollage pieces={outfitPieces(o, items)} />
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
        {tab === 'about' && <About item={item} onDelete={del} />}
        {tab === 'style' && <Style item={item} />}
        {tab === 'stats' && (
          <Stats
            item={item}
            outfitCount={inOutfits.length}
            wearDate={wearDate}
            setWearDate={setWearDate}
            onSave={onSave}
          />
        )}
      </div>
    </article>
  );
}

function About({ item, onDelete }: { item: ClothingItem; onDelete: () => void }) {
  const facts: [string, string | undefined][] = [
    ['Category', label(item.category)],
    ['Status', label(item.status)],
    ['Brand', item.brand],
    ['Color', item.color],
    ['Size', item.size],
    ['Material', item.material],
    ['Price', item.price != null ? money(item.price) : undefined],
    ['Purchased', item.purchaseDate && shortDate(item.purchaseDate)],
  ];
  return (
    <>
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
      {item.notes && <p className="card notes">{item.notes}</p>}
      <div className="form-actions">
        <button className="btn btn-danger" onClick={onDelete}>
          Delete item
        </button>
      </div>
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
  outfitCount: number;
  wearDate: string;
  setWearDate: (d: string) => void;
  onSave: (item: ClothingItem) => Promise<void>;
}

function Stats({ item, outfitCount, wearDate, setWearDate, onSave }: StatsProps) {
  const last = lastWorn(item);
  const cpw = costPerWear(item);
  const undated = item.priorWears ?? 0;

  const insights: [string, string][] = [
    [last ? shortDate(last) : 'Never', 'Last worn'],
    [`${daysInCloset(item, today())} days`, 'In the closet'],
    [String(outfitCount), outfitCount === 1 ? 'Outfit made' : 'Outfits made'],
    [cpw != null ? money(cpw) : '—', 'Cost per wear'],
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

      <section>
        <h2>Insights</h2>
        <ul className="insights">
          {insights.map(([value, name]) => (
            <li key={name} className="card">
              <span className="insight-value">{value}</span>
              <span className="stat-label">{name}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Wear log</h2>
        <div className="wear-add">
          <input type="date" value={wearDate} max={today()} onChange={(e) => setWearDate(e.target.value)} />
          <button className="btn btn-primary" disabled={!wearDate} onClick={() => onSave(withWear(item, wearDate))}>
            Log wear
          </button>
        </div>
        {item.wears.length === 0 ? (
          <p className="muted small">No dated wears yet.</p>
        ) : (
          <ul className="wear-list">
            {item.wears
              .map((d, i) => ({ d, i }))
              .reverse()
              .map(({ d, i }) => (
                <li key={`${d}-${i}`}>
                  <span>{shortDate(d)}</span>
                  <button
                    className="btn btn-ghost btn-small"
                    aria-label={`Remove wear on ${shortDate(d)}`}
                    onClick={() => onSave(withoutWear(item, i))}
                  >
                    ✕
                  </button>
                </li>
              ))}
          </ul>
        )}
      </section>
    </>
  );
}
