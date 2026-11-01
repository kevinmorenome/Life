import { useEffect, useRef, useState, type ReactNode } from 'react';
import { href } from '../../lib/router';
import { CheckIcon, DotsIcon, HeartIcon, PencilIcon, TrashIcon } from './icons';

interface Props {
  editPath?: string;
  /** Replaces the edit icon when given. */
  leading?: ReactNode;
  favorite: boolean;
  onToggleFavorite: () => void;
  onDelete: () => void;
  deleteLabel: string;
  /** Extra ⋮ menu entries, shown above Delete. */
  menuItems?: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }[];
  /** The primary call-to-action, shown on the right. */
  children: ReactNode;
}

/** Edit / favourite / ⋮ icons on the left of the hero, primary action on the right. */
export function HeroActions({ editPath, leading, favorite, onToggleFavorite, onDelete, deleteLabel, menuItems = [], children }: Props) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
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

  // Brief check on the ⋮ button after a menu action, since the menu closes right away.
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setDone(false), 1500);
    return () => clearTimeout(t);
  }, [done]);

  return (
    <div className="hero-actions">
      <div className="icon-row">
        {leading ??
          (editPath && (
            <a className="icon-action" href={href(editPath)} aria-label="Edit">
              <PencilIcon />
            </a>
          ))}
        <button
          className="icon-action"
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
        >
          <HeartIcon filled={favorite} />
        </button>
        <div className="menu-wrap" ref={box}>
          <button
            className={done ? 'icon-action icon-action-done' : 'icon-action'}
            aria-label={done ? 'Done' : 'More'}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {done ? <CheckIcon /> : <DotsIcon />}
          </button>
          {open && (
            <div className="menu" role="menu">
              {menuItems.map((m) => (
                <button
                  key={m.label}
                  role="menuitem"
                  className="menu-item"
                  disabled={m.disabled}
                  onClick={() => {
                    setOpen(false);
                    setDone(true);
                    m.onClick();
                  }}
                >
                  {m.icon} {m.label}
                </button>
              ))}
              <button
                role="menuitem"
                className="menu-item menu-danger"
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
              >
                <TrashIcon /> {deleteLabel}
              </button>
            </div>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}
