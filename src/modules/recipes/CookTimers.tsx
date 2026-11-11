import { useEffect, useRef, useState } from 'react';
import { ClockIcon } from '../../icons';
import { CloseIcon } from '../clothes/icons';
import { clock, type StepTimer } from './cooking';

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
}

/** A short two-tone beep through Web Audio; the context is made on the tap that starts a timer, so iPhone lets it play later. */
function beep(ctx: AudioContext | undefined) {
  if (!ctx) return;
  for (const [at, f] of [
    [0, 880],
    [0.25, 660],
    [0.5, 880],
  ] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.2);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + at);
    o.stop(ctx.currentTime + at + 0.22);
  }
}

/**
 * The timers of a cooking session: they keep counting while you move between steps (and while the app is in the
 * background, since they count to a time, not by ticks), and buzz and beep when they run out.
 */
export function useCookTimers() {
  const [timers, setTimers] = useState<RunningTimer[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const audio = useRef<AudioContext | undefined>(undefined);
  const running = timers.some((t) => t.endsAt && !t.done);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [running]);

  // Mark the ones that ran out, once, and tell you.
  useEffect(() => {
    const out = timers.filter((t) => t.endsAt && !t.done && t.endsAt <= now);
    if (!out.length) return;
    setTimers((cur) => cur.map((t) => (out.some((o) => o.id === t.id) ? { ...t, done: true, endsAt: undefined, left: 0 } : t)));
    navigator.vibrate?.([300, 150, 300, 150, 300]);
    beep(audio.current);
  }, [now, timers]);

  useEffect(() => () => void audio.current?.close(), []);

  const start = (step: number, t: StepTimer) => {
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!audio.current && Ctx) audio.current = new Ctx();
      void audio.current?.resume();
    } catch {
      // No sound then; the vibration and the pill still say it.
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
  const leftOf = (t: RunningTimer) => (t.done ? 0 : t.endsAt ? (t.endsAt - now) / 1000 : t.left ?? 0);
  return { timers, start, toggle, remove, leftOf };
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
  const x = t.timers.find((r) => r.step === step && r.seconds === timer.seconds);
  const left = x ? t.leftOf(x) : timer.seconds;
  const done = Math.min(1, Math.max(0, 1 - left / timer.seconds));
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
