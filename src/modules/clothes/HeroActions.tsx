import { useEffect, useRef, useState, type ReactNode } from 'react';
import { href } from '../../lib/router';
import { DotsIcon, HeartIcon, PencilIcon, TrashIcon } from './icons';

interface Props {
  editPath: string;
  favorite: boolean;
  onToggleFavorite: () => void;
  onDelete: () => void;
  deleteLabel: string;
  /** The primary call-to-action, shown on the right. */
  children: ReactNode;
}

/** Edit / favourite / ⋮ icons on the left of the hero, primary action on the right. */
export function HeroActions({ editPath, favorite, onToggleFavorite, onDelete, deleteLabel, children }: Props) {
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

  return (
    <div className="hero-actions">
      <div className="icon-row">
        <a className="icon-action" href={href(editPath)} aria-label="Edit">
          <PencilIcon />
        </a>
        <button
          className="icon-action"
          aria-label={favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={favorite}
          onClick={onToggleFavorite}
        >
          <HeartIcon filled={favorite} />
        </button>
        <div className="menu-wrap" ref={box}>
          <button className="icon-action" aria-label="More" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <DotsIcon />
          </button>
          {open && (
            <div className="menu" role="menu">
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
