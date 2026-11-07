import { memo, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { today } from '../../lib/format';
import { flagEmoji } from '../countries/flag';
import type { HomeOn } from '../countries/countries';
import { isUnconfirmedTrip } from '../trips/pendingTrips';
import { flagsToShow, tripDayShape } from '../trips/tripLine';
import { CalendarIcon, FilterIcon, PlusIcon, ShirtIcon } from '../../icons';
import { href, navigate } from '../../lib/router';
import type { CalendarLayer, DayMark } from '../types';
import { tripsOnDate } from '../trips/packing';
import type { Trip } from '../trips/types';
import { addMonths, wearsByDay, type DayWear } from './calendar';
import { FILTER_KINDS, isShown, kindOfTone, parseFilter, toggleKind } from './calendarFilter';
import { calendarStart, MAX_ZOOM, monthOfWeek, nearestLevel, pinchZoom, weekDays, weekStarts, ZOOMS } from './calendarZoom';
import { collagePieces } from './collage';
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
  /** Where you were on days with check-ins (ISO code per YYYY-MM-DD): the flag on a trip follows it. */
  dayCountries?: ReadonlyMap<string, string[]>;
  /** Your home country on a day: its flag is never drawn. */
  homeOn?: HomeOn;
  plans?: Plan[];
  /** What other modules add: a mark on each day and a summary for the month at the top. */
  layers?: CalendarLayer[];
}

// Kept at module level so opening a day and coming back lands where you were (the view unmounts).
const ZOOM_KEY = 'life.calendarZoom';
const FILTER_KEY = 'life.calendarFilter';
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

const NO_COUNTRIES: ReadonlyMap<string, string[]> = new Map();

export function CalendarView({ month, items, outfits, trips = [], dayCountries = NO_COUNTRIES, homeOn, plans = [], layers = [] }: Props) {
  const now = today();
  const nowMonth = now.slice(0, 7);
  const [level, setLevel] = useState(loadLevel);
  // Which kinds of entry to show (none selected = all), remembered in this browser.
  const [filter, setFilterState] = useState<string[]>(() => {
    try {
      return parseFilter(localStorage.getItem(FILTER_KEY));
    } catch {
      return [];
    }
  });
  const [filtersOpen, setFiltersOpen] = useState(filter.length > 0);
  const setFilter = (next: string[]) => {
    setFilterState(next);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      // Not remembered; fine.
    }
  };
  const [visibleMonth, setVisibleMonth] = useState(month ?? nowMonth);
  const wearDays = useMemo(() => wearsByDay(items, outfits), [items, outfits]);
  const planned = useMemo(() => plannedByDay(plans, outfits), [plans, outfits]);

  // A year either side of today, widened to include a month asked for and to reach back to the oldest data.
  const oldest = wearDays.size ? [...wearDays.keys()].sort()[0] : undefined;
  const layerOldest = layers.map((l) => l.earliest).sort()[0];
  const weeks = useMemo(
    () => weekStarts(calendarStart(nowMonth, month, [oldest, layerOldest]), month && month > addMonths(nowMonth, 12) ? addMonths(month, 3) : addMonths(nowMonth, 12)),
    [month, nowMonth, oldest, layerOldest],
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
    // Which looks are on screen right now (see the content-visibility rules in styles.css).
    wrapRef.current?.setAttribute('data-lo', String(Math.floor(z)));
    wrapRef.current?.setAttribute('data-hi', String(Math.ceil(z)));
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

  // The calendar fills the screen below the top bar and scrolls inside it; the dock floats over its
  // bottom, so the scroll area gets enough bottom padding for the last week to clear the dock.
  useLayoutEffect(() => {
    const fit = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const nav = document.querySelector<HTMLElement>('.bottom-nav');
      const top = wrap.getBoundingClientRect().top + window.scrollY;
      wrap.style.height = `${window.innerHeight - top}px`;
      if (scrollRef.current) {
        const covered = nav ? window.innerHeight - nav.getBoundingClientRect().top : 0;
        scrollRef.current.style.paddingBottom = `${covered + 16}px`;
        wrap.style.setProperty('--dock-clear', `${covered}px`);
      }
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
    // Every week's row is in the DOM (built or not) in order, so the one at the top is found by bisection.
    const rows = Array.from(el.querySelectorAll<HTMLElement>('[data-week]'));
    const update = () => {
      frame = 0;
      savedScroll = el.scrollTop;
      let lo = 0;
      let hi = rows.length - 1;
      let hit = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rows[mid].offsetTop + rows[mid].offsetHeight > el.scrollTop) {
          hit = mid;
          hi = mid - 1;
        } else lo = mid + 1;
      }
      if (hit >= 0) setVisibleMonth(monthOfWeek(rows[hit].dataset.week!));
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
    <div className="cal" ref={wrapRef} data-lo={Math.floor(level)} data-hi={Math.ceil(level)}>
      <div className="cal-head">
        <div className="cal-title-row">
          <h2 className="cal-title">
            {monthName}
            {String(year) !== now.slice(0, 4) && <small>{year}</small>}
          </h2>
          <div className="cal-note">
            {layers.map((l, i) => (
              <span key={i}>{l.title?.(visibleMonth)}</span>
            ))}
          </div>
          <div className="cal-tools">
            <button className={`icon-btn${filter.length ? ' filtering' : ''}`} aria-label="Filter the calendar" aria-pressed={filtersOpen} onClick={() => setFiltersOpen((o) => !o)}>
              <FilterIcon />
            </button>
          </div>
        </div>
        {filtersOpen && (
          <div className="cal-filters" role="group" aria-label="Show">
            <button className="chip" aria-pressed={filter.length === 0} onClick={() => setFilter([])}>
              All
            </button>
            {FILTER_KINDS.map((k) => (
              <button key={k.id} className={`chip chip-kind kind-${k.id}`} aria-pressed={filter.includes(k.id)} onClick={() => setFilter(toggleKind(filter, k.id))}>
                {k.label}
              </button>
            ))}
          </div>
        )}
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
              <WeekRow start={start}>
                {() =>
                  days.map((date) => (
                    <DayCell
                      key={date}
                      date={date}
                      isToday={date === now}
                      wear={wearDays.get(date)}
                      planned={planned.get(date)}
                      trips={tripsOnDate(trips, date)}
                      dayCountries={dayCountries}
                      homeOn={homeOn}
                      layers={layers}
                      filter={filter}
                      items={items}
                      onClick={(e) => openDay(e, date)}
                    />
                  ))
                }
              </WeekRow>
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
  dayCountries: ReadonlyMap<string, string[]>;
  homeOn?: HomeOn;
  layers: CalendarLayer[];
  filter: string[];
  items: ClothingItem[];
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * One week of the list. The list holds every week of the history (years of them), so a week's days exist only while
 * it is within a few screens of the view: built on the way in, dropped on the way out, which keeps the page small
 * however far back you scroll. Otherwise the row is an empty box of exactly the same height (CSS, from --row-h), so
 * positions, scrolling and zooming don't depend on which weeks are built.
 */
function WeekRow({ start, children }: { start: string; children: () => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    // A low-priority update: React builds the weeks between frames instead of inside a scroll frame.
    const io = new IntersectionObserver((entries) => startTransition(() => setBuilt(entries[entries.length - 1].isIntersecting)), {
      root: el.closest('.cal-scroll'),
      rootMargin: '1000px 0px',
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`cal-week${built ? '' : ' cal-week-blank'}`} role="row" data-week={start}>
      {built ? children() : null}
    </div>
  );
}

/**
 * A day shows all three zoom levels at once, stacked: --z (set on the calendar) fades dots into a photo with
 * badges and then into labelled pills, so zooming can run continuously.
 */
/**
 * A day only redraws when what it shows changes: scrolling changes the month label above the list, which used to
 * redraw every built day. `onClick` is left out of the comparison: it only reads the same things the props carry.
 */
const DayCell = memo(DayCellView, (a, b) => {
  const { trips: at, onClick: _a, ...ar } = a;
  const { trips: bt, onClick: _b, ...br } = b;
  return (Object.keys(ar) as (keyof typeof ar)[]).every((k) => ar[k] === br[k]) && at.length === bt.length && at.every((t, i) => t === bt[i]);
});

function DayCellView({ date, isToday, wear: allWear, planned: allPlanned, trips: allTrips, dayCountries, homeOn, layers, filter, items, onClick }: CellProps) {
  const marks = layers.flatMap((l) => {
    const mark = l.mark?.(date);
    return mark && isShown(filter, kindOfTone(mark.tone)) ? [mark] : [];
  });
  const wear = isShown(filter, 'outfit') ? allWear : undefined;
  const planned = isShown(filter, 'outfit') ? allPlanned : undefined;
  const trips = isShown(filter, 'trip') ? allTrips : [];
  const hasOutfit = !!wear || !!planned?.length;
  const outfit = wear?.outfits[0];
  const lone = wear?.items[0];
  const extra = wear ? wear.outfits.length + wear.items.length - 1 : 0;
  // A day never shows more than a few things in a row: the rest is a "+N". The full list is on the day screen.
  const dotMarks = marks.slice(0, MAX_DOTS - (hasOutfit ? 1 : 0) - (trips.length ? 1 : 0));
  const dotsHidden = marks.length - dotMarks.length;
  // The 3×3 grid: the day number sits in the first cell and the first row stays empty until the six cells below
  // it are used; then the two cells next to the number fill, and the last one counts the rest.
  const icons: ReactNode[] = [];
  if (hasOutfit)
    icons.push(
      <span className="cell">
        <DayBubble wear={wear} planned={planned} items={items} />
      </span>,
    );
  marks.forEach((m) =>
    icons.push(
      <span className={`cell day-badge mark-${m.tone}`} role="img" aria-label={m.label}>
        {m.icon}
      </span>,
    ),
  );
  // A trip is a line through the day numbers with its flag on it, in the row beside the number, so the icons keep to
  // the two rows below it (six cells) on those days.
  const trip = trips[0];
  const flags = trip ? flagsToShow(trip, date, dayCountries, homeOn?.(date)) : { codes: [], unknown: false };
  // A trip you haven't confirmed gets one faded flag: the country it is in, not each border you crossed.
  const flagCodes = trip && isUnconfirmedTrip(trip) ? flags.codes.slice(0, 1) : flags.codes;
  const shape = trip ? tripDayShape(trip, date) : undefined;
  const showFlag = flagCodes.length > 0 || flags.unknown;
  const flagText = flagCodes.map((c) => flagEmoji(c) ?? '').join('') || '🧳';
  const flagMulti = flagCodes.length > 1 ? ' multi' : '';
  const capacity = trip ? 6 : CELLS;
  const iconsHidden = icons.length > capacity ? icons.length - (capacity - 1) : 0;
  const shownIcons = iconsHidden ? icons.slice(0, capacity - 1) : icons;
  const cellAt = (i: number) => (i < 6 ? { gridRow: 2 + Math.floor(i / 3), gridColumn: 1 + (i % 3) } : { gridRow: 1, gridColumn: i - 4 });
  // Pills, outfit first: at most MAX_PILLS, then one that counts the rest.
  const pills: ReactNode[] = [];
  const dayPieces = wear ? (wear.outfits.length ? outfitPieces(wear.outfits[0], items) : wear.items) : planned?.length ? outfitPieces(planned[0], items) : [];
  if (wear || planned?.length) {
    pills.push(
      <span key="outfit" className={`pill pill-outfit pill-photo${wear ? '' : ' planned'}`} aria-label={wear ? (outfit ? outfitName(outfit) : lone?.name) : outfitName(planned![0])}>
        <Collage pieces={dayPieces} />
        {extra > 0 && <b className="pill-plus">+{extra}</b>}
      </span>,
    );
  }
  // Where you worked is only an icon, in the corner beside the number.
  const workMark = marks.find((m) => WORK_TONES.includes(m.tone));
  marks.forEach((m, i) => {
    if (m !== workMark) pills.push(<MarkPill key={i} mark={m} />);
  });
  // The week zoom lists everything: each outfit, piece, trip and entry of a module on its own line.
  const full: ReactNode[] = [];
  const fullPill = (key: string, tone: string, icon: ReactNode, text: string) =>
    full.push(
      <span key={key} className={`pill ${tone}`}>
        <span className="pill-icon">{icon}</span>
        <span className="pill-text">{text}</span>
      </span>,
    );
  const fullTile = (key: string, name: string, pieces: ClothingItem[], isPlan = false) =>
    full.push(
      <span key={key} className={`pill pill-outfit pill-photo${isPlan ? ' planned' : ''}`} aria-label={name}>
        <Collage pieces={pieces} />
      </span>,
    );
  if (wear) {
    wear.outfits.forEach((o) => fullTile(`o${o.id}`, outfitName(o), outfitPieces(o, items)));
    if (wear.items.length) fullTile('items', wear.items.map((i) => i.name).join(', '), wear.items);
  } else if (planned?.length) planned.forEach((o) => fullTile(`p${o.id}`, outfitName(o), outfitPieces(o, items), true));
  marks.forEach((m, i) => {
    if (m === workMark) return;
    (m.tiles?.length ? m.tiles : [m.label]).forEach((t, j) => fullPill(`m${i}-${j}`, `mark-${m.tone}`, m.icon, t));
  });
  const fullHidden = full.length > MAX_FULL ? full.length - (MAX_FULL - 1) : 0;
  const pillsHidden = pills.length > MAX_PILLS ? pills.length - (MAX_PILLS - 1) : 0;
  const shownPills = pillsHidden ? pills.slice(0, MAX_PILLS - 1) : pills;
  return (
    <a role="gridcell" className={`cal-day${isToday ? ' today' : ''}${trip ? ' in-trip' : ''}${trip && isUnconfirmedTrip(trip) ? ' trip-pending' : ''}${hasOutfit || marks.length > 0 || trips.length > 0 ? ' has-cells' : ''}`} href={href(`/calendar/${date}`)} aria-label={date} onClick={onClick}>
      {/* The same line and flag for the zoomed-out and zoomed-in looks, where the number is not in the grid. */}
      {shape && <i className={`trip-line trip-line-num ${shape.line}${shape.end ? ' end' : ''}`} aria-hidden />}
      {shape?.end && <i className="trip-end-dot trip-end-dot-num" aria-hidden />}
      <span className={`cal-num${shape?.start ? ' trip-start' : ''}`}>{Number(date.slice(8))}</span>
      {trip && showFlag && (
        <span className={`trip-flag trip-flag-num${flagMulti}`} role="img" aria-label={`${isUnconfirmedTrip(trip) ? 'Trip to confirm' : 'Trip'}: ${trip.name}`}>
          {flagText}
        </span>
      )}
      {(hasOutfit || marks.length > 0 || trips.length > 0) && (
        <>
          <span className="cal-layer cal-dots">
            {hasOutfit && <i className={`dot dot-outfit${wear ? '' : ' planned'}`} />}
            {dotMarks.map((m, i) => (
              <i key={i} className={`dot mark-${m.tone}`} title={m.label} />
            ))}
            {trips.length > 0 && <i className="dot dot-trip" />}
            {dotsHidden > 0 && <b className="more-count">+{dotsHidden}</b>}
          </span>
          <span className="cal-layer cal-cells">
            {shape && <i className={`trip-line ${shape.line}${shape.end ? ' end' : ''}`} aria-hidden />}
            {shape?.end && <i className="trip-end-dot" aria-hidden />}
            <span className={`cell-num${isToday ? ' today' : ''}${shape?.start ? ' trip-start' : ''}`}>{Number(date.slice(8))}</span>
            {trip && showFlag && (
              <span className={`cell-slot trip-flag${flagMulti}`} style={{ gridRow: 1, gridColumn: flagCodes.length > 1 ? '2 / span 2' : 2 }} role="img" aria-label={`${isUnconfirmedTrip(trip) ? 'Trip to confirm' : 'Trip'}: ${trip.name}`}>
                {flagText}
              </span>
            )}
            {shownIcons.map((el, i) => (
              <span key={i} className="cell-slot" style={cellAt(i)}>
                {el}
              </span>
            ))}
            {iconsHidden > 0 && (
              <span className="cell-slot" style={cellAt(capacity - 1)}>
                <span className="cell day-badge badge-more" role="img" aria-label={`${iconsHidden} more`}>
                  +{iconsHidden}
                </span>
              </span>
            )}
          </span>
          {workMark && (
            <span className={`cal-layer cal-work day-badge mark-${workMark.tone}`} role="img" aria-label={workMark.label}>
              {workMark.icon}
            </span>
          )}
          <span className="cal-layer cal-pills">
            {shownPills}
            {pillsHidden > 0 && (
              <span className="pill pill-more" aria-label={`${pillsHidden} more`}>
                +{pillsHidden} more
              </span>
            )}
          </span>
          <span className="cal-layer cal-full">
            {fullHidden ? full.slice(0, MAX_FULL - 1) : full}
            {fullHidden > 0 && <span className="pill pill-more">+{fullHidden} more</span>}
          </span>
        </>
      )}
    </a>
  );
}

/** At most this many dots, grid icons (the last one a "+N" when there are more) and labelled pills fit in a day. */
const MAX_DOTS = 4;
const CELLS = 8;
const WORK_TONES = ['office', 'home', 'off'];
const MAX_PILLS = 5;
const MAX_FULL = 10;

/** A module's mark at full zoom: one pill. Marks with several entries (`tiles`) show the first and how many more. */
function MarkPill({ mark: m }: { mark: DayMark }) {
  const text = m.tiles?.length ? `${m.tiles[0]}${m.tiles.length > 1 ? ` +${m.tiles.length - 1}` : ''}` : m.label;
  return (
    <span className={`pill mark-${m.tone}`}>
      <span className="pill-icon">{m.icon}</span>
      <span className="pill-text">{text}</span>
    </span>
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

/** The pieces of an outfit as a small collage (up to four), in place of its name. */
function Collage({ pieces }: { pieces: ClothingItem[] }) {
  const shown = collagePieces(pieces, 3);
  return <span className="collage">{shown.map((p) => <ItemThumb key={p.id} item={p} />)}</span>;
}
