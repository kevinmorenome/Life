import { useEffect, useRef, useState } from 'react';

/** A dropdown showing the player's Lord; tapping opens a floating menu of the Lords nobody else has taken (like the color dots). */
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
    <div className="menu-wrap" ref={box} style={{ flex: 1, minWidth: 0 }}>
      <button
        type="button"
        aria-label={`${label} Lord: ${value || 'none'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ maxWidth: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, border: 0, background: 'none', padding: 0, color: 'inherit', font: 'inherit', cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
      >
        <span style={{ flex: '0 1 auto', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: value ? 600 : 400, opacity: value ? 1 : 0.55 }}>{value || 'Choose Lord'}</span>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', opacity: 0.6, transform: open ? 'rotate(180deg)' : undefined }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
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
