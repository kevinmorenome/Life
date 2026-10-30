import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { today } from '../../lib/format';
import { CalendarIcon, MoreIcon, PlusIcon, ShirtIcon, ZoomInIcon, ZoomOutIcon } from '../../icons';
import { href, navigate } from '../../lib/router';
import type { CalendarLayer, DayMark } from '../types';
import { tripsOnDate } from '../packing/packing';
import type { Trip } from '../packing/types';
import { addMonths, wearsByDay, type DayWear } from './calendar';
import { MAX_ZOOM, monthOfWeek, nearestLevel, pinchZoom, weekDays, weekStarts, ZOOMS } from './calendarZoom';
import { fitTiles, OUTFIT_PILL_HEIGHT, PILL_GAP, PILL_HEIGHT, slotsLeft } from './dayTiles';
import { ItemThumb } from './ItemThumb';
import { outfitName, outfitPieces } from './outfits';
import { plannedByDay } from './plans';
import type { ClothingItem, Outfit, Plan } from './types';

interface Props {
  /** YYYY-MM to scroll to; otherwise the calendar comes back where it was, or at today. */
  month?: string;
  items: ClothingItem[];
  outfits: Outfit[];
  trips?: Trip[];
  plans?: Plan[];
  /** What other modules add: a mark on each day and a summary for the month at the top. */
  layers?: CalendarLayer[];
}

// Kept at module level so opening a day and coming back lands where you were (the view unmounts).
const ZOOM_KEY = 'life.calendarZoom';
let savedLevel: number | undefined;
let savedScroll: number | undefined;

function loadLevel(): number {
  if (savedLevel !== undefined) return savedLevel;
  try {
    const i = ZOOMS.findIndex((z) => z === localStorage.getItem(ZOOM_KEY));
    if (i >= 0) return i;
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return 1;
}

export function CalendarView({ month, items, outfits, trips = [], plans = [], layers = [] }: Props) {
  const now = today();
  const nowMonth = now.slice(0, 7);
  const [level, setLevel] = useState(loadLevel);
  const [visibleMonth, setVisibleMonth] = useState(month ?? nowMonth);
  const wearDays = useMemo(() => wearsByDay(items, outfits), [items, outfits]);
  const planned = useMemo(() => plannedByDay(plans, outfits), [plans, outfits]);

  // A year either side of today, widened to include a month asked for.
  const weeks = useMemo(
    () => weekStarts(month && month < addMonths(nowMonth, -12) ? month : addMonths(nowMonth, -12), month && month > addMonths(nowMonth, 12) ? addMonths(month, 3) : addMonths(nowMonth, 12)),
    [month, nowMonth],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  // The live zoom (0 compact … 2 detail). It only lives in the --z CSS variable and this ref while the
  // fingers move: re-rendering every cell on each touch event would stutter.
  const zRef = useRef(level);
  const focus = useRef<{ week: string; frac: number; y: number } | null>(null);
  const animation = useRef(0);

  const rowOf = (week: string) => scrollRef.current?.querySelector<HTMLElement>(`[data-week="${week}"]`) ?? null;
  const labelOf = (week: string) => scrollRef.current?.querySelector<HTMLElement>(`[data-label="${week}"]`) ?? null;

  /** Remembers which spot of which week is at `y` (pixels below the top of the scroll area), so zooming keeps it there. */
  const pin = useCallback(
    (y: number) => {
      const el = scrollRef.current;
      focus.current = null;
      if (!el) return;
      for (const week of weeks) {
        const row = rowOf(week);
        if (row && row.offsetTop + row.offsetHeight > el.scrollTop + y) {
          focus.current = { week, frac: (el.scrollTop + y - row.offsetTop) / row.offsetHeight, y };
          return;
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeks],
  );

  const setZ = useCallback((z: number) => {
    zRef.current = z;
    wrapRef.current?.style.setProperty('--z', String(z));
    const f = focus.current;
    const el = scrollRef.current;
    const row = f && rowOf(f.week);
    if (f && row && el) el.scrollTop = row.offsetTop + f.frac * row.offsetHeight - f.y;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Eases to a level, like the system calendar does when you let go. */
  const settle = useCallback(
    (target: number) => {
      cancelAnimationFrame(animation.current);
      const from = zRef.current;
      const began = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - began) / 240);
        setZ(from + (target - from) * (1 - (1 - k) ** 3));
        if (k < 1) animation.current = requestAnimationFrame(step);
        else {
          focus.current = null;
          setLevel(target);
          savedLevel = target;
          try {
            localStorage.setItem(ZOOM_KEY, ZOOMS[target]);
          } catch {
            // Not remembered; fine.
          }
        }
      };
      animation.current = requestAnimationFrame(step);
    },
    [setZ],
  );

  const stepLevel = (dir: 1 | -1) => {
    const el = scrollRef.current;
    pin(el ? el.clientHeight / 3 : 0);
    settle(nearestLevel(zRef.current + dir));
  };

  // The calendar fills the space between the top bar and the bottom bar and scrolls inside it.
  useLayoutEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      wrap.style.height = `${window.innerHeight - top - (nav?.offsetHeight ?? 0)}px`;
    };
    fit();
    wrapRef.current?.style.setProperty('--z', String(zRef.current));
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  const scrollToDate = useCallback((date: string, smooth = false) => {
    const el = scrollRef.current;
    const start = weeks.filter((w) => w <= date).pop();
    const row = start && rowOf(start);
    if (!el || !row) return;
    // The month label sits above the row that holds the 1st, so land on it.
    const label = start ? labelOf(start) : null;
    const target = (label ?? row).offsetTop - (label ? 0 : row.offsetHeight);
    el.scrollTo({ top: Math.max(0, target), behavior: smooth ? 'smooth' : 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  /** The start of this month, unless that leaves today's week off the screen. */
  const scrollToToday = useCallback(
    (smooth = false) => {
      const el = scrollRef.current;
      const todayRow = rowOf(weeks.filter((w) => w <= now).pop() ?? '');
      if (!el || !todayRow) return;
      const label = el.querySelector<HTMLElement>('.cal-month.current');
      const monthTop = label ? label.offsetTop : todayRow.offsetTop - todayRow.offsetHeight;
      const fits = todayRow.offsetTop + todayRow.offsetHeight - monthTop <= el.clientHeight;
      el.scrollTo({ top: Math.max(0, fits ? monthTop : todayRow.offsetTop - todayRow.offsetHeight), behavior: smooth ? 'smooth' : 'auto' });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weeks, now],
  );

  // First paint: the month asked for, where you left off, or this month.
  useLayoutEffect(() => {
    if (month) scrollToDate(`${month}-01`);
    else if (savedScroll !== undefined && scrollRef.current) scrollRef.current.scrollTop = savedScroll;
    else scrollToToday();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The title follows the week at the top.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      savedScroll = el.scrollTop;
      for (const week of weeks) {
        const row = rowOf(week);
        if (row && row.offsetTop + row.offsetHeight > el.scrollTop) {
          setVisibleMonth(monthOfWeek(week));
          return;
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  // Pinch to zoom, tracking the fingers; the spot between them stays put. Ctrl + wheel (a trackpad pinch) does the same.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let startDistance = 0;
    let startZoom = 0;
    const distance = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const onStart = (e: TouchEvent) => {
      if (e.touches.length !== 2) return;
      cancelAnimationFrame(animation.current);
      startDistance = distance(e);
      startZoom = zRef.current;
      pin((e.touches[0].clientY + e.touches[1].clientY) / 2 - el.getBoundingClientRect().top);
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !startDistance) return;
      e.preventDefault();
      setZ(pinchZoom(startZoom, startDistance, distance(e)));
    };
    const onEnd = (e: TouchEvent) => {
      if (!startDistance || e.touches.length >= 2) return;
      startDistance = 0;
      settle(nearestLevel(zRef.current));
    };
    let wheelTimer = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      cancelAnimationFrame(animation.current);
      if (!wheelTimer) pin(e.clientY - el.getBoundingClientRect().top);
      setZ(Math.min(MAX_ZOOM, Math.max(0, zRef.current - e.deltaY * 0.01)));
      clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheelTimer = 0;
        settle(nearestLevel(zRef.current));
      }, 150);
    };
    const block = (e: Event) => e.preventDefault(); // Safari's own page pinch
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', block);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', block);
      cancelAnimationFrame(animation.current);
      clearTimeout(wheelTimer);
    };
  }, [pin, setZ, settle]);

  // Days with nothing on them open a floating menu instead of a blank day screen.
  const [menu, setMenu] = useState<{ date: string; top: number; left: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !(e.target as Element).closest?.('.day-menu')) setMenu(null);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menu]);

  function openDay(e: MouseEvent<HTMLAnchorElement>, date: string) {
    const empty = !wearDays.has(date) && !planned.has(date) && !tripsOnDate(trips, date).length && !layers.some((l) => l.mark?.(date));
    if (!empty) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({ date, top: Math.min(r.bottom + 4, window.innerHeight - 190), left: Math.min(Math.max(8, r.left + r.width / 2 - 90), window.innerWidth - 188) });
  }
  const go = (path: string) => {
    setMenu(null);
    navigate(path);
  };

  const [year, m] = visibleMonth.split('-').map(Number);
  const monthName = new Date(Date.UTC(year, m - 1, 1)).toLocaleDateString(undefined, { month: 'long', timeZone: 'UTC' });
  // Monday-first weekday initials in the viewer's language (Jan 5, 2026 was a Monday).
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    new Date(Date.UTC(2026, 0, 5 + i)).toLocaleDateString(undefined, { weekday: 'narrow', timeZone: 'UTC' }),
  );

  return (
    <div className="cal" ref={wrapRef}>
      <div className="cal-head">
        <div className="cal-title-row">
          <h2 className="cal-title">
            {monthName}
            {String(year) !== now.slice(0, 4) && <small>{year}</small>}
          </h2>
          <div className="cal-tools">
            <button className="icon-btn" aria-label="Zoom out" disabled={level === 0} onClick={() => stepLevel(-1)}>
              <ZoomOutIcon />
            </button>
            <button className="icon-btn" aria-label="Zoom in" disabled={level === MAX_ZOOM} onClick={() => stepLevel(1)}>
              <ZoomInIcon />
            </button>
          </div>
        </div>
        {layers.map((l, i) => (
          <div key={i}>{l.header?.(visibleMonth)}</div>
        ))}
        <div className="cal-weekdays" aria-hidden>
          {weekdays.map((w, i) => (
            <span key={i}>{w}</span>
          ))}
        </div>
      </div>

      <div className="cal-scroll" ref={scrollRef} role="grid" aria-label="Calendar">
        {weeks.map((start) => {
          const days = weekDays(start);
          const first = days.findIndex((d) => d.endsWith('-01'));
          const label = first >= 0 ? days[first].slice(0, 7) : null;
          return (
            <div key={start}>
              {label && (
                <div className={`cal-month${label === nowMonth ? ' current' : ''}`} data-label={start} style={{ paddingLeft: `${(first * 100) / 7}%` }}>
                  {new Date(label + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', timeZone: 'UTC' })}
                  {label.slice(0, 4) !== now.slice(0, 4) && ` ${label.slice(0, 4)}`}
                </div>
              )}
              <div className="cal-week" role="row" data-week={start}>
                {days.map((date) => (
                  <DayCell
                    key={date}
                    date={date}
                    isToday={date === now}
                    wear={wearDays.get(date)}
                    planned={planned.get(date)}
                    trips={tripsOnDate(trips, date)}
                    layers={layers}
                    items={items}
                    onClick={(e) => openDay(e, date)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button className="cal-today" onClick={() => scrollToToday(true)}>
        Today
      </button>

      {menu && (
        <div className="menu day-menu" role="menu" style={{ top: menu.top, left: menu.left }}>
          <button role="menuitem" className="menu-item" onClick={() => go(`/clothes/calendar/${menu.date}/outfit`)}>
            <ShirtIcon /> {menu.date > now ? 'Plan an outfit' : 'Log an outfit'}
          </button>
          <button role="menuitem" className="menu-item" onClick={() => go(`/calendar/${menu.date}`)}>
            <CalendarIcon /> Open day
          </button>
          {menu.date <= now && (
            <button role="menuitem" className="menu-item" onClick={() => go(`/clothes/calendar/${menu.date}/items`)}>
              <PlusIcon /> Log items
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface CellProps {
  date: string;
  isToday: boolean;
  wear?: DayWear;
  planned?: Outfit[];
  trips: Trip[];
  layers: CalendarLayer[];
  items: ClothingItem[];
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * A day shows all three zoom levels at once, stacked: --z (set on the calendar) fades dots into a photo with
 * badges and then into labelled pills, so zooming can run continuously.
 */
function DayCell({ date, isToday, wear, planned, trips, layers, items, onClick }: CellProps) {
  const marks = layers.flatMap((l) => {
    const mark = l.mark?.(date);
    return mark ? [mark] : [];
  });
  const hasOutfit = !!wear || !!planned?.length;
  const outfit = wear?.outfits[0];
  const lone = wear?.items[0];
  const extra = wear ? wear.outfits.length + wear.items.length - 1 : 0;
  // Text pills left for the marks that list one pill per entry, once the outfit, trips and other marks have theirs.
  const used = (wear ? OUTFIT_PILL_HEIGHT + PILL_GAP : 0) + (!wear && planned?.length ? PILL_HEIGHT + PILL_GAP : 0) + (trips.length + marks.filter((m) => !m.tiles).length) * (PILL_HEIGHT + PILL_GAP);
  const slots = slotsLeft(used);
  return (
    <a role="gridcell" className={`cal-day${isToday ? ' today' : ''}`} href={href(`/calendar/${date}`)} aria-label={date} onClick={onClick}>
      <span className="cal-num">{Number(date.slice(8))}</span>
      {(hasOutfit || marks.length > 0 || trips.length > 0) && (
        <>
          <span className="cal-layer cal-dots">
            {hasOutfit && <i className={`dot dot-outfit${wear ? '' : ' planned'}`} />}
            {marks.map((m, i) => (
              <i key={i} className={`dot mark-${m.tone}`} title={m.label} />
            ))}
            {trips.length > 0 && <i className="dot dot-trip" />}
          </span>
          <span className="cal-layer cal-photo">
            <DayBubble wear={wear} planned={planned} items={items} />
          </span>
          <span className={`cal-layer cal-badges${hasOutfit ? ' with-photo' : ''}`}>
            {marks.map((m, i) => (
              <span key={i} className={`day-badge mark-${m.tone}`} role="img" aria-label={m.label}>
                {m.icon}
              </span>
            ))}
          </span>
          {trips.length > 0 && <i className="cal-layer cal-trip" />}
          <span className="cal-layer cal-pills">
            {marks.map((m, i) => (
              <MarkPills key={i} mark={m} slots={slots} />
            ))}
            {wear && (
              <span className="pill pill-outfit">
                <DayBubble wear={wear} items={items} />
                <span className="pill-text">
                  {outfit ? outfitName(outfit) : lone?.name}
                  {extra > 0 && ` +${extra}`}
                </span>
              </span>
            )}
            {!wear && planned && planned.length > 0 && <span className="pill pill-outfit planned">{outfitName(planned[0])}</span>}
            {trips.map((t) => (
              <span key={t.id} className="pill pill-trip">
                🧳 {t.name}
              </span>
            ))}
          </span>
        </>
      )}
    </a>
  );
}

/** A module's mark at full zoom: one pill, or one per entry (`tiles`) with a "more" pill for those that don't fit. */
function MarkPills({ mark: m, slots }: { mark: DayMark; slots: number }) {
  if (!m.tiles) {
    return (
      <span className={`pill mark-${m.tone}`}>
        <span className="pill-icon">{m.icon}</span>
        {m.detail ?? m.label}
      </span>
    );
  }
  const { shown, more } = fitTiles(m.tiles.length, slots);
  return (
    <>
      {m.tiles.slice(0, shown).map((t, i) => (
        <span key={i} className={`pill mark-${m.tone}`}>
          <span className="pill-icon">{m.icon}</span>
          <span className="pill-text">{t}</span>
        </span>
      ))}
      {more > 0 && (
        <span className={`pill pill-more mark-${m.tone}`} aria-label={`${more} more`}>
          <span className="pill-icon">
            <MoreIcon />
          </span>
          +{more}
        </span>
      )}
    </>
  );
}

/** Round photo of what was worn (or, faded, what's planned): the first outfit's top pieces, or the first item. */
function DayBubble({ wear, planned, items }: { wear?: DayWear; planned?: Outfit[]; items: ClothingItem[] }) {
  const isPlan = !wear && !!planned?.length;
  if (!wear && !isPlan) return null;
  const pieces = wear
    ? wear.outfits.length
      ? outfitPieces(wear.outfits[0], items).slice(0, 2)
      : wear.items.slice(0, 2)
    : outfitPieces(planned![0], items).slice(0, 2);
  if (!pieces.length) return <span className={`day-bubble${isPlan ? ' planned' : ''}`} />;
  return (
    <span className={`day-bubble pieces-${pieces.length}${isPlan ? ' planned' : ''}`}>
      {pieces.map((p) => (
        <ItemThumb key={p.id} item={p} />
      ))}
    </span>
  );
}
