import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon } from '../../icons';
import { searchPhotoCandidates, type PhotoCandidate } from './photoSearch';
import { photoFromUrl } from './productPhoto';

/** Search Open Food Facts for a picture of the product; tap the right one. Loose by name, exact by barcode. */
export function PhotoSearch({ name, rawName, onPick, onClose }: { name: string; /** The text printed on the receipt, the best way into Konzum's catalogue. */ rawName?: string; onPick(photo: string): Promise<void> | void; onClose(): void }) {
  const [query, setQuery] = useState(name);
  // The receipt text is only used until you type your own words.
  const [typed, setTyped] = useState(false);
  const [code, setCode] = useState('');
  const [state, setState] = useState<{ status: 'loading' | 'done' | 'picking'; candidates: PhotoCandidate[]; error?: string }>({ status: 'loading', candidates: [] });
  const box = useRef<HTMLDivElement>(null);

  async function run(q: string, c: string, useRaw: boolean) {
    setState({ status: 'loading', candidates: [] });
    const r = await searchPhotoCandidates(c.trim() ? { code: c } : { query: q, rawName: useRaw ? rawName : undefined });
    setState({ status: 'done', candidates: r.candidates, error: r.error });
  }

  useEffect(() => {
    box.current?.focus();
    void run(name, '', true);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick(c: PhotoCandidate) {
    setState((s) => ({ ...s, status: 'picking' }));
    try {
      await onPick(await photoFromUrl(c.imageUrl));
      onClose();
    } catch (e) {
      setState((s) => ({ ...s, status: 'done', error: e instanceof Error ? e.message : 'Could not use that picture.' }));
    }
  }

  // Rendered on the page itself: opened from the stock sheet, whose blur makes it the anchor of anything `fixed` inside it
  // and whose scrolling would clip it, the search sheet would otherwise sit inside it, half off the screen.
  return createPortal(
    <>
      <button type="button" className="food-scrim food-scrim-top" aria-label="Close search" onClick={onClose} />
      <div className="food-search" role="dialog" aria-modal="true" aria-label="Find a picture" tabIndex={-1} ref={box}>
        <div className="food-grip" aria-hidden />
        <h2>Find a picture</h2>
        <form
          className="food-search-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run(query, code, !typed);
          }}
        >
          <input value={query} onChange={(e) => { setQuery(e.target.value); setTyped(true); }} aria-label="Product name" placeholder="Name of the product" />
          <input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" aria-label="Barcode" placeholder="or its barcode" />
          <button type="submit" className="icon-btn" aria-label="Search">
            <SearchIcon />
          </button>
        </form>
        {state.status === 'loading' && <p className="muted small">Looking…</p>}
        {state.status === 'picking' && <p className="muted small">Getting the picture…</p>}
        {state.error && <p className="muted small">{state.error}</p>}
        {state.status === 'done' && state.candidates.length === 0 && !state.error && <p className="muted small">Nothing found. Try other words or the barcode, or take a photo of it yourself.</p>}
        <ul className="food-results">
          {state.candidates.map((c) => (
            <li key={c.code}>
              <button type="button" className="food-result" disabled={state.status === 'picking'} onClick={() => pick(c)}>
                <span className="food-result-img">
                  <img src={c.imageUrl} alt="" loading="lazy" />
                </span>
                <span className="small">{c.source === 'Konzum' ? c.name : [c.brand, c.quantity].filter(Boolean).join(' · ') || c.name}</span>
                {c.source && <span className="muted food-source">{c.source}</span>}
              </button>
            </li>
          ))}
        </ul>
        <p className="muted small">Pictures from Konzum's web shop and Open Food Facts. Check that it is the same product (size, flavour) before you tap.</p>
      </div>
    </>,
    document.body,
  );
}
