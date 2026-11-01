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
export const STATUS_LABELS: Record<WorkStatus, string> = { office: 'Office', home: 'Home', off: 'Day off', trip: 'Trip' };
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

  return (
    <section className="work-day-section">
      <h2>Work</h2>
      <div className="work-choices" role="group" aria-label="Where did you work?">
        {ORDER.map((s) => (
          <button key={s} className="work-choice" aria-pressed={status === s} onClick={() => save({ status: s })}>
            {STATUS_ICONS[s]}
            <span>{s === 'off' && info?.reason ? REASON_LABELS[info.reason] : STATUS_LABELS[s]}</span>
          </button>
        ))}
      </div>
      {status !== 'off' && (
        <div className="work-times-row">
          {times.map(({ field, label, value }) => (
            <div key={field} className="work-time">
              <label>
                <span className="muted small">{label}</span>
                <input type="time" value={value ?? ''} disabled={!status} onChange={(e) => setTime(field, e.target.value)} />
              </label>
              {isToday && (
                <button className="icon-btn" disabled={!status} onClick={() => setTime(field, nowTime())} aria-label={`Set ${label.toLowerCase()} to now`}>
                  <ClockIcon />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="muted small work-source">
        {info?.manual ? (day?.source === 'report' ? 'From your badge report.' : day?.source === 'swarm' ? 'From your Swarm check-ins.' : 'Set by hand.') : status ? 'From your check-ins.' : 'Nothing recorded for this day.'}
        {!status && ' Choose where you worked to add times.'}
        {info?.manual && (
          <button className="icon-btn" onClick={() => onClear(date)} aria-label="Clear and go back to check-ins">
            <UndoIcon />
          </button>
        )}
      </p>
    </section>
  );
}
