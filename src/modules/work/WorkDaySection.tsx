import type { ReactNode } from 'react';
import { BuildingIcon, HomeIcon, PalmIcon, UndoIcon } from '../../icons';
import type { WorkDay, WorkStatus } from './types';
import type { DayInfo } from './work';

export const STATUS_ICONS: Record<WorkStatus, ReactNode> = {
  office: <BuildingIcon />,
  home: <HomeIcon />,
  off: <PalmIcon />,
};
export const STATUS_LABELS: Record<WorkStatus, string> = { office: 'Office', home: 'Home', off: 'Day off' };
const ORDER: WorkStatus[] = ['office', 'home', 'off'];

interface Props {
  date: string;
  info?: DayInfo;
  onSave: (day: WorkDay) => Promise<void>;
  onClear: (id: string) => Promise<void>;
}

/** Where you worked on a day, on the calendar's day screen. A tap sets it by hand; the undo icon goes back to the check-ins. */
export function WorkDaySection({ date, info, onSave, onClear }: Props) {
  const status = info?.status;
  return (
    <section className="work-day-section">
      <h2>Work</h2>
      <div className="work-choices" role="group" aria-label="Where did you work?">
        {ORDER.map((s) => (
          <button
            key={s}
            className="work-choice"
            aria-pressed={status === s}
            onClick={() => onSave({ id: date, status: s, updatedAt: new Date().toISOString() })}
          >
            {STATUS_ICONS[s]}
            <span>{STATUS_LABELS[s]}</span>
          </button>
        ))}
      </div>
      <p className="muted small work-source">
        {info?.manual ? 'Set by hand.' : status ? 'From your check-ins.' : 'Nothing recorded for this day.'}
        {info?.arrive && ` Arrived ${info.arrive}.`}
        {info?.leave && ` Left ${info.leave}.`}
        {info?.manual && (
          <button className="icon-btn" onClick={() => onClear(date)} aria-label="Clear and go back to check-ins">
            <UndoIcon />
          </button>
        )}
      </p>
    </section>
  );
}
