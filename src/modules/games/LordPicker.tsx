import { useEffect, useRef, useState } from 'react';
import { lordInitials } from './waterdeep';

/** A round button with the initials of the player's Lord; tapping opens a floating menu of the Lords nobody else has taken (like the color dots). */
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
    <div className="menu-wrap" ref={box}>
      <button
        type="button"
        aria-label={`${label} Lord: ${value || 'none'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, background: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            display: 'grid',
            placeItems: 'center',
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1,
            color: value ? 'var(--accent-text)' : 'inherit',
            background: value ? 'var(--accent)' : 'transparent',
            border: value ? 'none' : '2px dashed rgb(128 128 128 / 0.7)',
            opacity: value ? 1 : 0.7,
          }}
        >
          {value ? lordInitials(value) : ''}
        </span>
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
