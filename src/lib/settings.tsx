import { createContext, useContext, type ReactNode } from 'react';
import { setDisplayCurrency } from './format';
import { useCollection } from './useCollection';

/** App-wide preferences, stored as a single synced record. */
export interface AppSettings {
  id: 'app';
  /** ISO 4217 code used to display all prices. */
  currency: string;
  /** Work module: the monthly number of days (default 7) and whether it is a minimum of office days or a cap on home days. */
  workTarget?: number;
  workTargetKind?: 'min-office' | 'max-home';
  /** With 'max-home': the higher number of home days you can request (default 10). */
  workExtended?: number;
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
