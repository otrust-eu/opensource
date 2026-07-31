function invalidCursor() {
  const error = new Error('Invalid pagination cursor');
  error.code = 'invalid_cursor';
  return error;
}

export function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== 'string' || value.length > 512) throw invalidCursor();

  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    const createdAt = new Date(parsed.created_at);
    if (
      !Number.isFinite(createdAt.getTime()) ||
      typeof parsed.id !== 'string' ||
      !parsed.id ||
      parsed.id.length > 256
    ) {
      throw invalidCursor();
    }
    return { createdAt, id: parsed.id };
  } catch (error) {
    if (error?.code === 'invalid_cursor') throw error;
    throw invalidCursor();
  }
}

export function encodeCursor(record, idField) {
  const createdAt = new Date(record.created_at);
  const id = record[idField];
  if (!Number.isFinite(createdAt.getTime()) || typeof id !== 'string' || !id) {
    throw invalidCursor();
  }
  return Buffer.from(JSON.stringify({
    created_at: createdAt.toISOString(),
    id
  })).toString('base64url');
}

export function cursorQuery(cursor, idField, baseQuery = {}) {
  const decoded = decodeCursor(cursor);
  if (!decoded) return baseQuery;

  return {
    ...baseQuery,
    $or: [
      { created_at: { $lt: decoded.createdAt } },
      { created_at: decoded.createdAt, [idField]: { $lt: decoded.id } }
    ]
  };
}

export function safePageLimit(value, fallback = 50, maximum = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.trunc(parsed), 1), maximum);
}

export function pageResult(rows, limit, idField) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  return {
    items,
    nextCursor: hasMore ? encodeCursor(items[items.length - 1], idField) : null
  };
}
