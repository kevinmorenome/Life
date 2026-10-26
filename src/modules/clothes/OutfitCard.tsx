import type { ReactNode } from 'react';
import { href as link } from '../../lib/router';
import { OutfitBoard } from './OutfitBoard';
import { outfitName, outfitPieces } from './outfits';
import type { ClothingItem, Outfit } from './types';

interface Props {
  outfit: Outfit;
  items: ClothingItem[];
  /** Opens the outfit's page. Mutually exclusive with `onClick`. */
  to?: string;
  /** Makes the whole flat lay a button (pickers). */
  onClick?: () => void;
  /** Shows a check mark in the corner; pass `false` for an unchecked ring. */
  selected?: boolean;
  label?: string;
  /** Floating round icon buttons (`.card-fab`). */
  children?: ReactNode;
}

/** An outfit as a borderless flat lay with its name underneath, for grids (`.outfit-cards`). */
export function OutfitCard({ outfit, items, to, onClick, selected, label, children }: Props) {
  const board = <OutfitBoard pieces={outfitPieces(outfit, items)} />;
  const aria = label ?? outfitName(outfit);
  return (
    <div className="outfit-card">
      {to ? (
        <a href={link(to)} className="card-cover" aria-label={aria}>
          {board}
        </a>
      ) : (
        <button type="button" className="card-cover" aria-label={aria} aria-pressed={selected} onClick={onClick}>
          {board}
        </button>
      )}
      {selected !== undefined && (
        <span className="pick-check pick-check-card" aria-hidden data-on={selected}>
          ✓
        </span>
      )}
      {children}
      {outfit.name && <span className="outfit-card-name">{outfit.name}</span>}
    </div>
  );
}
