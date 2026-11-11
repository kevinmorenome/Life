import { useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { href } from '../../lib/router';
import { useCollection } from '../../lib/useCollection';
import { Columns, Empty, HBars, Section, Tile, TONES } from '../clothes/charts';
import { agoText, cookedPerMonth, cookedPerWeekday, cookingStream, cookingStreaks, forgotten, mostCooked } from './cookStats';
import { RecipePicture } from './RecipePicture';
import type { Recipe } from './types';
import { ordinal } from './useRecipesLayer';

const monthTick = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'short' });
const monthName = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const STREAM_PAGE = 20;

/**
 * Stats → Recipes: what you cook, from the days recorded when you finish cooking. Tiles (times, recipes, current and
 * longest streak), the stream of cooking (every cooked day, newest first), the most cooked, per month and weekday,
 * and what you haven't cooked lately or ever.
 */
export function RecipesStatsRoute() {
  const recipes = useCollection<Recipe>('recipes');
  const now = today();
  const [month, setMonth] = useState(now.slice(0, 7));
  const [shown, setShown] = useState(STREAM_PAGE);
  if (recipes.loading) return <p className="muted">Loading…</p>;

  const stream = cookingStream(recipes.items);
  if (!stream.length)
    return <Empty>Nothing cooked yet. Open a recipe, tap Start cooking and Finish at the end: every time you cook shows up here.</Empty>;

  const streak = cookingStreaks(stream.map((c) => c.date), now);
  const top = mostCooked(recipes.items);
  const months = cookedPerMonth(stream, now);
  const weekdays = cookedPerWeekday(stream);
  const { notLately, never } = forgotten(recipes.items, now);
  const selected = months.find((m) => m.month === month) ?? months[months.length - 1];
  // The how-many-th time each cooked day was for its recipe, to mark first times in the stream.
  const nth = new Map<string, number>();
  for (const r of recipes.items) [...new Set(r.cooked ?? [])].sort().forEach((d, i) => nth.set(`${r.id}|${d}`, i + 1));

  return (
    <>
      <div className="tiles">
        <Tile value={String(stream.length)} label={stream.length === 1 ? 'Time cooked' : 'Times cooked'} tone={0} />
        <Tile value={String(top.length)} label={top.length === 1 ? 'Recipe' : 'Different recipes'} tone={1} />
        <Tile value={`${streak.current} ${streak.current === 1 ? 'day' : 'days'}`} label={`Streak · best ${streak.longest}`} tone={2} />
      </div>

      <Section title="Stream of cooking" note="Every time you cooked, newest first.">
        <ol className="cook-stream">
          {stream.slice(0, shown).map((c, i) => {
            const n = nth.get(`${c.recipe.id}|${c.date}`) ?? 1;
            const newDay = i === 0 || stream[i - 1].date !== c.date;
            return (
              <li key={`${c.date}-${c.recipe.id}`} className={newDay ? 'is-new-day' : undefined}>
                <span className="cook-stream-date">{newDay ? `${shortDate(c.date)} · ${agoText(c.date, now)}` : ''}</span>
                <a className="cook-stream-row" href={href(`/recipes/${c.recipe.id}`)}>
                  <RecipePicture recipe={c.recipe} className="cook-stream-pic" />
                  <span className="cook-stream-text">
                    <strong>{c.recipe.name}</strong>
                    <span className={n === 1 ? 'cook-first' : 'muted small'}>{n === 1 ? 'First time' : `${n}${ordinal(n)} time`}</span>
                  </span>
                </a>
              </li>
            );
          })}
        </ol>
        {stream.length > shown && (
          <button type="button" className="btn cook-stream-more" onClick={() => setShown((s) => s + STREAM_PAGE)}>
            Show more ({stream.length - shown} left)
          </button>
        )}
      </Section>

      <Section title="Most cooked">
        <HBars
          rows={top.slice(0, 8).map((r, i) => ({
            key: r.recipe.id,
            label: r.recipe.name,
            value: r.times,
            shown: `${r.times}×`,
            sub: `Last ${shortDate(r.last)} · ${agoText(r.last, now)}`,
            color: TONES[i % TONES.length],
          }))}
        />
      </Section>

      <Section title="Per month" note={selected ? `${monthName(selected.month)}: cooked ${selected.times} ${selected.times === 1 ? 'time' : 'times'}.` : undefined}>
        <Columns
          bars={months.map((m) => ({ key: m.month, tick: monthTick(m.month), value: m.times }))}
          selected={selected?.month ?? ''}
          onSelect={setMonth}
          color="var(--c-cook)"
          describe={(b) => `${monthName(b.key)}: ${b.value}`}
        />
      </Section>

      <Section title="By weekday">
        <HBars rows={WEEKDAYS.map((d, i) => ({ key: d, label: d, value: weekdays[i], shown: String(weekdays[i]) }))} color="var(--c-cook)" />
      </Section>

      {(notLately.length > 0 || never.length > 0) && (
        <Section title="Cook again?" note="Recipes you haven’t made in over a month, and ones you never have.">
          <ul className="digest-list cook-again">
            {notLately.slice(0, 6).map((r) => (
              <li key={r.recipe.id}>
                <a href={href(`/recipes/${r.recipe.id}`)}>{r.recipe.name}</a> <span className="muted small">· last {agoText(r.last, now)}</span>
              </li>
            ))}
            {never.slice(0, 6).map((r) => (
              <li key={r.id}>
                <a href={href(`/recipes/${r.id}`)}>{r.name}</a> <span className="muted small">· never cooked</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
