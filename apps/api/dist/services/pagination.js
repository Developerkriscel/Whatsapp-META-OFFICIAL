/**
 * Cursor-based Pagination Utility
 * Better performance for large datasets
 */
/**
 * Parse cursor from request
 */
export function parseCursor(cursor) {
    if (!cursor)
        return undefined;
    try {
        return Buffer.from(cursor, 'base64').toString('utf-8');
    }
    catch {
        return undefined;
    }
}
/**
 * Create cursor from item
 */
export function createCursor(item, orderBy) {
    const values = {};
    for (const key of Object.keys(orderBy)) {
        values[key] = item[key];
    }
    return Buffer.from(JSON.stringify(values)).toString('base64');
}
/**
 * Apply cursor pagination to Prisma query
 */
export async function cursorPaginate(prisma, model, where, options) {
    const limit = Math.min(options.limit || 20, 100);
    const cursor = parseCursor(options.cursor);
    const orderBy = options.orderBy || { createdAt: 'desc' };
    const orderByKeys = Object.keys(orderBy);
    let cursorWhere = undefined;
    if (cursor) {
        try {
            const cursorValues = JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8'));
            cursorWhere = {
                OR: orderByKeys.map((key, index) => {
                    const conditions = [];
                    for (let i = 0; i < index; i++) {
                        conditions.push({ [orderByKeys[i]]: orderBy[orderByKeys[i]] === 'asc' ? cursorValues[orderByKeys[i]] : undefined });
                    }
                    conditions.push({
                        [key]: orderBy[key] === 'asc'
                            ? { gt: cursorValues[key] }
                            : { lt: cursorValues[key] }
                    });
                    return conditions;
                }),
            };
        }
        catch {
            // Invalid cursor, ignore
        }
    }
    const items = await prisma[model].findMany({
        where: { ...where, ...cursorWhere },
        take: limit + 1,
        orderBy,
    });
    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    let nextCursor = null;
    if (hasMore && data.length > 0) {
        nextCursor = createCursor(data[data.length - 1], orderBy);
    }
    return {
        data,
        nextCursor,
        hasMore,
    };
}
export async function offsetPaginate(prisma, model, where, options, select) {
    const page = Math.max(options.page || 1, 1);
    const limit = Math.min(options.limit || 20, 100);
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
        prisma[model].findMany({
            where,
            take: limit,
            skip,
            select,
        }),
        prisma[model].count({ where }),
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
//# sourceMappingURL=pagination.js.map