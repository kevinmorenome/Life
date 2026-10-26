import { useEffect, useRef, useState } from 'react';

export interface FieldSpec {
  key: string;
  title: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'textarea';
  /** For `select`. */
  options?: { value: string; label: string }[];
  /** Suggestions for `text`. */
  suggestions?: string[];
  /** For `select`: shows the options as chips plus a ＋ chip that becomes a text box for a new value. */
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
    if (adding || spec.kind !== 'select') input.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose, adding, spec.kind]);

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
          if (adding) {
            if (draft.trim()) apply(draft);
          } else if (spec.kind !== 'select') apply(draft);
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

        {spec.kind === 'select' && spec.creatable ? (
          <ul className="chips field-suggestions">
            {spec.options!.map((o) => (
              <li key={o.value}>
                <button type="button" className="chip" aria-pressed={value === o.value} onClick={() => apply(o.value)}>
                  {o.label}
                </button>
              </li>
            ))}
            <li>
              {adding ? (
                <input
                  ref={input}
                  className="chip chip-input"
                  autoComplete="off"
                  enterKeyHint="done"
                  value={draft}
                  placeholder={spec.placeholder}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => !draft.trim() && setAdding(false)}
                  aria-label={`New ${spec.title.toLowerCase()}`}
                />
              ) : (
                <button
                  type="button"
                  className="chip"
                  aria-label={`New ${spec.title.toLowerCase()}`}
                  onClick={() => {
                    setDraft('');
                    setAdding(true);
                  }}
                >
                  ＋
                </button>
              )}
            </li>
          </ul>
        ) : spec.kind === 'select' ? (
          <>
            <ul className="field-options">
            {spec.clearable && (
              <li>
                <button type="button" className="sheet-item" aria-pressed={value === ''} onClick={() => apply('')}>
                  —
                </button>
              </li>
            )}
            {spec.options!.map((o) => (
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
