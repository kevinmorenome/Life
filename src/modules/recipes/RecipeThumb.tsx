import type { ReactNode } from 'react';
import { PotIcon } from '../../icons';
import type { Recipe } from './types';

/**
 * The recipe's picture: a tinted tile with a drawn pot, the same `food-art` tile the stock grid uses, until recipes
 * get photos (#206). `children` are glass badges laid on it.
 */
export function RecipeThumb({ big = false, children }: { recipe?: Recipe; big?: boolean; children?: ReactNode }) {
  return (
    <span className={`food-art recipe-art${big ? ' food-art-big' : ''}`} aria-hidden={children ? undefined : true}>
      <PotIcon />
      {children}
    </span>
  );
}
