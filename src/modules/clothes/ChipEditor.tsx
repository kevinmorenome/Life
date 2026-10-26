import { useState, type ReactNode } from 'react';
import { CheckIcon, PencilIcon } from './icons';

interface Props {
  title: string;
  values: string[];
  /** Dot or other prefix for a chip. */
  prefix?: (name: string) => ReactNode;
  /** Extra choices offered in edit mode (e.g. the colour palette). */
  options?: string[];
  /** Show a free-text box to add new entries. */
  freeText?: boolean;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** Used in aria-labels, e.g. "tag". */
  noun: string;
  emptyHint: string;
}

/** A chip section with a pencil that switches to edit mode: ✕ on chips, plus a picker or text box to add. */
export function ChipEditor({ title, values, prefix, options, freeText, onAdd, onRemove, noun, emptyHint }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const has = (n: string) => values.some((v) => v.toLowerCase() === n.toLowerCase());
  const choices = options?.filter((o) => !has(o)) ?? [];

  function submit() {
    if (draft.trim()) onAdd(draft);
    setDraft('');
  }

  return (
    <section className="tag-section">
      <div className="section-head">
        <h2>{title}</h2>
        <button
          className="icon-action"
          aria-label={editing ? `Done editing ${title.toLowerCase()}` : `Edit ${title.toLowerCase()}`}
          onClick={() => setEditing(!editing)}
        >
          {editing ? <CheckIcon /> : <PencilIcon />}
        </button>
      </div>
      {values.length === 0 && !editing && <p className="muted small">{emptyHint}</p>}
      <ul className="chips tag-list">
        {values.map((v) => (
          <li key={v} className="chip chip-static chip-color">
            {prefix?.(v)}
            {v}
            {editing && (
              <button className="chip-x" aria-label={`Remove ${noun} ${v}`} onClick={() => onRemove(v)}>
                ✕
              </button>
            )}
          </li>
        ))}
      </ul>
      {editing && choices.length > 0 && (
        <ul className="chips tag-list">
          {choices.map((o) => (
            <li key={o}>
              <button className="chip chip-color" aria-label={`Add ${noun} ${o}`} onClick={() => onAdd(o)}>
                {prefix?.(o)}
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && freeText && (
        <form
          className="chip-add"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add a ${noun}`} aria-label={`New ${noun}`} />
        </form>
      )}
    </section>
  );
}
