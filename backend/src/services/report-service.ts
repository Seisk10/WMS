import db from '../database/connection';

export interface DashboardKPIs {
  totalProducts: number;
  totalMovements: number;
  activeSessions: number;
  finalizedSessions: number;
}

export interface DivergenceItem {
  id: number;
  product_name: string;
  item_code: string;
  location_name: string;
  expected_quantity: number;
  counted_quantity: number;
  divergence: number;
  finalized_at: string | null;
}

export interface DivergenceResult {
  divergences: DivergenceItem[];
  total: number;
  page: number;
  limit: number;
}

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const [products, movements, active, finalized] = await Promise.all([
    db('products').count<{ total: string | number }>({ total: 'id' }).first(),
    db('stock_movements').count<{ total: string | number }>({ total: 'id' }).first(),
    db('inventory_sessions')
      .where({ status: 'EM_ANDAMENTO' })
      .count<{ total: string | number }>({ total: 'id' })
      .first(),
    db('inventory_sessions')
      .where({ status: 'FINALIZADO' })
      .count<{ total: string | number }>({ total: 'id' })
      .first(),
  ]);

  return {
    totalProducts: Number(products?.total ?? 0),
    totalMovements: Number(movements?.total ?? 0),
    activeSessions: Number(active?.total ?? 0),
    finalizedSessions: Number(finalized?.total ?? 0),
  };
}

export interface DashboardStats {
  totalProducts: number;
  movementsToday: number;
  openDivergences: number;
  activeSessions: number;
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const [products, movementsToday, divergences, sessions] = await Promise.all([
    db('products')
      .count<{ total: string | number }>({ total: 'id' })
      .first(),

    // DATE() e DATE('now') são ambos UTC no SQLite — comparação consistente.
    db('stock_movements')
      .whereRaw("DATE(moved_at) = DATE('now')")
      .count<{ total: string | number }>({ total: 'id' })
      .first(),

    db('inventory_session_results')
      .where('divergence', '!=', 0)
      .count<{ total: string | number }>({ total: 'id' })
      .first(),

    db('inventory_sessions')
      .where({ status: 'EM_ANDAMENTO' })
      .count<{ total: string | number }>({ total: 'id' })
      .first(),
  ]);

  return {
    totalProducts:    Number(products?.total      ?? 0),
    movementsToday:   Number(movementsToday?.total ?? 0),
    openDivergences:  Number(divergences?.total    ?? 0),
    activeSessions:   Number(sessions?.total       ?? 0),
  };
}

export interface WeeklyMovementItem {
  date: string;
  entradas: number;
  saidas: number;
}

export async function getMovimentacoesSemana(): Promise<WeeklyMovementItem[]> {
  interface Row { date: string; entradas: string | number; saidas: string | number }

  const rows = await db('stock_movements as sm')
    .leftJoin('locations as ol', 'ol.id', 'sm.origin_location_id')
    .whereRaw("DATE(sm.moved_at) >= DATE('now', '-6 days')")
    .groupByRaw('DATE(sm.moved_at)')
    .orderByRaw('DATE(sm.moved_at) ASC')
    .select<Row[]>(
      db.raw("DATE(sm.moved_at) as date"),
      db.raw("SUM(CASE WHEN ol.type = 'gondola' THEN 1 ELSE 0 END) as entradas"),
      db.raw("SUM(CASE WHEN ol.type = 'deposito' THEN 1 ELSE 0 END) as saidas"),
    );

  // Build 7-day window in UTC to match SQLite's DATE('now')
  const today = new Date();
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    days.push(d.toISOString().slice(0, 10));
  }

  const map = new Map<string, WeeklyMovementItem>(
    days.map((date) => [date, { date, entradas: 0, saidas: 0 }])
  );

  for (const row of rows) {
    if (map.has(row.date)) {
      map.set(row.date, {
        date: row.date,
        entradas: Number(row.entradas),
        saidas: Number(row.saidas),
      });
    }
  }

  return days.map((d) => map.get(d)!);
}

export async function getDivergences(
  page: number,
  limit: number
): Promise<DivergenceResult> {
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;

  // inventory_session_results é a fonte canônica de divergência histórica.
  // inventory_adjustments (append-only) nunca é atualizado após o bipe — os
  // valores de expected_quantity e divergence ficam aqui como snapshot imutável
  // do momento em que a sessão foi fechada.
  const baseQuery = db('inventory_session_results as r').where('r.divergence', '!=', 0);

  const [divergences, countRow] = await Promise.all([
    baseQuery
      .clone()
      .join('inventory_sessions as s', 's.id', 'r.session_id')
      .join('products as p', 'p.id', 'r.product_id')
      .join('locations as l', 'l.id', 'r.location_id')
      .select<DivergenceItem[]>(
        'r.id',
        'p.name as product_name',
        'p.item_code',
        'l.name as location_name',
        'r.expected_quantity',
        'r.counted_quantity',
        'r.divergence',
        's.finalized_at'
      )
      .orderByRaw('ABS(r.divergence) DESC')
      .limit(safeLimit)
      .offset(offset),

    baseQuery
      .clone()
      .count<{ total: string | number }>({ total: 'r.id' })
      .first(),
  ]);

  return {
    divergences,
    total: Number(countRow?.total ?? 0),
    page,
    limit: safeLimit,
  };
}
