import type { ReactNode } from 'react';
import { BuildingIcon, ClockIcon, HomeIcon, PalmIcon, SuitcaseIcon, UndoIcon } from '../../icons';
import { today } from '../../lib/format';
import type { OffReason, WorkDay, WorkStatus } from './types';
import type { DayInfo } from './work';

export const STATUS_ICONS: Record<WorkStatus, ReactNode> = {
  office: <BuildingIcon />,
  home: <HomeIcon />,
  off: <PalmIcon />,
  trip: <SuitcaseIcon />,
};
export const STATUS_LABELS: Record<WorkStatus, string> = { office: 'Office', home: 'Home', off: 'Day off', trip: 'Work trip' };
export const REASON_LABELS: Record<OffReason, string> = { holiday: 'Holiday', leave: 'Leave', absence: 'Absence' };
const ORDER: WorkStatus[] = ['office', 'home', 'trip', 'off'];

/** Current local time as HH:MM. */
function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  date: string;
  info?: DayInfo;
  /** The record set by hand (or imported) for this day, if any. */
  day?: WorkDay;
  onSave: (day: WorkDay) => Promise<void>;
  onClear: (id: string) => Promise<void>;
}

/**
 * Where you worked on a day, on the calendar's day screen. A tap sets it by hand,
 * and the times can be entered here too (home days have no badge). The undo icon
 * goes back to the check-ins.
 */
export function WorkDaySection({ date, info, day, onSave, onClear }: Props) {
  const status = info?.status;
  const isToday = date === today();

  // Spreads the existing record so fields the edit doesn't touch survive; any
  // hand edit also detaches the day from the badge report it came from.
  const save = (patch: Partial<WorkDay> & { status: WorkStatus }) => {
    const { source: _source, ...rest } = day ?? {};
    const next: WorkDay = { ...rest, ...patch, id: date, updatedAt: new Date().toISOString() };
    if (next.status !== 'off') delete next.reason;
    return onSave(next);
  };
  const setTime = (field: 'arrive' | 'leave', value: string) => {
    if (!status) return;
    const next = { ...day, status, [field]: value || undefined };
    if (!value) delete next[field];
    return save(next);
  };

  const times: { field: 'arrive' | 'leave'; label: string; value?: string }[] = [
    { field: 'arrive', label: 'Start', value: info?.arrive },
    { field: 'leave', label: 'End', value: info?.leave },
  ];

  const source = info?.manual
    ? day?.source === 'report'
      ? 'From your badge report.'
      : day?.source === 'swarm'
        ? 'From your Swarm check-ins.'
        : 'Set by hand.'
    : status
      ? 'From your check-ins.'
      : 'Nothing recorded for this day.';
  const showTimes = !!status && status !== 'off';
  // The clock button fills in the first empty time with now (today only).
  const nowField = !info?.arrive ? 'arrive' : 'leave';

  return (
    <section className="work-quick widget-full" aria-label="Work" title={source}>
      <div className="work-quick-row" role="group" aria-label="Where did you work?">
        {ORDER.map((s) => {
          const label = s === 'off' && info?.reason ? REASON_LABELS[info.reason] : STATUS_LABELS[s];
          return (
            <button key={s} className="work-quick-btn" aria-pressed={status === s} aria-label={label} onClick={() => save({ status: s })}>
              {STATUS_ICONS[s]}
              {status === s && <span>{label}</span>}
            </button>
          );
        })}
      </div>
      {showTimes && (
        <div className="work-quick-times">
          {times.map(({ field, label, value }) => (
            <input key={field} type="time" aria-label={label} value={value ?? ''} onChange={(e) => setTime(field, e.target.value)} />
          ))}
          {isToday && (
            <button className="icon-btn" onClick={() => setTime(nowField, nowTime())} aria-label={`Set ${nowField === 'arrive' ? 'start' : 'end'} to now`}>
              <ClockIcon />
            </button>
          )}
          {info?.manual && (
            <button className="icon-btn" onClick={() => onClear(date)} aria-label={`${source} Clear and go back to check-ins`}>
              <UndoIcon />
            </button>
          )}
        </div>
      )}
      {!showTimes && info?.manual && (
        <button className="icon-btn work-quick-undo" onClick={() => onClear(date)} aria-label={`${source} Clear and go back to check-ins`}>
          <UndoIcon />
        </button>
      )}
    </section>
  );
}
