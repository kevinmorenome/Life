import type { ReactNode } from 'react';
import { PotIcon } from '../../icons';
import { usePhoto } from '../../lib/usePhoto';
import type { Recipe } from './types';

/**
 * The recipe's picture: its photo (kept apart locally and loaded on demand, `usePhoto`), or a tinted tile with a drawn
 * pot. `photo` overrides it (the form's unsaved choice; null = removed). `children` are glass controls laid on it.
 */
export function RecipePicture({ recipe, photo, className = '', children }: { recipe?: Recipe; photo?: string | null; className?: string; children?: ReactNode }) {
  const stored = usePhoto('recipes', recipe && { id: recipe.id, photo: recipe.photo, hasPhoto: recipe.hasPhoto });
  const src = photo === null ? undefined : photo ?? stored;
  return (
    <span className={`recipe-pic${src ? ' has-photo' : ''} ${className}`.trim()}>
      {src ? <img src={src} alt="" /> : <PotIcon />}
      {children}
    </span>
  );
}
