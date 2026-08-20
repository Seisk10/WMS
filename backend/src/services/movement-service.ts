import db from '../database/connection';
import { AppError } from '../utils/app-error';
import type { UserRole } from '../types';
import { beginImmediateTransaction } from '../utils/sqlite-transaction';

export interface CreateMovementInput {
  product_id: number;
  origin_location_id: number;
  destination_location_id: number;
  quantity: number;
  user_id: number;
  idempotency_key?: string;
}

export interface MovementHistoryItem {
  id: number;
  product_id: number;
  item_code: string;
  product_name: string;
  origin_location: string | null;
  destination_location: string | null;
  quantity: number;
  username: string;
  moved_at: string;
}

export interface MovementHistoryResult {
  movements: MovementHistoryItem[];
  total: number;
  page: number;
  limit: number;
}

export async function createMovement(input: CreateMovementInput): Promise<{ id: number }> {
  if (input.origin_location_id === input.destination_location_id) {
    throw new AppError(
      'Origem e destino não podem ser o mesmo endereço.',
      400,
      'SAME_LOCATION'
    );
  }

  try {
  // beginImmediateTransaction adquire a conexão bruta e emite BEGIN IMMEDIATE
  // diretamente, pois db.transaction() sempre usa BEGIN (DEFERRED) no dialect
  // SQLite3 do Knex 3.x — o `isolationLevel` é explicitamente ignorado.
  const id = await beginImmediateTransaction(async (trx) => {
    // Idempotência: verificação ocorre como PRIMEIRA operação da transação,
    // antes de qualquer leitura de saldo ou escrita em inventory_balances.
    // Com pool max=1 os dois requests com mesma chave são serializados no pool —
    // o segundo sempre encontrará a chave já inserida e retorna sem re-executar.
    if (input.idempotency_key) {
      const existing = await trx('stock_movements')
        .where({ idempotency_key: input.idempotency_key })
        .select('id')
        .first<{ id: number } | undefined>();

      if (existing) return existing.id;
    }
    // FIX V3: valida produto junto com localizações (SQLite não enforça FK por padrão)
    const [product, originLoc, destLoc] = await Promise.all([
      trx('products').where({ id: input.product_id }).select('id').first(),
      trx('locations').where({ id: input.origin_location_id }).select('id').first(),
      trx('locations').where({ id: input.destination_location_id }).select('id').first(),
    ]);

    // FIX V6: mensagens sem IDs internos (evita enumeração)
    if (!product) {
      throw new AppError('Produto não encontrado.', 404, 'PRODUCT_NOT_FOUND');
    }
    if (!originLoc) {
      throw new AppError('Localização de origem não encontrada.', 404, 'LOCATION_NOT_FOUND');
    }
    if (!destLoc) {
      throw new AppError('Localização de destino não encontrada.', 404, 'LOCATION_NOT_FOUND');
    }

    // FIX IC1: Guard de integridade entre inventário e movimentação.
    // Sem este check, uma movimentação pode ocorrer entre registerCount e closeSession,
    // causando dois efeitos simultâneos e silenciosos:
    //
    //   (1) Divergência falsa: closeSession lê expectedQty APÓS a movimentação e
    //       calcula um delta que não reflete nenhuma discrepância real de estoque.
    //
    //   (2) Movimentação desfeita: closeSession sobrescreve inventory_balances com
    //       o valor contado ANTES da movimentação — tornando stock_movements
    //       inconsistente com inventory_balances de forma permanente.
    //
    // O check cobre origin E destination porque ambos afetam o saldo de localizações
    // que podem estar sob contagem. A granularidade é (product_id, location_id):
    // produtos sem bipe registrado na sessão ainda podem ser movimentados livremente.
    const countConflict = await trx('inventory_adjustments as ia')
      .join('inventory_sessions as s', 'ia.session_id', 's.id')
      .where('s.status', 'EM_ANDAMENTO')
      .where('ia.product_id', input.product_id)
      .where((builder) =>
        builder
          .where('ia.location_id', input.origin_location_id)
          .orWhere('ia.location_id', input.destination_location_id)
      )
      .select('ia.id')
      .first();

    if (countConflict) {
      throw new AppError(
        'Produto está sob contagem em uma sessão de inventário ativa. Finalize o inventário antes de movimentar.',
        409,
        'PRODUCT_UNDER_INVENTORY'
      );
    }

    // FIX V1: decremento atômico — a condição WHERE quantity >= ? e a escrita
    // acontecem em uma única instrução SQL, eliminando a janela de race condition.
    const rowsDecremented = await trx('inventory_balances')
      .where({ product_id: input.product_id, location_id: input.origin_location_id })
      .where('quantity', '>=', input.quantity)
      .decrement('quantity', input.quantity);

    if (rowsDecremented === 0) {
      const current = await trx('inventory_balances')
        .where({ product_id: input.product_id, location_id: input.origin_location_id })
        .select('quantity')
        .first();
      throw new AppError(
        `Saldo insuficiente na origem. Disponível: ${current?.quantity ?? 0}, solicitado: ${input.quantity}.`,
        409,
        'INSUFFICIENT_STOCK'
      );
    }

    // FIX V2: UPSERT atômico no destino — instrução única, sem TOCTOU.
    await trx.raw(
      `INSERT INTO inventory_balances (product_id, location_id, quantity)
       VALUES (?, ?, ?)
       ON CONFLICT (product_id, location_id)
       DO UPDATE SET quantity = quantity + excluded.quantity`,
      [input.product_id, input.destination_location_id, input.quantity]
    );

    const [movementId] = await trx('stock_movements').insert({
      product_id: input.product_id,
      origin_location_id: input.origin_location_id,
      destination_location_id: input.destination_location_id,
      quantity: input.quantity,
      user_id: input.user_id,
      idempotency_key: input.idempotency_key ?? null,
    });

    return movementId as number;
  });

  return { id };
  } catch (err: unknown) {
    // Defesa contra race condition em pool max>1 (impossível na config atual):
    // se dois requests com mesma chave escaparam do check simultâneo e o segundo
    // bateu no UNIQUE index, a transação já foi revertida — buscamos o registro
    // original e retornamos como replay legítimo.
    if (
      input.idempotency_key &&
      err instanceof Error &&
      err.message.includes('UNIQUE constraint failed: stock_movements.idempotency_key')
    ) {
      const replay = await db('stock_movements')
        .where({ idempotency_key: input.idempotency_key })
        .select('id')
        .first<{ id: number } | undefined>();
      if (replay) return { id: replay.id };
    }
    throw err;
  }
}

export async function getMovementHistory(
  page: number,
  limit: number,
  userId: number,
  userRole: UserRole
): Promise<MovementHistoryResult> {
  const safeLimit = Math.min(limit, 100);
  const offset = (page - 1) * safeLimit;

  // FIX V5: OPERADORs veem apenas suas próprias movimentações
  const buildBase = () => {
    const q = db('stock_movements as m')
      .join('products as p', 'p.id', 'm.product_id')
      .leftJoin('locations as ol', 'ol.id', 'm.origin_location_id')
      .leftJoin('locations as dl', 'dl.id', 'm.destination_location_id')
      .join('users as u', 'u.id', 'm.user_id');

    if (userRole === 'OPERADOR') {
      q.where('m.user_id', userId);
    }

    return q;
  };

  const [movements, countRow] = await Promise.all([
    buildBase()
      .select<MovementHistoryItem[]>(
        'm.id',
        'm.product_id',
        'p.item_code',
        'p.name as product_name',
        'ol.name as origin_location',
        'dl.name as destination_location',
        'm.quantity',
        'u.username',
        'm.moved_at'
      )
      .orderBy('m.moved_at', 'desc')
      .limit(safeLimit)
      .offset(offset),

    buildBase().count<{ total: string | number }>({ total: 'm.id' }).first(),
  ]);

  return {
    movements,
    total: Number(countRow?.total ?? 0),
    page,
    limit: safeLimit,
  };
}
