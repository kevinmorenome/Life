import { useEffect } from 'react';
import type { StockEvent } from './types';

export interface Toast {
  text: string;
  undo?: StockEvent | StockEvent[];
}

/** What just happened, with Undo. Events are never deleted, so Undo records newer counts that put things back. It fades on its own. */
export function StockToast({ toast, onUndo, onDone }: { toast: Toast | null; onUndo(events: StockEvent[]): void | Promise<void>; onDone(): void }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(onDone, 7000);
    return () => clearTimeout(t);
  }, [toast, onDone]);

  if (!toast) return null;
  return (
    <div className="food-toast" role="status">
      <span>{toast.text}</span>
      {toast.undo && (
        <button
          type="button"
          onClick={async () => {
            await onUndo([toast.undo!].flat());
            onDone();
          }}
        >
          Undo
        </button>
      )}
    </div>
  );
}
