import { useEffect, useRef, useState } from 'react';
import { ClockIcon, PhoneIcon } from '../../icons';
import { CloseIcon } from '../clothes/icons';
import { useSettings } from '../../lib/settings';
import { alarmUrl } from './alarm';
import { clock, shortcutTimerUrl, type StepTimer } from './cooking';

/** A timer started from a step. Counting down from `endsAt`, or paused with `left` seconds; `done` once it ran out. */
export interface RunningTimer {
  id: string;
  /** The step it came from (1-based), shown on the pill. */
  step: number;
  seconds: number;
  label: string;
  endsAt?: number;
  left?: number;
  done?: boolean;
  /** The alarm of a timer that ran out was stopped. */
  silenced?: boolean;
}

/**
 * The timers of a cooking session: they keep counting while you move between steps (and while the app is in the
 * background, since they count to a time, not by ticks). When one runs out the alarm rings (`alarm.ts`, looping) and
 * the phone buzzes every couple of seconds until you Stop it or add a minute; `ringing` is what still rings.
 */
export function useCookTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const sound = useRef<HTMLAudioElement | undefined>(undefined);
  const running = timers.some((t) => t.endsAt && !t.done);
  const ringing = timers.filter((t) => t.done && !t.silenced);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  // Mark the ones that ran out.
  useEffect(() => {
    const out = timers.filter((t) => t.endsAt && !t.done && t.endsAt <= now);
    if (!out.length) return;
    setTimers((cur) => cur.map((t) => (out.some((o) => o.id === t.id) ? { ...t, done: true, endsAt: undefined, left: 0 } : t)));
  }, [now, timers]);

  // Ring while any timer is done and not stopped: the looping alarm, and a buzz every 2 s where the phone can.
  const isRinging = ringing.length > 0;
  useEffect(() => {
    if (!isRinging) return;
    const a = sound.current;
    if (a) {
      a.currentTime = 0;
      a.loop = true;
      void a.play().catch(() => {});
    }
    const buzz = () => navigator.vibrate?.([400, 200, 400]);
    buzz();
    const id = setInterval(buzz, 2000);
    return () => {
      clearInterval(id);
      a?.pause();
      navigator.vibrate?.(0);
    };
  }, [isRinging]);

  useEffect(() => () => sound.current?.pause(), []);

  const start = (step: number, t: StepTimer) => {
    // Made and started on this tap, while the browser allows sound, so it can ring later without one (iPhone).
    try {
      if (!sound.current) {
        const a = new Audio(alarmUrl());
        a.preload = 'auto';
        sound.current = a;
      }
      const a = sound.current;
      a.muted = true;
      void a
        .play()
        .then(() => {
          a.pause();
          a.currentTime = 0;
          a.muted = false;
        })
        .catch(() => {
          a.muted = false;
        });
    } catch {
      // No sound then; the buzz and the "Time's up" screen still say it.
    }
    setNow(Date.now());
    setTimers((cur) => [...cur, { id: `${step}-${t.seconds}-${Date.now()}`, step, seconds: t.seconds, label: t.label, endsAt: Date.now() + t.seconds * 1000 }]);
  };
  const toggle = (id: string) =>
    setTimers((cur) =>
      cur.map((t) => {
        if (t.id !== id || t.done) return t;
        return t.endsAt ? { ...t, endsAt: undefined, left: (t.endsAt - Date.now()) / 1000 } : { ...t, endsAt: Date.now() + (t.left ?? 0) * 1000, left: undefined };
      }),
    );
  const remove = (id: string) => setTimers((cur) => cur.filter((t) => t.id !== id));
  /** Stops the alarm of a timer that ran out; it stays as "Done!" until you clear it. */
  const silence = (id: string) => setTimers((cur) => cur.map((t) => (t.id === id ? { ...t, silenced: true } : t)));
  /** A finished timer runs again for `seconds` more (snooze); it stays the same step's timer (`seconds` is how it was started). */
  const extend = (id: string, seconds: number) => {
    setNow(Date.now());
    setTimers((cur) => cur.map((t) => (t.id === id ? { ...t, done: false, silenced: false, left: undefined, endsAt: Date.now() + seconds * 1000 } : t)));
  };
  /** When a step's timer was sent to the iPhone: the time it rings there, by `${step}-${seconds}` (this visit only). */
  const [onPhone, setOnPhone] = useState<Record<string, number>>({});
  const sentToPhone = (step: number, seconds: number) => setOnPhone((cur) => ({ ...cur, [`${step}-${seconds}`]: Date.now() + seconds * 1000 }));
  const leftOf = (t: RunningTimer) => (t.done ? 0 : t.endsAt ? (t.endsAt - now) / 1000 : t.left ?? 0);
  return { timers, ringing, start, toggle, remove, silence, extend, leftOf, onPhone, sentToPhone };
}

export type CookTimers = ReturnType<typeof useCookTimers>;

/**
 * Timers from other steps, as glass pills under the progress dots, so you see them wherever you are: tap one to pause
 * or go on, ✕ to drop it. The current step's own timers are on its card instead (`except`).
 */
export function TimerStrip({ timers: t, except }: { timers: CookTimers; except?: number }) {
  const shown = t.timers.filter((x) => x.step !== except);
  if (!shown.length) return null;
  return (
    <div className="cook-timers" role="status" aria-live="polite">
      {shown.map((x) => (
        <span key={x.id} className={`recipe-glass cook-timer${x.done ? ' is-done' : x.endsAt ? '' : ' is-paused'}`}>
          <button type="button" className="cook-timer-main" onClick={() => t.toggle(x.id)} aria-label={x.done ? `Step ${x.step} timer done` : `${x.endsAt ? 'Pause' : 'Resume'} the step ${x.step} timer, ${clock(t.leftOf(x))} left`}>
            <ClockIcon />
            <span className="cook-timer-step">Step {x.step}</span>
            <strong>{x.done ? 'Done!' : clock(t.leftOf(x))}</strong>
            {!x.done && !x.endsAt && <span className="cook-timer-step">paused</span>}
          </button>
          <button type="button" className="cook-timer-x" onClick={() => t.remove(x.id)} aria-label={`Remove the step ${x.step} timer`}>
            <CloseIcon />
          </button>
        </span>
      ))}
    </div>
  );
}

/**
 * A step's timer as a card: what it is for, the big countdown, a bar that fills as it runs, and Start, then Pause /
 * Resume and Reset. It is the same timer as the pill other steps show, so it keeps going when you move on.
 */
export function StepTimerCard({ step, timer, timers: t }: { step: number; timer: StepTimer; timers: CookTimers }) {
  const { settings } = useSettings();
  if (settings.iphoneTimer) return <PhoneTimerCard step={step} timer={timer} timers={t} />;
  const x = t.timers.find((r) => r.step === step && r.seconds === timer.seconds);
  const left = x ? t.leftOf(x) : timer.seconds;
  // A snoozed timer can have more left than it started with; the bar then just starts over from empty.
  const done = Math.min(1, Math.max(0, 1 - left / Math.max(timer.seconds, left)));
  return (
    <div className={`cook-card cook-timer-card${x?.done ? ' is-done' : ''}`} role="timer" aria-label={`Timer for ${timer.label}`}>
      <div className="cook-card-head">
        <h2>
          <ClockIcon /> Cooking timer
        </h2>
        <span className="cook-card-label">{timer.label}</span>
      </div>
      <p className="cook-clock">{x?.done ? 'Done!' : clock(left)}</p>
      <span className="cook-bar-track" aria-hidden="true">
        <span style={{ width: `${done * 100}%` }} />
      </span>
      <div className="cook-timer-actions">
        {!x ? (
          <button type="button" className="btn cook-timer-btn" onClick={() => t.start(step, timer)}>
            Start timer
          </button>
        ) : (
          <>
            {x.done && !x.silenced && (
              <button type="button" className="btn btn-primary cook-timer-btn" onClick={() => t.silence(x.id)}>
                Stop alarm
              </button>
            )}
            {!x.done && (
              <button type="button" className="btn cook-timer-btn" onClick={() => t.toggle(x.id)}>
                {x.endsAt ? 'Pause' : 'Resume'}
              </button>
            )}
            <button type="button" className="btn btn-ghost cook-timer-btn" onClick={() => t.remove(x.id)}>
              {x.done ? 'Clear' : 'Reset'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A step's timer when the iPhone timer is set up (Settings → iPhone timer): no countdown in the app, just the length
 * and Start on iPhone, which runs the "Life timer" Shortcut so the phone's own Clock timer rings. Afterwards it says
 * when it rings there; tapping again sends it again (the iPhone keeps one timer, so a new one replaces it).
 */
function PhoneTimerCard({ step, timer, timers: t }: { step: number; timer: StepTimer; timers: CookTimers }) {
  const ringsAt = t.onPhone[`${step}-${timer.seconds}`];
  const at = ringsAt ? new Date(ringsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  return (
    <div className="cook-card cook-timer-card" aria-label={`Timer for ${timer.label}`}>
      <div className="cook-card-head">
        <h2>
          <ClockIcon /> Cooking timer
        </h2>
        <span className="cook-card-label">{timer.label}</span>
      </div>
      <p className="cook-clock">{clock(timer.seconds)}</p>
      {ringsAt && (
        <p className="small cook-phone-note" role="status">
          <PhoneIcon /> On your iPhone · rings at {at}
        </p>
      )}
      <a className={`btn ${ringsAt ? '' : 'btn-primary '}cook-timer-btn cook-phone-start`} href={shortcutTimerUrl(timer.seconds)} onClick={() => t.sentToPhone(step, timer.seconds)}>
        <PhoneIcon /> {ringsAt ? 'Start again on iPhone' : 'Start on iPhone'}
      </a>
    </div>
  );
}

/**
 * "Time's up": a full-screen sheet over cooking while an alarm rings, so it can't be missed: which step and timer,
 * a big Stop, and +1 min to let it go on a little. Several at once are listed together.
 */
export function AlarmSheet({ timers: t, titleOf }: { timers: CookTimers; titleOf: (step: number) => string }) {
  if (!t.ringing.length) return null;
  return (
    <div className="cook-alarm" role="alertdialog" aria-modal="true" aria-labelledby="cook-alarm-title">
      <div className="cook-alarm-card">
        <span className="cook-alarm-icon" aria-hidden="true">
          <ClockIcon />
        </span>
        <h2 id="cook-alarm-title">Time’s up!</h2>
        {t.ringing.map((x) => (
          <div key={x.id} className="cook-alarm-item">
            <p>
              <strong>Step {x.step}</strong> · {titleOf(x.step)}
            </p>
            <p className="muted small">{x.label} timer</p>
            <div className="cook-alarm-actions">
              <button type="button" className="btn cook-timer-btn" onClick={() => t.extend(x.id, 60)}>
                +1 min
              </button>
              <button type="button" className="btn btn-primary cook-timer-btn" onClick={() => t.silence(x.id)} autoFocus>
                Stop
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
