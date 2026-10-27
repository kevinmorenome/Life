import { useState, type ReactNode } from 'react';
import { today } from '../../lib/format';
import { OutfitBoard } from './OutfitBoard';
import { PlusIcon } from '../../icons';
import { HeartIcon } from './icons';
import { SEASONS, label, type ClothingItem, type Season } from './types';

interface Props {
  title: string;
  submitLabel: string;
  pieces: ClothingItem[];
  name: string;
  onName: (v: string) => void;
  tags: string[];
  onTags: (v: string[]) => void;
  seasons: Season[];
  onSeasons: (v: Season[]) => void;
  favorite: boolean;
  onFavorite: (v: boolean) => void;
  /** Only for new outfits that can be scheduled: future days plan it, today or past log it. */
  date?: string;
  onDate?: (v: string) => void;
  onBack: () => void;
  /** Back to the canvas to change the pieces. */
  onAddPieces: () => void;
}

type Row = 'info' | 'tags' | 'season' | 'date';

const Chevron = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 6l6 6-6 6" />
  </svg>
);

/** Second step of the outfit form: the flat lay on top, then a hairline list of details that each open a sheet. */
export function OutfitDetailsStep(p: Props) {
  const [open, setOpen] = useState<Row | null>(null);
  const toggleSeason = (s: Season) => p.onSeasons(p.seasons.includes(s) ? p.seasons.filter((x) => x !== s) : SEASONS.filter((x) => x === s || p.seasons.includes(x)));

  const rows: { key: Row; title: string; value: string; empty: string }[] = [
    { key: 'info', title: 'Outfit info', value: p.name.trim(), empty: 'Describe this look' },
    { key: 'tags', title: 'Tags', value: p.tags.join(', '), empty: 'Add tags' },
    { key: 'season', title: 'Season', value: p.seasons.map(label).join(', '), empty: 'Add seasons' },
    ...(p.onDate ? [{ key: 'date' as const, title: 'Scheduled for', value: p.date ?? '', empty: 'Optional' }] : []),
  ];

  return (
    <div className="outfit-details">
      <header className="step-bar">
        <button type="button" className="icon-btn step-back" aria-label="Back to pieces" onClick={p.onBack}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <h1>{p.title}</h1>
      </header>

      <div className="step-cards">
        <div className="step-card" aria-label="Outfit preview">
          <OutfitBoard pieces={p.pieces} large />
        </div>
        <button type="button" className="step-card step-card-add" aria-label="Change pieces" onClick={p.onAddPieces}>
          <PlusIcon />
        </button>
      </div>

      <p className="step-intro">What kind of outfit is it? Share some details with us.</p>

      <ul className="detail-rows">
        {rows.map((r) => (
          <li key={r.key}>
            <button type="button" className="detail-row" onClick={() => setOpen(r.key)} aria-label={`Edit ${r.title.toLowerCase()}`}>
              <span className="detail-title">{r.title}</span>
              <span className={`detail-value${r.value ? '' : ' is-empty'}`}>{r.value || r.empty}</span>
              <Chevron />
            </button>
          </li>
        ))}
        <li>
          <div className="detail-row">
            <span className="detail-title">Favorite</span>
            <span className="detail-value">
              <HeartIcon filled={p.favorite} />
            </span>
            <button type="button" role="switch" aria-checked={p.favorite} aria-label="Favorite" className="switch" onClick={() => p.onFavorite(!p.favorite)}>
              <span />
            </button>
          </div>
        </li>
      </ul>

      <div className="sticky-actions">
        <button type="submit" className="btn btn-primary btn-block btn-cta">
          {p.submitLabel}
        </button>
      </div>

      {open === 'info' && (
        <DetailSheet title="Outfit info" onClose={() => setOpen(null)}>
          <input value={p.name} onChange={(e) => p.onName(e.target.value)} placeholder="Friday dinner" aria-label="Outfit name" autoFocus />
        </DetailSheet>
      )}
      {open === 'tags' && (
        <DetailSheet title="Tags" onClose={() => setOpen(null)}>
          <TagEditor tags={p.tags} onChange={p.onTags} />
        </DetailSheet>
      )}
      {open === 'season' && (
        <DetailSheet title="Season" onClose={() => setOpen(null)}>
          <ul className="chips">
            {SEASONS.map((s) => (
              <li key={s}>
                <button type="button" className="chip" aria-pressed={p.seasons.includes(s)} onClick={() => toggleSeason(s)}>
                  {label(s)}
                </button>
              </li>
            ))}
          </ul>
        </DetailSheet>
      )}
      {open === 'date' && p.onDate && (
        <DetailSheet title="Scheduled for" onClose={() => setOpen(null)}>
          <input type="date" value={p.date ?? ''} onChange={(e) => p.onDate!(e.target.value)} aria-label="Date" />
          <p className="muted small">
            {p.date ? (p.date > today() ? 'Will be planned for this day.' : 'Will be logged as worn that day.') : 'Leave empty to just save the outfit.'}
          </p>
          {p.date && (
            <button type="button" className="btn btn-ghost" onClick={() => p.onDate!('')}>
              Clear date
            </button>
          )}
        </DetailSheet>
      )}
    </div>
  );
}

function DetailSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet field-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="field-sheet-head">
          <h2>{title}</h2>
        </div>
        {children}
        <button type="button" className="btn btn-primary field-apply" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (v: string[]) => void }) {
  const [draft, setDraft] = useState('');
  function add() {
    const t = draft.trim();
    if (t && !tags.some((x) => x.toLowerCase() === t.toLowerCase())) onChange([...tags, t]);
    setDraft('');
  }
  return (
    <>
      {tags.length > 0 && (
        <ul className="chips tag-list">
          {tags.map((t) => (
            <li key={t} className="chip chip-static chip-color">
              {t}
              <button type="button" className="chip-x" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))}>
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Add a tag (dinner, work…)"
        aria-label="New tag"
      />
    </>
  );
}
