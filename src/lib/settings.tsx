import { createContext, useContext, type ReactNode } from 'react';
import { setDisplayCurrency } from './format';
import { useCollection } from './useCollection';

/** App-wide preferences, stored as a single synced record. */
export interface AppSettings {
  id: 'app';
  /** ISO 4217 code used to display all prices. */
  currency: string;
  updatedAt: string;
}

const DEFAULTS: AppSettings = { id: 'app', currency: 'USD', updatedAt: '' };

interface SettingsContext {
  settings: AppSettings;
  update: (patch: Partial<Omit<AppSettings, 'id'>>) => Promise<void>;
}

const Ctx = createContext<SettingsContext>({ settings: DEFAULTS, update: async () => {} });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const { items, save } = useCollection<AppSettings>('settings');
  const settings = items.find((s) => s.id === 'app') ?? DEFAULTS;
  // Set before children render so every money() call sees it.
  setDisplayCurrency(settings.currency);
  const update: SettingsContext['update'] = (patch) =>
    save({ ...settings, ...patch, updatedAt: new Date().toISOString() });
  return <Ctx.Provider value={{ settings, update }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsContext {
  return useContext(Ctx);
}
