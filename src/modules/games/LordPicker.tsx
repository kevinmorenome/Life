import { useEffect, useRef, useState } from 'react';

/** A button showing the player's Lord; tapping opens a floating menu of the Lords nobody else has taken (like the color dots). */
export function LordPicker({ value, options, label, onChange }: { value?: string; options: readonly string[]; label: string; onChange: (lord: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const pick = (lord: string) => {
    onChange(lord);
    setOpen(false);
  };

  return (
    <div className="menu-wrap" ref={box} style={{ minWidth: 0 }}>
      <button
        type="button"
        className="field-pill"
        aria-label={`${label} Lord: ${value || 'none'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ width: '100%', minWidth: 0, padding: '0 0.6rem', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: value ? 1 : 0.6 }}
      >
        {value || 'Lord'}
      </button>
      {open && (
        <div className="menu" role="menu" style={{ minWidth: 230, maxHeight: '55vh', overflowY: 'auto' }}>
          {options.map((l) => (
            <button key={l} type="button" role="menuitem" className="menu-item" aria-current={l === value || undefined} style={l === value ? { fontWeight: 600 } : undefined} onClick={() => pick(l)}>
              {l}
            </button>
          ))}
          {value && (
            <button type="button" role="menuitem" className="menu-item" onClick={() => pick('')}>
              No Lord
            </button>
          )}
        </div>
      )}
    </div>
  );
}
