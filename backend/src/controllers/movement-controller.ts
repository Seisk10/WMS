import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { requireUser } from '../middlewares/auth-middleware';
import { createMovement, getMovementHistory } from '../services/movement-service';

const MAX_QUANTITY_PER_MOVEMENT = 9_999;

const createMovementSchema = z.object({
  product_id: z.number().int().positive(),
  origin_location_id: z.number().int().positive(),
  destination_location_id: z.number().int().positive(),
  // FIX V4: teto de quantidade para evitar overflow aritmético e abuso de input
  quantity: z
    .number()
    .int()
    .positive('A quantidade deve ser um inteiro positivo.')
    .max(MAX_QUANTITY_PER_MOVEMENT, `Quantidade máxima por movimentação: ${MAX_QUANTITY_PER_MOVEMENT}.`),
  // UUID gerado pelo cliente; garante idempotência em retry/timeout/double-submit.
  // Opcional: clientes sem suporte enviam sem a chave e têm comportamento normal.
  idempotency_key: z.string().uuid('idempotency_key deve ser um UUID válido.').optional(),
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const createMovementHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = requireUser(req);
    const body = createMovementSchema.parse(req.body);

    const result = await createMovement({ ...body, user_id: userId });

    res.status(201).json({ success: true, data: result });
  }
);

export const getMovementHistoryHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // FIX V5: userId e role passados para filtrar por papel
    const { userId, role } = requireUser(req);
    const { page, limit } = historyQuerySchema.parse(req.query);
    const result = await getMovementHistory(page, limit, userId, role);

    res.status(200).json({
      success: true,
      data: result.movements,
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }
);
