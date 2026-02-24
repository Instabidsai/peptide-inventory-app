import { useState, useCallback, useMemo } from 'react';

export const DEFAULT_PAGE_SIZE = 500;

export interface PaginationState {
    page: number;
    pageSize: number;
}

export interface PaginationControls extends PaginationState {
    /** Range start (0-based, inclusive) for Supabase .range() */
    from: number;
    /** Range end (0-based, inclusive) for Supabase .range() */
    to: number;
    nextPage: () => void;
    prevPage: () => void;
    setPage: (page: number) => void;
    setPageSize: (size: number) => void;
    /** True when there may be more data (last fetch returned a full page) */
    hasMore: boolean;
    setHasMore: (v: boolean) => void;
}

export function usePagination(initialPageSize = DEFAULT_PAGE_SIZE): PaginationControls {
    const [page, setPage] = useState(0);
    const [pageSize, setPageSize] = useState(initialPageSize);
    const [hasMore, setHasMore] = useState(true);

    const from = page * pageSize;
    const to = from + pageSize - 1;

    const nextPage = useCallback(() => setPage(p => p + 1), []);
    const prevPage = useCallback(() => setPage(p => Math.max(0, p - 1)), []);

    return useMemo(() => ({
        page, pageSize, from, to,
        nextPage, prevPage, setPage, setPageSize,
        hasMore, setHasMore,
    }), [page, pageSize, from, to, nextPage, prevPage, hasMore]);
}

/** Helper: apply .range() to a Supabase query builder */
export function applyRange<T extends { range: (from: number, to: number) => any }>(
    query: T,
    pagination?: { from: number; to: number },
): T {
    if (!pagination) return query;
    return query.range(pagination.from, pagination.to);
}
