import { useEffect, useRef, useState } from 'react';

export interface FieldSpec {
  key: string;
  title: string;
  kind: 'text' | 'number' | 'date' | 'select' | 'textarea';
  /** For `select`. */
  options?: { value: string; label: string }[];
  /** Suggestions for `text`. */
  suggestions?: string[];
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
  const input = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

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
    <div className="sheet-backdrop" onClick={onClose}>
      <form
        className="sheet field-sheet"
        role="dialog"
        aria-label={spec.title}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (spec.kind !== 'select') apply(draft);
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

        {spec.kind === 'select' ? (
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
        ) : (
          <>
            {spec.kind === 'textarea' ? (
              <textarea ref={input} rows={4} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={spec.title} />
            ) : (
              <input
                ref={input}
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
