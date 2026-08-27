/**
 * Cursor-based Pagination Utility
 * Better performance for large datasets
 */
export interface CursorPaginationOptions {
    limit?: number;
    cursor?: string;
    orderBy?: Record<string, 'asc' | 'desc'>;
}
export interface CursorPaginationResult<T> {
    data: T[];
    nextCursor: string | null;
    hasMore: boolean;
    total?: number;
}
/**
 * Parse cursor from request
 */
export declare function parseCursor(cursor: string | undefined): string | undefined;
/**
 * Create cursor from item
 */
export declare function createCursor(item: any, orderBy: Record<string, 'asc' | 'desc'>): string;
/**
 * Apply cursor pagination to Prisma query
 */
export declare function cursorPaginate<T>(prisma: any, model: string, where: any, options: CursorPaginationOptions): Promise<CursorPaginationResult<T>>;
/**
 * Simple offset pagination (for smaller datasets)
 */
export interface OffsetPaginationOptions {
    page?: number;
    limit?: number;
}
export interface OffsetPaginationResult<T> {
    data: T[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasNext: boolean;
        hasPrev: boolean;
    };
}
export declare function offsetPaginate<T>(prisma: any, model: string, where: any, options: OffsetPaginationOptions, select?: any): Promise<OffsetPaginationResult<T>>;
//# sourceMappingURL=pagination.d.ts.map