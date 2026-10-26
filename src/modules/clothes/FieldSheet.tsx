import { useEffect, useRef, useState } from 'react';

export interface FieldSpec {
  key: string;
  title: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'textarea';
  /** For `select`. */
  options?: { value: string; label: string }[];
  /** Suggestions for `text`. */
  suggestions?: string[];
  /** For `select`: lets the user type a value that isn't in `options` ("New…" row), and filters long lists. */
  creatable?: boolean;
  /** Whether an empty value is allowed (shows Restore to clear). */
  clearable?: boolean;
  placeholder?: string;
}

interface Props {
  spec: FieldSpec;
  value: string;
  onApply: (value: string) => boolean | Promise<boolean>;
  onClose: () => void;
}

/** Bottom sheet to edit one field; Apply saves it straight away. */
export function FieldSheet({ spec, value, onApply, onClose }: Props) {
  const [draft, setDraft] = useState(value);
  const [error, setError] = useState(false);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState('');
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  const [lift, setLift] = useState(0);

  // iOS doesn't resize fixed layouts for the keyboard: lift the sheet above it.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => setLift(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);

  async function apply(v: string) {
    if (await onApply(v)) onClose();
    else setError(true);
  }

  return (
    <div className="sheet-backdrop" style={lift ? { paddingBottom: lift } : undefined} onClick={onClose}>
      <form
        className="sheet field-sheet"
        role="dialog"
        aria-label={spec.title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (spec.kind !== 'select' || adding) apply(draft);
        }}
      >
        <div className="field-sheet-head">
          <h2>{spec.title}</h2>
          {spec.clearable && value && (
            <button type="button" className="btn btn-ghost" onClick={() => apply('')}>
              Restore
            </button>
          )}
        </div>

        {spec.kind === 'select' && spec.creatable && adding ? (
          <>
            <input
              ref={input}
              type="text"
              autoComplete="off"
              value={draft}
              placeholder={spec.placeholder}
              onChange={(e) => setDraft(e.target.value)}
              aria-label={`New ${spec.title.toLowerCase()}`}
            />
            <button type="submit" className="btn btn-primary field-apply" disabled={!draft.trim()}>
              Apply
            </button>
          </>
        ) : spec.kind === 'select' ? (
          <>
            {spec.creatable && spec.options!.length > 8 && (
              <input
                type="search"
                autoComplete="off"
                value={filter}
                placeholder="Search"
                onChange={(e) => setFilter(e.target.value)}
                aria-label={`Search ${spec.title.toLowerCase()}`}
              />
            )}
            <ul className="field-options">
            {spec.creatable && (
              <li>
                <button
                  type="button"
                  className="sheet-item"
                  onClick={() => {
                    setDraft(filter.trim());
                    setAdding(true);
                  }}
                >
                  ＋ New {spec.title.toLowerCase()}…
                </button>
              </li>
            )}
            {spec.clearable && (
              <li>
                <button type="button" className="sheet-item" aria-pressed={value === ''} onClick={() => apply('')}>
                  —
                </button>
              </li>
            )}
            {spec.options!
              .filter((o) => o.label.toLowerCase().includes(filter.trim().toLowerCase()))
              .map((o) => (
              <li key={o.value}>
                <button type="button" className="sheet-item" aria-pressed={value === o.value} onClick={() => apply(o.value)}>
                  {o.label}
                  {value === o.value && <span aria-hidden> ✓</span>}
                </button>
              </li>
            ))}
            </ul>
          </>
        ) : (
          <>
            {spec.kind === 'textarea' ? (
              <textarea ref={input} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={spec.title} />
            ) : (
              <input
                ref={input}
                autoComplete="off"
                type={spec.kind === 'date' ? 'date' : 'text'}
                inputMode={spec.kind === 'number' ? 'decimal' : undefined}
                value={draft}
                placeholder={spec.placeholder}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(false);
                }}
                aria-label={spec.title}
                aria-invalid={error}
              />
            )}
            {spec.suggestions && spec.suggestions.length > 0 && (
              <ul className="chips field-suggestions">
                {spec.suggestions.map((sg) => (
                  <li key={sg}>
                    <button type="button" className="chip" aria-pressed={draft === sg} onClick={() => apply(sg)}>
                      {sg}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {error && <p className="error">That value isn’t valid.</p>}
            <button type="submit" className="btn btn-primary field-apply">
              Apply
            </button>
          </>
        )}
      </form>
    </div>
  );
}
