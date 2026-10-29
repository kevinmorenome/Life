import type { ReactNode } from 'react';
import { BuildingIcon, HomeIcon, PalmIcon, UndoIcon } from '../../icons';
import { href, navigate } from '../../lib/router';
import type { WorkDay, WorkStatus } from './types';
import type { DayInfo } from './work';

const CHOICES: { status: WorkStatus; label: string; icon: ReactNode }[] = [
  { status: 'office', label: 'Office', icon: <BuildingIcon /> },
  { status: 'home', label: 'Home', icon: <HomeIcon /> },
  { status: 'off', label: 'Day off', icon: <PalmIcon /> },
];

interface Props {
  date: string;
  info?: DayInfo;
  onSave: (day: WorkDay) => Promise<void>;
  onClear: (id: string) => Promise<void>;
}

export function DayView({ date, info, onSave, onClear }: Props) {
  const title = new Date(date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const back = `/work/calendar/${date.slice(0, 7)}`;
  const status = info?.status;

  async function choose(next: WorkStatus) {
    await onSave({ id: date, status: next, updatedAt: new Date().toISOString() });
    navigate(back);
  }
  async function clear() {
    await onClear(date);
    navigate(back);
  }

  return (
    <>
      <div className="day-head">
        <a className="btn btn-ghost" href={href(back)} aria-label="Back to the month">
          ‹
        </a>
        <h1>{title}</h1>
        <span style={{ width: 44 }} />
      </div>

      <div className="work-choices" role="group" aria-label="Where did you work?">
        {CHOICES.map((c) => (
          <button key={c.status} className="work-choice" aria-pressed={status === c.status} onClick={() => choose(c.status)}>
            {c.icon}
            <span>{c.label}</span>
          </button>
        ))}
      </div>

      <p className="muted small work-source">
        {info?.manual
          ? 'Set by hand.'
          : status
            ? 'From your check-ins.'
            : 'Nothing recorded for this day.'}
        {info?.manual && (
          <button className="icon-btn" onClick={clear} aria-label="Clear and go back to check-ins">
            <UndoIcon />
          </button>
        )}
      </p>
      {(info?.arrive || info?.leave) && (
        <dl className="rows">
          {info.arrive && (
            <div>
              <dt>Arrived</dt>
              <dd>{info.arrive}</dd>
            </div>
          )}
          {info.leave && (
            <div>
              <dt>Left</dt>
              <dd>{info.leave}</dd>
            </div>
          )}
        </dl>
      )}
    </>
  );
}
