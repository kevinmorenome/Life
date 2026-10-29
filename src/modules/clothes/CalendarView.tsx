import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { today } from '../../lib/format';
import { CalendarIcon, PlusIcon, ShirtIcon, ZoomInIcon, ZoomOutIcon } from '../../icons';
import { href, navigate } from '../../lib/router';
import type { CalendarLayer } from '../types';
import { tripsOnDate } from '../packing/packing';
import type { Trip } from '../packing/types';
import { addMonths, wearsByDay, type DayWear } from './calendar';
import { monthOfWeek, pinchStep, stepZoom, weekDays, weekStarts, ZOOMS, type Zoom } from './calendarZoom';
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
let savedZoom: Zoom | undefined;
let savedScroll: number | undefined;

function loadZoom(): Zoom {
  if (savedZoom) return savedZoom;
  try {
    const v = localStorage.getItem(ZOOM_KEY);
    if (ZOOMS.some((z) => z === v)) return v as Zoom;
  } catch {
    // Storage can be blocked; the default is fine.
  }
  return 'standard';
}

export function CalendarView({ month, items, outfits, trips = [], plans = [], layers = [] }: Props) {
  const now = today();
  const nowMonth = now.slice(0, 7);
  const [zoom, setZoomState] = useState<Zoom>(loadZoom);
  const [visibleMonth, setVisibleMonth] = useState(month ?? nowMonth);
  const wearDays = useMemo(() => wearsByDay(items, outfits), [items, outfits]);
  const planned = useMemo(() => plannedByDay(plans, outfits), [plans, outfits]);

  // From two years back (your history) to a year ahead, widened to include a month asked for.
  const weeks = useMemo(
    () => weekStarts(month && month < addMonths(nowMonth, -24) ? month : addMonths(nowMonth, -24), month && month > addMonths(nowMonth, 12) ? addMonths(month, 3) : addMonths(nowMonth, 12)),
    [month, nowMonth],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ week: string; offset: number } | null>(null);

  const rowOf = (week: string) => scrollRef.current?.querySelector<HTMLElement>(`[data-week="${week}"]`) ?? null;
  const labelOf = (week: string) => scrollRef.current?.querySelector<HTMLElement>(`[data-label="${week}"]`) ?? null;

  /** The first week row (and how far below the top it sits) that is at least partly in view. */
  const firstVisible = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return null;
    for (const week of weeks) {
      const row = rowOf(week);
      if (row && row.offsetTop + row.offsetHeight > el.scrollTop) return { week, offset: row.offsetTop - el.scrollTop };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeks]);

  const setZoom = useCallback(
    (dir: 1 | -1) => {
      setZoomState((z) => {
        const next = stepZoom(z, dir);
        if (next !== z) {
          anchor.current = firstVisible();
          savedZoom = next;
          try {
            localStorage.setItem(ZOOM_KEY, next);
          } catch {
            // Not remembered; fine.
          }
        }
        return next;
      });
    },
    [firstVisible],
  );

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
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  // Keep the same week in view when the rows change height.
  useLayoutEffect(() => {
    const a = anchor.current;
    const el = scrollRef.current;
    anchor.current = null;
    if (!a || !el) return;
    const row = rowOf(a.week);
    if (row) el.scrollTop = row.offsetTop - a.offset;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);

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
      const first = firstVisible();
      if (first) setVisibleMonth(monthOfWeek(first.week));
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
  }, [firstVisible, zoom]);

  // Pinch to zoom: two fingers (or ctrl + wheel / trackpad pinch) change how much each day shows.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let start = 0;
    const distance = (e: TouchEvent) => Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    const onStart = (e: TouchEvent) => {
      start = e.touches.length === 2 ? distance(e) : 0;
    };
    const onMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !start) return;
      e.preventDefault();
      const dir = pinchStep(start, distance(e));
      if (dir) {
        setZoom(dir);
        start = distance(e);
      }
    };
    const onEnd = () => {
      start = 0;
    };
    let wheel = 0;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      wheel += e.deltaY;
      if (Math.abs(wheel) > 40) {
        setZoom(wheel < 0 ? 1 : -1);
        wheel = 0;
      }
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
    };
  }, [setZoom]);

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
    <div className={`cal cal-${zoom}`} ref={wrapRef}>
      <div className="cal-head" ref={headRef}>
        <div className="cal-title-row">
          <h2 className="cal-title">
            {monthName}
            {String(year) !== now.slice(0, 4) && <small>{year}</small>}
          </h2>
          <div className="cal-tools">
            <button className="icon-btn" aria-label="Zoom out" disabled={zoom === ZOOMS[0]} onClick={() => setZoom(-1)}>
              <ZoomOutIcon />
            </button>
            <button className="icon-btn" aria-label="Zoom in" disabled={zoom === ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom(1)}>
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
                    zoom={zoom}
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
  zoom: Zoom;
  isToday: boolean;
  wear?: DayWear;
  planned?: Outfit[];
  trips: Trip[];
  layers: CalendarLayer[];
  items: ClothingItem[];
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}

function DayCell({ date, zoom, isToday, wear, planned, trips, layers, items, onClick }: CellProps) {
  const marks = layers.flatMap((l) => {
    const mark = l.mark?.(date);
    return mark ? [mark] : [];
  });
  const num = <span className="cal-num">{Number(date.slice(8))}</span>;
  const cls = `cal-day${isToday ? ' today' : ''}${date.endsWith('-01') ? ' first' : ''}`;
  const link = (children: React.ReactNode) => (
    <a role="gridcell" className={cls} href={href(`/calendar/${date}`)} aria-label={date} onClick={onClick}>
      {children}
    </a>
  );

  if (zoom === 'compact') {
    return link(
      <>
        {num}
        <span className="cal-dots">
          {(wear || planned?.length) && <i className={`dot dot-outfit${wear ? '' : ' planned'}`} />}
          {marks.map((m, i) => (
            <i key={i} className={`dot mark-${m.tone}`} title={m.label} />
          ))}
          {trips.length > 0 && <i className="dot dot-trip" />}
        </span>
      </>,
    );
  }

  if (zoom === 'standard') {
    return link(
      <>
        <DayBubble wear={wear} planned={planned} items={items} />
        {num}
        {marks.map((m, i) => (
          <span key={i} className={`day-badge mark-${m.tone}`} role="img" aria-label={m.label}>
            {m.icon}
          </span>
        ))}
        {trips.length > 0 && <i className="trip-dot" />}
      </>,
    );
  }

  const outfit = wear?.outfits[0];
  const lone = wear?.items[0];
  const extra = wear ? wear.outfits.length + wear.items.length - 1 : 0;
  return link(
    <>
      {num}
      <span className="cal-pills">
        {marks.map((m, i) => (
          <span key={i} className={`pill mark-${m.tone}`}>
            <span className="pill-icon">{m.icon}</span>
            {m.detail ?? m.label}
          </span>
        ))}
        {wear && (
          <span className="pill pill-outfit">
            <DayBubble wear={wear} items={items} />
            <span className="pill-text">{outfit ? outfitName(outfit) : lone?.name}{extra > 0 && ` +${extra}`}</span>
          </span>
        )}
        {!wear && planned && planned.length > 0 && <span className="pill pill-outfit planned">{outfitName(planned[0])}</span>}
        {trips.map((t) => (
          <span key={t.id} className="pill pill-trip">
            🧳 {t.name}
          </span>
        ))}
      </span>
    </>,
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
