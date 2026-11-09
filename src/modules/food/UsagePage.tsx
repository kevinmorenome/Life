import { useEffect, useMemo, useRef, useState } from 'react';
import { shortDate, today } from '../../lib/format';
import { FoodTabs } from './FoodTabs';
import { formatAmount } from './stock';
import { stockEntries, type Entry } from './stockEntries';
import { StatsSwitch } from './StatsSwitch';
import type { FoodProduct, FoodReceipt, StockEvent } from './types';
import { unitLabel } from './products';
import { parseUsage } from './usageParse';
import { batchesOldestFirst, planLine, purchaseDateOf } from './usagePlan';

const dayName = (iso: string, day: string): string => (iso === day ? 'Today' : new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }));

interface Recognition {
  lang: string;
  interimResults: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
const speech = (): (new () => Recognition) | undefined => {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

/**
 * Log what you used by writing (or saying) a sentence. It is read into one line per product, each showing the product, the
 * amount, the day and the batch it will come off (the oldest purchase), and nothing is saved until you confirm. Every
 * confirmed line is a new event: no other record is touched.
 */
export function UsagePage({ receipts, products, events, onEvent }: { receipts: FoodReceipt[]; products: FoodProduct[]; events: StockEvent[]; onEvent(e: StockEvent): Promise<void> }) {
  const day = today();
  const entries = useMemo(() => stockEntries(receipts, products, events, day), [receipts, products, events, day]);
  const [text, setText] = useState('');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [quiet, setQuiet] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [logged, setLogged] = useState<string[] | null>(null);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  useEffect(() => () => rec.current?.stop(), []);

  const lines = useMemo(() => parseUsage(text, entries, day), [text, entries, day]);
  const rows = lines.map((raw) => {
    const line = { ...raw, notInStats: quiet[raw.clause] ?? raw.notInStats };
    const id = picked[raw.clause] ?? (raw.candidates.length === 1 ? raw.candidates[0] : undefined);
    const entry = id ? entries.find((e) => e.product.id === id) : undefined;
    return { line, entry, plan: entry ? planLine(line, entry, events, day) : undefined };
  });
  const ready = rows.length > 0 && rows.every((r) => r.plan && r.plan.steps.length > 0 && !r.plan.question);
  const count = rows.reduce((n, r) => n + (r.plan?.steps.length ?? 0), 0);

  function listen() {
    const Rec = speech();
    if (!Rec) return;
    if (listening) return rec.current?.stop();
    const r = new Rec();
    r.lang = navigator.language || 'en-US';
    r.interimResults = false;
    r.onresult = (e) => {
      const said = Array.from(e.results).map((x) => x[0].transcript).join(' ').trim();
      if (said) setText((t) => (t.trim() ? `${t.trim()}, ${said}` : said));
    };
    r.onend = () => setListening(false);
    r.onerror = () => setListening(false);
    rec.current = r;
    setListening(true);
    r.start();
  }

  async function confirm() {
    setSaving(true);
    const said: string[] = [];
    // One event at a time, in order: each is a new record and nothing else is rewritten.
    for (const r of rows) {
      for (const s of r.plan?.steps ?? []) {
        await onEvent(s.event);
        said.push(`${s.text}${s.batch ? ` (${s.batch})` : ''} · ${dayName(s.event.date, day)}${s.event.untracked ? ' · not in statistics' : ''}`);
      }
    }
    setSaving(false);
    setLogged(said);
    setText('');
    setPicked({});
    setQuiet({});
  }

  const inStock = entries.filter((e) => e.stock.quantity > 0).sort((a, b) => a.product.name.localeCompare(b.product.name));

  return (
    <>
      <FoodTabs active="stock" />
      <h2 className="food-h2">Log usage</h2>
      <div className="usage-box">
        <textarea
          className="usage-input"
          rows={2}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setLogged(null);
          }}
          placeholder={'Used half the pesto, froze the chicken on Wednesday…'}
          aria-label="What did you use?"
          autoCapitalize="sentences"
        />
        {speech() && (
          <button type="button" className="icon-btn" onClick={listen} aria-pressed={listening} aria-label={listening ? 'Stop listening' : 'Say it'}>
            {listening ? '■' : '🎤'}
          </button>
        )}
      </div>

      {logged && (
        <div className="food-banner" role="status">
          <strong>Logged</strong>
          {logged.map((l) => (
            <span key={l} className="muted small">
              {l}
            </span>
          ))}
        </div>
      )}

      {rows.map(({ line, entry, plan }) => (
        <section key={line.clause} className="usage-line" aria-label={line.clause}>
          <p className="muted small usage-said">“{line.clause}”</p>
          {line.candidates.length > 1 && !entry && (
            <>
              <p className="usage-q">Which one?</p>
              <div className="chips">
                {line.candidates.map((id) => (
                  <button key={id} type="button" className="chip" onClick={() => setPicked((p) => ({ ...p, [line.clause]: id }))}>
                    {entries.find((e) => e.product.id === id)?.product.name}
                  </button>
                ))}
              </div>
            </>
          )}
          {line.candidates.length === 0 && <p className="usage-q">{line.unknownProduct}</p>}
          {line.candidates.length > 1 && entry && (
            <div className="chips">
              {line.candidates.map((id) => (
                <button key={id} type="button" className="chip" aria-pressed={id === entry.product.id} onClick={() => setPicked((p) => ({ ...p, [line.clause]: id }))}>
                  {entries.find((e) => e.product.id === id)?.product.name}
                </button>
              ))}
            </div>
          )}
          {entry && plan?.question && <p className="usage-q">{plan.question}</p>}
          {plan?.steps.map((s) => (
            <p key={s.event.id} className="usage-step">
              <strong>{s.text}</strong>
              {s.batch && <span className="muted small"> From the batch {s.batch}</span>}
            </p>
          ))}
          {entry && plan && plan.steps.length > 0 && (
            <p className="muted small">
              {dayName(line.date, day)}
              {line.date !== day ? ` · ${line.date}` : ''}
            </p>
          )}
          {plan?.warnings.map((w) => (
            <p key={w} className="usage-warn small">
              {w}
            </p>
          ))}
          {entry && !plan?.question && <StatsSwitch off={line.notInStats} onChange={(off) => setQuiet((q) => ({ ...q, [line.clause]: off }))} />}
        </section>
      ))}

      {rows.length > 0 && (
        <div className="usage-actions">
          <button type="button" className="btn btn-primary" disabled={!ready || saving} onClick={confirm}>
            {saving ? 'Logging…' : ready ? `Log ${count} ${count === 1 ? 'event' : 'events'}` : 'Answer the questions above'}
          </button>
        </div>
      )}

      <h2 className="food-h2">In stock, oldest first</h2>
      {inStock.length === 0 && <p className="muted food-none">Nothing in stock right now.</p>}
      <div className="usage-stock">
        {inStock.map((e) => (
          <StockRow key={e.product.id} entry={e} onPick={() => setText((t) => (t.trim() ? `${t.trim()}, used ${e.product.name}` : `Used ${e.product.name}`))} />
        ))}
      </div>
    </>
  );
}

function StockRow({ entry, onPick }: { entry: Entry; onPick(): void }) {
  const { product: p, stock: s } = entry;
  const batches = batchesOldestFirst(entry);
  return (
    <div className="usage-product">
      <button type="button" className="usage-name" onClick={onPick}>
        {p.name}
        <span className="muted small">
          {' '}
          {formatAmount(s.quantity, p.unit)}
          {unitLabel(p, s.quantity)}
        </span>
      </button>
      {batches.map((b) => (
        <p key={b.id ?? b.date} className="muted small usage-batch">
          Bought {shortDate(purchaseDateOf(entry, b))} · {formatAmount(b.quantity, p.unit)}
          {unitLabel(p, b.quantity)}
          {b.frozen ? ' · frozen' : b.thawed ? ' · thawed' : ''}
          {b.useBy ? ` · use by ${shortDate(b.useBy)}` : ''}
        </p>
      ))}
    </div>
  );
}
