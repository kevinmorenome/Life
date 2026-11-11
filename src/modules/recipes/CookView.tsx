import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CheckIcon, ClockIcon, MinusIcon, PlusIcon } from '../../icons';
import { today } from '../../lib/format';
import { navigate } from '../../lib/router';
import { CloseIcon } from '../clothes/icons';
import { unitLabel } from '../food/products';
import { formatAmount } from '../food/stock';
import { checkRecipe } from './availability';
import { cookLines, markCooked, parseUsed, recipeAmount, startingAmounts, stepIngredients, stepTimers, usesToLog, type CookLine } from './cooking';
import { TimerStrip, useCookTimers } from './CookTimers';
import { ingredientAmount, scaleIngredients } from './ingredients';
import type { Recipe } from './types';
import type { Kitchen } from './useKitchen';

interface Props {
  recipe: Recipe;
  /** The servings chosen on the recipe page (the amounts are scaled to them). */
  servings: number;
  kitchen: Pick<Kitchen, 'products' | 'stocked' | 'staples' | 'logUses'>;
  onSave: (r: Recipe) => Promise<void>;
}

/** Keeps the screen on while cooking, where the browser can (Screen Wake Lock); asks again when the app comes back. */
function useWakeLock() {
  useEffect(() => {
    type Sentinel = { release(): Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let lock: Sentinel | undefined;
    let gone = false;
    const ask = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!.request('screen').then(
        (l) => (gone ? void l.release() : (lock = l)),
        () => {},
      );
    };
    ask();
    document.addEventListener('visibilitychange', ask);
    return () => {
      gone = true;
      document.removeEventListener('visibilitychange', ask);
      void lock?.release();
    };
  }, []);
}

const WHY: Record<NonNullable<CookLine['notTracked']>, string> = {
  staple: 'always in your pantry',
  unlinked: 'not in your groceries',
  'none-left': 'none in stock',
};

/**
 * Cooking a recipe (`#/recipes/<id>/cook/<servings>`): first the ingredients to gather and tick off, then one step at a
 * time, big, with Back / Next in a sticky glass bar, then "What did you use?": each ingredient pre-filled with what
 * comes off the stock (in the product's unit, capped at what is there), which you change or set to none. Only
 * Finish writes anything: `use` events for those amounts and today in `Recipe.cooked`. The screen stays on.
 */
export function CookView({ recipe, servings, kitchen, onSave }: Props) {
  useWakeLock();
  const timers = useCookTimers();
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const scaled = scaleIngredients(recipe.ingredients, recipe.servings, servings);
  const steps = recipe.steps;
  const last = steps.length + 1; // 0 = ingredients, 1..n = steps, n + 1 = what did you use
  const [page, setPage] = useState(0);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [lines] = useState(() =>
    cookLines(checkRecipe(scaled, kitchen.stocked, kitchen.products, kitchen.staples).items, (id) => kitchen.stocked.get(id)?.stock.quantity ?? 0),
  );
  const [typed, setTyped] = useState<Record<string, string>>({});
  /** Amounts you changed yourself on "What did you use?": the checklist no longer resets those. */
  const [edited, setEdited] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const back = `/recipes/${recipe.id}`;

  useEffect(() => {
    window.scrollTo(0, 0);
    // Arriving at "What did you use?": start from the checklist (unticked = 0) for every amount not changed by hand.
    if (page !== last) return;
    const start = startingAmounts(lines, ticked);
    setTyped((t) => {
      const next = { ...t };
      for (const l of lines) if (!edited.has(l.ingredient.id)) next[l.ingredient.id] = start[l.ingredient.id] ? formatAmount(start[l.ingredient.id], l.product?.unit ?? 'pc') : '0';
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea')) return;
      if (e.key === 'ArrowRight') setPage((p) => Math.min(last, p + 1));
      if (e.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [last]);

  const tracked = lines.filter((l) => !l.notTracked);
  const skipped = lines.filter((l) => l.notTracked);
  const amounts = Object.fromEntries(tracked.map((l) => [l.ingredient.id, parseUsed(typed[l.ingredient.id] ?? '')]));
  const bad = tracked.filter((l) => Number.isNaN(amounts[l.ingredient.id])).map((l) => l.ingredient.id);

  const markEdited = (id: string) => setEdited((cur) => (cur.has(id) ? cur : new Set(cur).add(id)));
  const setAmount = (l: CookLine, n: number) => {
    markEdited(l.ingredient.id);
    setTyped((t) => ({ ...t, [l.ingredient.id]: formatAmount(Math.min(l.left, Math.max(0, Math.round(n * 1000) / 1000)), l.product!.unit) }));
  };
  const stepOf = (l: CookLine) => (l.product!.unit === 'pc' ? (l.left < 1 ? 0.25 : 1) : l.left <= 0.2 ? 0.01 : 0.05);

  async function finish(takeOff: boolean) {
    if (takeOff && bad.length) return;
    setBusy(true);
    if (takeOff) await kitchen.logUses(usesToLog(tracked, amounts), `Cooked ${recipe.name}`);
    await onSave(markCooked(recipe, today(), new Date().toISOString()));
    navigate(back);
  }

  const toggle = (id: string) =>
    setTicked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Swiping sideways turns the page like a carousel (left = next, right = back); vertical scrolling is left alone.
  const swipeStart = (e: PointerEvent) => {
    swipe.current = (e.target as HTMLElement).closest('input:not([type=checkbox]), textarea') ? null : { x: e.clientX, y: e.clientY };
  };
  const swipeEnd = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(e.clientY - s.y) * 1.5) return;
    setPage((p) => (dx < 0 ? Math.min(last, p + 1) : Math.max(0, p - 1)));
  };

  const stepText = page > 0 && page < last ? steps[page - 1] : '';
  const offered = stepTimers(stepText).filter((t) => !timers.timers.some((x) => x.step === page && x.seconds === t.seconds));
  const mentioned = stepIngredients(stepText, scaled);

  return (
    <div className="cook" data-no-swipe-back onPointerDown={swipeStart} onPointerUp={swipeEnd} onPointerCancel={() => (swipe.current = null)}>
      <div className="cook-top">
        <div className="cook-title">
          <span className="muted small">{servings === recipe.servings ? `${servings} ${servings === 1 ? 'serving' : 'servings'}` : `${servings} servings (recipe: ${recipe.servings})`}</span>
          <strong>{recipe.name}</strong>
        </div>
        <button type="button" className="recipe-glass recipe-top-btn" aria-label="Stop cooking" onClick={() => navigate(back)}>
          <CloseIcon />
        </button>
      </div>
      <div className="cook-dots" aria-hidden="true">
        {Array.from({ length: last + 1 }, (_, i) => (
          <span key={i} className={i === page ? 'is-on' : i < page ? 'is-done' : undefined} />
        ))}
      </div>
      <TimerStrip timers={timers} />

      {page === 0 && (
        <section aria-label="Ingredients">
          <p className="cook-kicker">Get everything ready</p>
          <h1 className="cook-heading">Ingredients</h1>
          <p className="muted small cook-note">Tick each one as you take it out. What you leave unticked is set to 0 when you finish, so it stays in your stock.</p>
          {scaled.length === 0 ? (
            <p className="muted">This recipe has no ingredients.</p>
          ) : (
            <ul className="recipe-ingredients cook-ingredients">
              {scaled.map((i) => (
                <li key={i.id} className={ticked.has(i.id) ? 'is-ticked' : undefined}>
                  <label>
                    <input type="checkbox" className="recipe-check" checked={ticked.has(i.id)} onChange={() => toggle(i.id)} aria-label={`${i.name}: ready`} />
                    <span className="recipe-ing-text">
                      {i.name}
                      {i.optional && ' (optional)'}
                      {i.notes && <span className="muted small recipe-ing-notes">{i.notes}</span>}
                    </span>
                    <span className="muted recipe-ing-qty">{ingredientAmount(i)}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {page > 0 && page < last && (
        <section aria-label={`Step ${page} of ${steps.length}`} aria-live="polite">
          <p className="cook-kicker">
            Step {page} of {steps.length}
          </p>
          <p className="cook-step">{stepText}</p>
          {offered.length > 0 && (
            <div className="cook-timer-offers">
              {offered.map((t) => (
                <button key={t.seconds} type="button" className="recipe-glass cook-timer-start" onClick={() => timers.start(page, t)}>
                  <ClockIcon /> Start {t.label} timer
                </button>
              ))}
            </div>
          )}
          {mentioned.length > 0 && (
            <div className="cook-block">
              <h2 className="cook-block-title">In this step</h2>
              <ul className="cook-mini">
                {mentioned.map((i) => (
                  <li key={i.id}>
                    <span>{i.name}</span>
                    <span className="muted">{ingredientAmount(i)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="cook-block cook-next">
            <h2 className="cook-block-title">Up next</h2>
            {page < steps.length ? (
              <button type="button" className="cook-next-step" onClick={() => setPage(page + 1)}>
                <span className="recipe-step-no" aria-hidden="true">
                  {page + 1}
                </span>
                <span>{steps[page]}</span>
              </button>
            ) : (
              <p className="muted cook-next-last">That’s the last step. Then: what did you use?</p>
            )}
          </div>
        </section>
      )}

      {page === last && (
        <section aria-label="What did you use?">
          <p className="cook-kicker">Done cooking?</p>
          <h1 className="cook-heading">What did you use?</h1>
          <p className="muted small cook-note">
            These amounts come off your stock when you finish. Change any of them, or set 0 for what you didn’t use.
            {ticked.size > 0 && ' What you didn’t tick at the start is already at 0.'}
          </p>
          {tracked.length > 0 && (
            <ul className="cook-uses">
              {tracked.map((l) => {
                const p = l.product!;
                const n = amounts[l.ingredient.id];
                const invalid = bad.includes(l.ingredient.id);
                return (
                  <li key={l.ingredient.id}>
                    <div className="cook-use-text">
                      <strong>{l.ingredient.name}</strong>
                      <span className="muted small">
                        {p.name} · you have {formatAmount(l.left, p.unit)}
                        {unitLabel(p, l.left)}
                      </span>
                      {l.basis === 'guess' && <span className="small cook-hint">Recipe says {recipeAmount(l.ingredient)}: is this right?</span>}
                      {l.basis === 'unknown' && <span className="small cook-hint">Recipe says {recipeAmount(l.ingredient) || 'no amount'}: how much did you use?</span>}
                    </div>
                    <div className="cook-amount">
                      <button type="button" className="icon-btn recipe-lens-btn" aria-label={`Less ${l.ingredient.name}`} disabled={!n} onClick={() => setAmount(l, (n || 0) - stepOf(l))}>
                        <MinusIcon />
                      </button>
                      <input
                        value={typed[l.ingredient.id] ?? ''}
                        onChange={(e) => {
                          markEdited(l.ingredient.id);
                          setTyped((t) => ({ ...t, [l.ingredient.id]: e.target.value }));
                        }}
                        inputMode="decimal"
                        aria-label={`${l.ingredient.name} used, in ${p.unit === 'pc' ? 'pieces' : p.unit}`}
                        aria-invalid={invalid || undefined}
                      />
                      <span className="cook-unit">{p.unit === 'pc' ? unitLabel(p, n || 0).trim() || 'pc' : p.unit}</span>
                      <button type="button" className="icon-btn recipe-lens-btn" aria-label={`More ${l.ingredient.name}`} disabled={(n || 0) >= l.left} onClick={() => setAmount(l, (n || 0) + stepOf(l))}>
                        <PlusIcon />
                      </button>
                    </div>
                    {invalid && (
                      <p className="small recipe-ing-error" role="alert">
                        Use a number, like 0.2 or ½.
                      </p>
                    )}
                    {!invalid && n > l.left && <p className="muted small">Only {formatAmount(l.left, p.unit)} is there, so that is what comes off.</p>}
                  </li>
                );
              })}
            </ul>
          )}
          {skipped.length > 0 && (
            <p className="muted small cook-skipped">
              Not taken off: {skipped.map((l) => `${l.ingredient.name} (${WHY[l.notTracked!]})`).join(', ')}.
            </p>
          )}
          {tracked.length > 0 && (
            <button type="button" className="recipe-reset cook-skip" disabled={busy} onClick={() => void finish(false)}>
              Finish without changing my stock
            </button>
          )}
        </section>
      )}

      <div className="cook-bar">
        {page > 0 ? (
          <button type="button" className="btn btn-ghost" onClick={() => setPage(page - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {page < last ? (
          <button type="button" className="btn btn-primary" onClick={() => setPage(page + 1)}>
            {page === 0 ? (steps.length ? 'Start' : 'Done') : page === steps.length ? 'Done' : 'Next'}
          </button>
        ) : (
          <button type="button" className="btn btn-primary" disabled={busy || bad.length > 0} onClick={() => void finish(true)}>
            <CheckIcon /> Finish
          </button>
        )}
      </div>
    </div>
  );
}
