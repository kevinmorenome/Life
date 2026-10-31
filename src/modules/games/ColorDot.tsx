import { useEffect, useRef, useState } from 'react';
import { CATAN_COLORS, PLAYER_COLOR_HEX } from './catan';

/** A round color dot; tapping opens a floating menu of the colors nobody else has taken. */
export function ColorDot({ value, takenByOthers, label, onChange }: { value?: string; takenByOthers: string[]; label: string; onChange: (c: string) => void }) {
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

  const swatch = (c?: string): React.CSSProperties => ({
    width: 22,
    height: 22,
    borderRadius: '50%',
    flex: 'none',
    background: c ? PLAYER_COLOR_HEX[c] : 'transparent',
    border: c ? '1px solid rgb(128 128 128 / 0.5)' : '2px dashed rgb(128 128 128 / 0.7)',
  });

  return (
    <div className="menu-wrap" ref={box}>
      <button
        type="button"
        aria-label={`${label} color: ${value || 'none'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        style={{ width: 44, height: 44, display: 'grid', placeItems: 'center', border: 0, background: 'none', padding: 0, cursor: 'pointer' }}
      >
        <span style={swatch(value)} />
      </button>
      {open && (
        <div className="menu" role="menu">
          {CATAN_COLORS.filter((c) => !takenByOthers.includes(c)).map((c) => (
            <button
              key={c}
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onChange(c);
                setOpen(false);
              }}
            >
              <span style={swatch(c)} /> {c}
            </button>
          ))}
          {value && (
            <button
              type="button"
              role="menuitem"
              className="menu-item"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              <span style={swatch()} /> No color
            </button>
          )}
        </div>
      )}
    </div>
  );
}
