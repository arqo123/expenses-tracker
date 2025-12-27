import type { ParsedNLPQuery, DateRange } from '../types/nlp-query.types.ts';

export interface QueryParams {
  sql: string;
  values: (string | number)[];
}

/**
 * Build SQL query from parsed NLP query
 */
export function buildQueryFromNLP(
  parsedQuery: ParsedNLPQuery,
  userName: string
): QueryParams {
  const values: (string | number)[] = [userName];
  let paramIndex = 2;

  // Base query
  let sql = `
    SELECT * FROM expenses
    WHERE user_name = $1 AND status = 'active'
  `;

  // Date range filter
  if (parsedQuery.dateRange) {
    const { start, end } = resolveDateRange(parsedQuery.dateRange);
    if (start) {
      sql += ` AND data >= $${paramIndex}`;
      values.push(start);
      paramIndex++;
    }
    if (end) {
      sql += ` AND data <= $${paramIndex}`;
      values.push(end);
      paramIndex++;
    }
  }

  // Category include
  if (parsedQuery.categories?.include?.length) {
    const placeholders = parsedQuery.categories.include
      .map(() => `$${paramIndex++}`)
      .join(', ');
    sql += ` AND kategoria IN (${placeholders})`;
    values.push(...parsedQuery.categories.include);
  }

  // Category exclude (negacje!)
  if (parsedQuery.categories?.exclude?.length) {
    const placeholders = parsedQuery.categories.exclude
      .map(() => `$${paramIndex++}`)
      .join(', ');
    sql += ` AND kategoria NOT IN (${placeholders})`;
    values.push(...parsedQuery.categories.exclude);
  }

  // Shop include (ILIKE for fuzzy matching)
  if (parsedQuery.shops?.include?.length) {
    const conditions = parsedQuery.shops.include
      .map(() => `sprzedawca ILIKE $${paramIndex++}`)
      .join(' OR ');
    sql += ` AND (${conditions})`;
    values.push(...parsedQuery.shops.include.map((s) => `%${s}%`));
  }

  // Shop exclude
  if (parsedQuery.shops?.exclude?.length) {
    const conditions = parsedQuery.shops.exclude
      .map(() => `sprzedawca NOT ILIKE $${paramIndex++}`)
      .join(' AND ');
    sql += ` AND (${conditions})`;
    values.push(...parsedQuery.shops.exclude.map((s) => `%${s}%`));
  }

  // Amount filter
  if (parsedQuery.amountFilter) {
    const { min, max, exact } = parsedQuery.amountFilter;
    if (exact !== undefined) {
      sql += ` AND kwota = $${paramIndex}`;
      values.push(exact);
      paramIndex++;
    } else {
      if (min !== undefined) {
        sql += ` AND kwota >= $${paramIndex}`;
        values.push(min);
        paramIndex++;
      }
      if (max !== undefined) {
        sql += ` AND kwota <= $${paramIndex}`;
        values.push(max);
        paramIndex++;
      }
    }
  }

  // Order by date descending, then by amount
  sql += ' ORDER BY data DESC, kwota DESC';

  return { sql, values };
}

/**
 * Resolve date range to concrete start/end dates
 */
export function resolveDateRange(dateRange: DateRange): {
  start: string | null;
  end: string | null;
} {
  // If already has start/end, use them
  if (dateRange.start || dateRange.end) {
    return {
      start: dateRange.start || null,
      end: dateRange.end || null,
    };
  }

  // Calculate relative dates
  if (dateRange.type === 'relative' && dateRange.relativeUnit && dateRange.relativeValue) {
    const now = new Date();
    const end = now.toISOString().split('T')[0]!;
    const startDate = new Date(now);

    switch (dateRange.relativeUnit) {
      case 'days':
        startDate.setDate(now.getDate() - dateRange.relativeValue);
        break;
      case 'weeks':
        startDate.setDate(now.getDate() - dateRange.relativeValue * 7);
        break;
      case 'months':
        startDate.setMonth(now.getMonth() - dateRange.relativeValue);
        break;
      case 'years':
        startDate.setFullYear(now.getFullYear() - dateRange.relativeValue);
        break;
    }

    return {
      start: startDate.toISOString().split('T')[0]!,
      end,
    };
  }

  // No date range specified - return nulls
  return { start: null, end: null };
}

/**
 * Build aggregation SQL (for groupBy queries)
 */
export function buildAggregationSQL(
  parsedQuery: ParsedNLPQuery,
  userName: string
): QueryParams {
  const values: (string | number)[] = [userName];
  let paramIndex = 2;

  const groupBy = parsedQuery.aggregation?.groupBy || 'category';
  const groupColumn = groupBy === 'category' ? 'kategoria' : 'sprzedawca';

  let sql = `
    SELECT
      ${groupColumn} as label,
      SUM(kwota) as total_amount,
      COUNT(*) as transaction_count
    FROM expenses
    WHERE user_name = $1 AND status = 'active'
  `;

  // Date range filter
  if (parsedQuery.dateRange) {
    const { start, end } = resolveDateRange(parsedQuery.dateRange);
    if (start) {
      sql += ` AND data >= $${paramIndex}`;
      values.push(start);
      paramIndex++;
    }
    if (end) {
      sql += ` AND data <= $${paramIndex}`;
      values.push(end);
      paramIndex++;
    }
  }

  // Category include
  if (parsedQuery.categories?.include?.length) {
    const placeholders = parsedQuery.categories.include
      .map(() => `$${paramIndex++}`)
      .join(', ');
    sql += ` AND kategoria IN (${placeholders})`;
    values.push(...parsedQuery.categories.include);
  }

  // Category exclude
  if (parsedQuery.categories?.exclude?.length) {
    const placeholders = parsedQuery.categories.exclude
      .map(() => `$${paramIndex++}`)
      .join(', ');
    sql += ` AND kategoria NOT IN (${placeholders})`;
    values.push(...parsedQuery.categories.exclude);
  }

  // Shop include
  if (parsedQuery.shops?.include?.length) {
    const conditions = parsedQuery.shops.include
      .map(() => `sprzedawca ILIKE $${paramIndex++}`)
      .join(' OR ');
    sql += ` AND (${conditions})`;
    values.push(...parsedQuery.shops.include.map((s) => `%${s}%`));
  }

  // Shop exclude
  if (parsedQuery.shops?.exclude?.length) {
    const conditions = parsedQuery.shops.exclude
      .map(() => `sprzedawca NOT ILIKE $${paramIndex++}`)
      .join(' AND ');
    sql += ` AND (${conditions})`;
    values.push(...parsedQuery.shops.exclude.map((s) => `%${s}%`));
  }

  // Amount filter
  if (parsedQuery.amountFilter) {
    const { min, max, exact } = parsedQuery.amountFilter;
    if (exact !== undefined) {
      sql += ` AND kwota = $${paramIndex}`;
      values.push(exact);
      paramIndex++;
    } else {
      if (min !== undefined) {
        sql += ` AND kwota >= $${paramIndex}`;
        values.push(min);
        paramIndex++;
      }
      if (max !== undefined) {
        sql += ` AND kwota <= $${paramIndex}`;
        values.push(max);
        paramIndex++;
      }
    }
  }

  // Group by
  sql += ` GROUP BY ${groupColumn}`;

  // Order (validated to prevent SQL injection)
  const orderBy = parsedQuery.aggregation?.orderBy || 'amount';
  const orderDirection = parsedQuery.aggregation?.orderDirection || 'desc';
  const orderColumn = orderBy === 'count' ? 'transaction_count' : 'total_amount';
  // Whitelist order direction
  const safeDirection = orderDirection.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  sql += ` ORDER BY ${orderColumn} ${safeDirection}`;

  // Limit (parameterized to prevent SQL injection)
  if (parsedQuery.aggregation?.limit) {
    const limit = parseInt(String(parsedQuery.aggregation.limit), 10);
    if (isNaN(limit) || limit < 1 || limit > 1000) {
      throw new Error('Invalid limit value: must be between 1 and 1000');
    }
    sql += ` LIMIT $${paramIndex}`;
    values.push(limit);
    paramIndex++;
  }

  return { sql, values };
}
