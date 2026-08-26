/**
 * Cursor-based Pagination Utility
 * Better performance for large datasets
 */

import { Prisma } from '@prisma/client';

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
export function parseCursor(cursor: string | undefined): string | undefined {
  if (!cursor) return undefined;
  try {
    return Buffer.from(cursor, 'base64').toString('utf-8');
  } catch {
    return undefined;
  }
}

/**
 * Create cursor from item
 */
export function createCursor(item: any, orderBy: Record<string, 'asc' | 'desc'>): string {
  const values: Record<string, any> = {};
  for (const key of Object.keys(orderBy)) {
    values[key] = item[key];
  }
  return Buffer.from(JSON.stringify(values)).toString('base64');
}

/**
 * Apply cursor pagination to Prisma query
 */
export async function cursorPaginate<T>(
  prisma: any,
  model: string,
  where: any,
  options: CursorPaginationOptions
): Promise<CursorPaginationResult<T>> {
  const limit = Math.min(options.limit || 20, 100);
  const cursor = parseCursor(options.cursor);

  const orderBy = options.orderBy || { createdAt: 'desc' };
  const orderByKeys = Object.keys(orderBy);

  let cursorWhere: any = undefined;

  if (cursor) {
    try {
      const cursorValues = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
      cursorWhere = {
        OR: orderByKeys.map((key, index) => {
          const conditions = [];
          for (let i = 0; i < index; i++) {
            conditions.push({ [orderByKeys[i]]: orderBy[orderByKeys[i]] === 'asc' ? cursorValues[orderByKeys[i]] : undefined } as any);
          }
          conditions.push({
            [key]: orderBy[key] === 'asc'
              ? { gt: cursorValues[key] }
              : { lt: cursorValues[key] }
          } as any);
          return conditions;
        }),
      };
    } catch {
      // Invalid cursor, ignore
    }
  }

  const items = await (prisma as any)[model].findMany({
    where: { ...where, ...cursorWhere },
    take: limit + 1,
    orderBy,
  });

  const hasMore = items.length > limit;
  const data = hasMore ? items.slice(0, limit) : items;

  let nextCursor: string | null = null;
  if (hasMore && data.length > 0) {
    nextCursor = createCursor(data[data.length - 1], orderBy);
  }

  return {
    data,
    nextCursor,
    hasMore,
  };
}

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

export async function offsetPaginate<T>(
  prisma: any,
  model: string,
  where: any,
  options: OffsetPaginationOptions,
  select?: any
): Promise<OffsetPaginationResult<T>> {
  const page = Math.max(options.page || 1, 1);
  const limit = Math.min(options.limit || 20, 100);
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    (prisma as any)[model].findMany({
      where,
      take: limit,
      skip,
      select,
    }),
    (prisma as any)[model].count({ where }),
  ]);

  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  };
}
