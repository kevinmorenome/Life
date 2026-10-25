import { STORES, getAll, replaceAll, upsertNewer, type StoreName } from './db';

interface Backup {
  app: 'life';
  version: 1;
  exportedAt: string;
  stores: Partial<{ [K in StoreName]: unknown[] }>;
}

export async function exportBackup(): Promise<Blob> {
  const stores: Backup['stores'] = {};
  for (const name of STORES) stores[name] = await getAll(name);
  const backup: Backup = { app: 'life', version: 1, exportedAt: new Date().toISOString(), stores };
  return new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
}

async function readBackup(file: File): Promise<Backup> {
  const data = JSON.parse(await file.text()) as Backup;
  if (data.app !== 'life' || !data.stores) throw new Error('Not a Life backup file');
  return data;
}

/** Restores every store present in the file; stores missing from it are left alone. */
export async function importBackup(file: File): Promise<number> {
  const data = await readBackup(file);
  let count = 0;
  for (const name of STORES) {
    const rows = data.stores[name];
    if (Array.isArray(rows)) {
      await replaceAll(name, rows as { id: string }[]);
      count += rows.length;
    }
  }
  return count;
}

/**
 * Adds records from the file that are new, and updates ones where the file's
 * copy is newer. Everything else already here is kept.
 */
export async function mergeBackup(file: File): Promise<number> {
  const data = await readBackup(file);
  let count = 0;
  for (const name of STORES) {
    const rows = data.stores[name];
    if (Array.isArray(rows)) count += await upsertNewer(name, rows as { id: string; updatedAt?: string }[]);
  }
  return count;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
