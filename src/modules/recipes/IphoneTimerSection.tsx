import { useSettings } from '../../lib/settings';
import { shortcutTimerUrl, TIMER_SHORTCUT } from './cooking';

/**
 * Settings → iPhone timer: how to make the "Life timer" Shortcut that starts the iPhone's own Clock timer, a test that
 * runs it for 5 seconds, and the switch that makes cooking timers start on the iPhone instead of counting in the app. Nothing about the phone is
 * stored or sent anywhere; the app only opens a `shortcuts://` link.
 */
export function IphoneTimerSection() {
  const { settings, update } = useSettings();
  const on = Boolean(settings.iphoneTimer);
  return (
    <section className="card">
      <h2>iPhone timer</h2>
      <p className="muted small">
        Cooking timers can also start your iPhone’s own timer, through a small Shortcut you make once. It rings with your alarm sound and shows on the lock screen, even with the browser closed.
      </p>
      <ol className="small iphone-steps">
        <li>
          Open the <strong>Shortcuts</strong> app, tap <strong>＋</strong> and name the new shortcut exactly <strong>{TIMER_SHORTCUT}</strong>.
        </li>
        <li>
          Add the action <strong>Get Numbers from Input</strong>, and set its input to <strong>Shortcut Input</strong>.
        </li>
        <li>
          Add the action <strong>Start Timer</strong>. Tap its duration, choose the <strong>Numbers</strong> result, and set the unit to <strong>seconds</strong>.
        </li>
        <li>Tap Done, then try it with the test below. The first time, iPhone asks whether the app may open Shortcuts: allow it.</li>
      </ol>
      <p className="muted small">If the timer doesn’t start, open the shortcut and check its first line says it receives Text (tap it to allow Text).</p>
      <div className="form-actions start">
        <a className="btn" href={shortcutTimerUrl(5)}>
          Test: 5-second timer
        </a>
        <button type="button" className={on ? 'btn' : 'btn btn-primary'} onClick={() => void update({ iphoneTimer: !on })}>
          {on ? 'Use the app’s timer instead' : 'It works: use the iPhone timer'}
        </button>
      </div>
      {on ? (
        <p className="small">Cooking timers now start on your iPhone. The app’s own timer and alarm are off.</p>
      ) : (
        <p className="muted small">Until then, cooking timers count down in the app and ring while it is open.</p>
      )}
    </section>
  );
}
