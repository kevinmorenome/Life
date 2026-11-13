import { useMemo, useState } from 'react';
import { ClockIcon } from '../../icons';
import { today } from '../../lib/format';
import { href } from '../../lib/router';
import { FoodTabs } from '../food/FoodTabs';
import { GROUP_LABELS, NO_COOK_FILTER, TIME_LIMITS, lackingText, rankRecipes, useSoonText, type CookGroup, type CookNowFilter } from './cookNow';
import { RecipePicture } from './RecipePicture';
import { allTags, formatMinutes, totalMinutes } from './recipes';
import type { Recipe } from './types';
import type { Kitchen } from './useKitchen';

/**
 * Food → Recipes → Cook now: your recipes ranked by how completely the stock covers them: can cook now, almost there
 * (one or two things lacking) and the rest, each saying what is missing and which food it would use up. Filter by tag
 * and by the longest time you have.
 */
export function CookNow({ recipes, kitchen }: { recipes: Recipe[]; kitchen: Pick<Kitchen, 'products' | 'stocked' | 'staples'> }) {
  const [filter, setFilter] = useState<CookNowFilter>(NO_COOK_FILTER);
  const day = today();
  const ranked = useMemo(() => rankRecipes(recipes, kitchen.stocked, kitchen.products, kitchen.staples, day, filter), [recipes, kitchen.stocked, kitchen.products, kitchen.staples, day, filter]);
  const tags = allTags(recipes);
  const toggleTag = (t: string) => setFilter((f) => ({ ...f, tags: f.tags.includes(t) ? f.tags.filter((x) => x !== t) : [...f.tags, t] }));
  const groups: CookGroup[] = ['now', 'almost', 'rest'];

  return (
    <>
      <FoodTabs active="recipes" />
      <h1 className="small muted food-h2">Cook now</h1>
      {recipes.length === 0 ? (
        <p className="muted">Add some recipes first, then this shows which ones you can make from what you have.</p>
      ) : (
        <>
          <div className="now-filters">
            <div className="chips" role="group" aria-label="Longest time">
              <button type="button" className="chip" aria-pressed={!filter.maxMinutes} onClick={() => setFilter((f) => ({ ...f, maxMinutes: undefined }))}>
                Any time
              </button>
              {TIME_LIMITS.map((m) => (
                <button key={m} type="button" className="chip" aria-pressed={filter.maxMinutes === m} onClick={() => setFilter((f) => ({ ...f, maxMinutes: m }))}>
                  Up to {formatMinutes(m)}
                </button>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="chips" role="group" aria-label="Tags">
                {tags.map((t) => (
                  <button key={t} type="button" className="chip" aria-pressed={filter.tags.includes(t)} onClick={() => toggleTag(t)}>
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          {ranked.length === 0 && <p className="muted">No recipes match.</p>}
          {groups.map((g) => {
            const list = ranked.filter((c) => c.group === g);
            if (!list.length) return null;
            return (
              <section key={g} aria-label={GROUP_LABELS[g]}>
                <h2 className="small muted food-h2 now-h">
                  {GROUP_LABELS[g]} · {list.length}
                </h2>
                <ul className="now-list">
                  {list.map((c) => {
                    const soon = useSoonText(c.useSoon);
                    const time = formatMinutes(totalMinutes(c.recipe));
                    return (
                      <li key={c.recipe.id}>
                        <a className="now-row" href={href(`/recipes/${c.recipe.id}`)}>
                          <RecipePicture recipe={c.recipe} />
                          <span className="now-text">
                            <span className="now-name">{c.recipe.name}</span>
                            {c.lacking.length > 0 ? <span className="small">{lackingText(c.lacking)}</span> : <span className="small">You have everything</span>}
                            {soon && <span className="small now-soon">{soon}</span>}
                            {time && (
                              <span className="small muted">
                                <ClockIcon /> {time}
                              </span>
                            )}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </>
  );
}
