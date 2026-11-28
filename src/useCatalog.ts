import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  TREASURIES,
  WAREHOUSES,
  Treasury,
  WarehouseDef,
  db,
  syncTreasuryCatalog,
  syncWarehouseCatalog,
} from './db';

const FALLBACK_TREASURIES: Treasury[] = TREASURIES.map((t) => ({
  id: t.id,
  name: t.name,
  openingBalance: 0,
  isActive: true,
}));

const FALLBACK_WAREHOUSES: WarehouseDef[] = WAREHOUSES.map((w) => ({
  id: w.id,
  name: w.name,
  isActive: true,
}));

function byArabicName<T extends { name: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

export function useTreasuries(activeOnly = false): Treasury[] {
  const rows = useLiveQuery(() => db.treasuries.toArray(), []);
  if (rows && rows.length > 0) syncTreasuryCatalog(rows);

  return useMemo(() => {
    const source = rows && rows.length > 0 ? rows : FALLBACK_TREASURIES;
    const list = activeOnly ? source.filter((t) => t.isActive) : source;
    return byArabicName(list.length > 0 ? list : source);
  }, [rows, activeOnly]);
}

export function useWarehouses(activeOnly = false): WarehouseDef[] {
  const rows = useLiveQuery(() => db.warehouses.toArray(), []);
  if (rows && rows.length > 0) syncWarehouseCatalog(rows);

  return useMemo(() => {
    const source = rows && rows.length > 0 ? rows : FALLBACK_WAREHOUSES;
    const list = activeOnly ? source.filter((w) => w.isActive) : source;
    return byArabicName(list.length > 0 ? list : source);
  }, [rows, activeOnly]);
}
