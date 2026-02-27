import { useState, useMemo, useCallback } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  column: K | null;
  direction: SortDirection;
}

export interface UseSortableTableReturn<T, K extends string = string> {
  sortState: SortState<K>;
  requestSort: (column: K) => void;
  sortedData: T[];
}

type Accessor<T> = (item: T) => unknown;

/**
 * Lightweight hook for client-side table sorting.
 * Pass a record mapping column keys to accessor functions.
 *
 * @example
 * const { sortedData, sortState, requestSort } = useSortableTable(items, {
 *   name: (p) => p.name?.toLowerCase(),
 *   stock: (p) => p.current_stock ?? 0,
 * });
 */
export function useSortableTable<T, K extends string = string>(
  data: T[] | undefined | null,
  accessors: Record<K, Accessor<T>>,
  defaultSort?: SortState<K>,
): UseSortableTableReturn<T, K> {
  const [sortState, setSortState] = useState<SortState<K>>(
    defaultSort ?? { column: null, direction: 'asc' },
  );

  const requestSort = useCallback(
    (column: K) => {
      setSortState((prev) => {
        if (prev.column === column) {
          return { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
        }
        return { column, direction: 'asc' };
      });
    },
    [],
  );

  const sortedData = useMemo(() => {
    const items = data ?? [];
    if (!sortState.column) return items;

    const accessor = accessors[sortState.column];
    if (!accessor) return items;

    const sorted = [...items].sort((a, b) => {
      const aVal = accessor(a);
      const bVal = accessor(b);

      // nulls / undefined always sort last
      if (aVal == null && bVal == null) return 0;
      if (aVal == null) return 1;
      if (bVal == null) return -1;

      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return aVal.localeCompare(bVal);
      }

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return aVal - bVal;
      }

      // Date comparison
      if (aVal instanceof Date && bVal instanceof Date) {
        return aVal.getTime() - bVal.getTime();
      }

      // Fallback: coerce to string
      return String(aVal).localeCompare(String(bVal));
    });

    if (sortState.direction === 'desc') {
      sorted.reverse();
    }

    return sorted;
  }, [data, sortState, accessors]);

  return { sortState, requestSort, sortedData };
}
