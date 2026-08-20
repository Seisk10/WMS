import db from '../database/connection';
import { AppError } from '../utils/app-error';
import { beginImmediateTransaction } from '../utils/sqlite-transaction';

type SessionStatus = 'EM_ANDAMENTO' | 'FINALIZADO' | 'CANCELADA';

interface SessionRow {
  id: number;
  status: SessionStatus;
  blind_count: number; // SQLite stores booleans as 0/1
}

export interface DivergenceViolation {
  product_id: number;
  item_code: string;
  product_name: string;
  location_id: number;
  location_name: string;
  counted_quantity: number;
  expected_quantity: number;
  divergence: number;
  divergence_pct: number | null;
}

export interface SessionDetail {
  id: number;
  title: string;
  category: string;
  status: SessionStatus;
  blind_count: boolean;
  created_by: number;
  username: string;
  created_at: string;
  finalized_at: string | null;
  close_justification: string | null;
}

export interface RegisterCountResult {
  blind_count: boolean;
}

// Safe parser: returns the numeric env value or the fallback if missing/invalid.
function parseThreshold(envVar: string, fallback: number): number {
  const raw = process.env[envVar];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export async function createSession(
  title: string,
  category: string,
  userId: number,
  blindCount: boolean
): Promise<{ id: number; blind_count: boolean }> {
  const [id] = await db('inventory_sessions').insert({
    title,
    category,
    status: 'EM_ANDAMENTO',
    created_by: userId,
    blind_count: blindCount ? 1 : 0,
  });

  return { id: id as number, blind_count: blindCount };
}

export async function getSession(sessionId: number): Promise<SessionDetail> {
  const row = await db('inventory_sessions as s')
    .join('users as u', 'u.id', 's.created_by')
    .where('s.id', sessionId)
    .select(
      's.id',
      's.title',
      's.category',
      's.status',
      's.blind_count',
      's.created_by',
      'u.username',
      's.created_at',
      's.finalized_at',
      's.close_justification'
    )
    .first();

  if (!row) {
    throw new AppError('Sessão de inventário não encontrada.', 404, 'SESSION_NOT_FOUND');
  }

  return { ...row, blind_count: Boolean(row.blind_count) };
}

export async function registerCount(
  sessionId: number,
  productId: number,
  locationId: number,
  countedQuantity: number,
  userId: number
): Promise<RegisterCountResult> {
  // FIX RC1: Envolver em beginImmediateTransaction.
  // Sem transação, registerCount fazia duas queries avulsas (SELECT status + UPSERT)
  // liberando a conexão entre elas. Com pool max=1, closeSession podia adquirir
  // a conexão no intervalo, finalizar a sessão e depois o UPSERT inseria uma
  // contagem em sessão já finalizada — divergências calculadas sem esse registro.
  return await beginImmediateTransaction(async (trx) => {
    // FIX V3: Valida session, produto e localização em paralelo.
    // SQLite não enforça FK por padrão; sem validação explícita, um atacante
    // pode registrar contagens com product_id/location_id inexistentes que,
    // ao fechar a sessão, inserem saldos fantasma em inventory_balances.
    const [session, product, location] = await Promise.all([
      trx<SessionRow>('inventory_sessions')
        .where({ id: sessionId })
        .select('id', 'status', 'blind_count')
        .first(),
      trx('products').where({ id: productId }).select('id').first(),
      trx('locations').where({ id: locationId }).select('id').first(),
    ]);

    // FIX V5: Sem IDs nas mensagens de erro (evita enumeração de sessões/produtos)
    if (!session) {
      throw new AppError('Sessão de inventário não encontrada.', 404, 'SESSION_NOT_FOUND');
    }
    if (session.status !== 'EM_ANDAMENTO') {
      throw new AppError(
        'Esta sessão já foi finalizada e não aceita novas contagens.',
        409,
        'SESSION_NOT_ACTIVE'
      );
    }
    if (!product) {
      throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    }
    if (!location) {
      throw new AppError('Localização não encontrada.', 404, 'LOCATION_NOT_FOUND');
    }

    // Upsert: nova bipagem do mesmo produto+local na mesma sessão sobrescreve a anterior.
    // Dentro do BEGIN IMMEDIATE, o check de status e este UPSERT são atômicos.
    await trx('inventory_adjustments')
      .insert({
        session_id: sessionId,
        product_id: productId,
        location_id: locationId,
        counted_quantity: countedQuantity,
        counted_by: userId,
      })
      .onConflict(['session_id', 'product_id', 'location_id'])
      .merge(['counted_quantity', 'counted_by']);

    return { blind_count: Boolean(session.blind_count) };
  });
}

export async function cancelSession(sessionId: number): Promise<void> {
  await beginImmediateTransaction(async (trx) => {
    // Atomic guard: only transitions EM_ANDAMENTO → CANCELADA.
    // Changing status away from EM_ANDAMENTO is all that's needed to release
    // product locks — movement-service filters adjustments by s.status = 'EM_ANDAMENTO'.
    const rowsUpdated = await trx('inventory_sessions')
      .where({ id: sessionId, status: 'EM_ANDAMENTO' })
      .update({ status: 'CANCELADA' });

    if (rowsUpdated === 0) {
      const session = await trx('inventory_sessions')
        .where({ id: sessionId })
        .select('id', 'status')
        .first<{ id: number; status: string } | undefined>();

      if (!session) {
        throw new AppError('Sessão de inventário não encontrada.', 404, 'SESSION_NOT_FOUND');
      }
      if (session.status === 'CANCELADA') {
        throw new AppError('Esta sessão já foi cancelada.', 409, 'SESSION_ALREADY_CANCELLED');
      }
      throw new AppError('Sessão finalizada não pode ser cancelada.', 409, 'SESSION_ALREADY_CLOSED');
    }
  });
}

export interface CloseSessionResult {
  adjusted: number;
}

export async function closeSession(
  sessionId: number,
  justification?: string
): Promise<CloseSessionResult> {
  const pctThreshold = parseThreshold('DIVERGENCE_PCT_THRESHOLD', Infinity);
  const absThreshold = parseThreshold('DIVERGENCE_ABS_THRESHOLD', Infinity);

  // FIX RC2: Substitui db.transaction() (BEGIN DEFERRED) por beginImmediateTransaction.
  // Knex 3.x ignora isolationLevel para SQLite3 e sempre emite BEGIN; —
  // ver sqlite-transaction.ts para a análise completa.
  const result = await beginImmediateTransaction(async (trx) => {
    // FIX RC2-detalhe: UPDATE atômico com guard de status como primeira operação.
    // Justificativa incluída aqui para evitar um UPDATE separado posterior —
    // ambos os campos (status + close_justification) são escritos em uma única
    // instrução, sem janela de interleave.
    const rowsUpdated = await trx('inventory_sessions')
      .where({ id: sessionId, status: 'EM_ANDAMENTO' })
      .update({
        status: 'FINALIZADO',
        finalized_at: db.fn.now(),
        close_justification: justification ?? null,
      });

    if (rowsUpdated === 0) {
      const exists = await trx('inventory_sessions')
        .where({ id: sessionId })
        .select('id')
        .first();

      // FIX V5: Sem IDs nas mensagens de erro
      if (!exists) {
        throw new AppError('Sessão de inventário não encontrada.', 404, 'SESSION_NOT_FOUND');
      }
      throw new AppError('Esta sessão já foi finalizada.', 409, 'SESSION_ALREADY_CLOSED');
    }

    // Single JOIN: substitui o N+1 anterior (um SELECT por ajuste dentro do loop).
    // Traz adjustments + produto + localização + saldo atual em uma única query.
    interface AdjustmentJoinRow {
      id: number;
      product_id: number;
      item_code: string;
      product_name: string;
      location_id: number;
      location_name: string;
      counted_quantity: number;
      current_balance: number | null;
    }

    const adjustments = await trx<AdjustmentJoinRow>('inventory_adjustments as ia')
      .join('products as p', 'p.id', 'ia.product_id')
      .join('locations as l', 'l.id', 'ia.location_id')
      .leftJoin('inventory_balances as ib', function () {
        this.on('ib.product_id', '=', 'ia.product_id').andOn(
          'ib.location_id',
          '=',
          'ia.location_id'
        );
      })
      .where('ia.session_id', sessionId)
      .select(
        'ia.id',
        'ia.product_id',
        'p.item_code',
        'p.name as product_name',
        'ia.location_id',
        'l.name as location_name',
        'ia.counted_quantity',
        'ib.quantity as current_balance'
      );

    // Pre-flight divergence check — before any write to inventory_balances.
    // If any item exceeds thresholds and no justification was provided: ROLLBACK via throw.
    const violations: DivergenceViolation[] = [];

    for (const adj of adjustments) {
      const expectedQty = adj.current_balance ?? 0;
      const divergence = adj.counted_quantity - expectedQty;
      const absDivergence = Math.abs(divergence);
      const divergencePct = expectedQty > 0 ? (absDivergence / expectedQty) * 100 : null;

      const exceedsPct = divergencePct !== null && divergencePct > pctThreshold;
      const exceedsAbs = absDivergence > absThreshold;

      if (exceedsPct || exceedsAbs) {
        violations.push({
          product_id: adj.product_id,
          item_code: adj.item_code,
          product_name: adj.product_name,
          location_id: adj.location_id,
          location_name: adj.location_name,
          counted_quantity: adj.counted_quantity,
          expected_quantity: expectedQty,
          divergence,
          divergence_pct: divergencePct !== null ? Math.round(divergencePct * 100) / 100 : null,
        });
      }
    }

    if (violations.length > 0 && !justification) {
      throw new AppError(
        'Divergência acima do threshold detectada. Forneça uma justificativa para prosseguir.',
        422,
        'DIVERGENCE_EXCEEDS_THRESHOLD',
        violations
      );
    }

    // Reconciliação: valores pré-computados do JOIN — nenhuma leitura extra no DB.
    // inventory_adjustments é append-only: nunca sofre UPDATE após o insert do registerCount.
    // O snapshot (expected_quantity, divergence) vai para inventory_session_results.
    for (const adj of adjustments) {
      const expectedQty = adj.current_balance ?? 0;
      const divergence = adj.counted_quantity - expectedQty;

      // Append-only: insere o resultado de reconciliação como novo registro imutável.
      await trx('inventory_session_results').insert({
        session_id: sessionId,
        product_id: adj.product_id,
        location_id: adj.location_id,
        counted_quantity: adj.counted_quantity,
        expected_quantity: expectedQty,
        divergence,
      });

      // FIX RC3: UPSERT atômico para reconciliar saldo — mesmo padrão do
      // movement-service V2, mas com semântica diferente:
      //   movement-service:  quantity = quantity + excluded.quantity  (transferência: soma)
      //   inventory closeSession: quantity = excluded.quantity        (reconciliação: substitui)
      await trx.raw(
        `INSERT INTO inventory_balances (product_id, location_id, quantity)
         VALUES (?, ?, ?)
         ON CONFLICT (product_id, location_id)
         DO UPDATE SET quantity = excluded.quantity`,
        [adj.product_id, adj.location_id, adj.counted_quantity]
      );
    }

    return { adjusted: adjustments.length };
  });

  return result;
}
