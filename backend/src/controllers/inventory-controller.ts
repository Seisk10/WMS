import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { requireUser } from '../middlewares/auth-middleware';
import {
  createSession,
  getSession,
  registerCount,
  cancelSession,
  closeSession,
} from '../services/inventory-service';

// FIX V4: teto de quantidade para bipagem.
// Diferente do movement-service (bloqueado pelo saldo), o inventory aceita qualquer
// counted_quantity e closeSession o escreve diretamente em inventory_balances.
// Sem limite, um OPERADOR pode setar o saldo de qualquer produto para 2^31-1
// via inventário, bypassando completamente o check de saldo do movement.
const MAX_COUNT_PER_BIPAGEM = 9_999;

const createSessionSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório.').max(200),
  category: z.string().min(1, 'Categoria é obrigatória.').max(100),
  blind_count: z.boolean().optional().default(false),
});

const registerCountSchema = z.object({
  session_id: z.number().int().positive(),
  product_id: z.number().int().positive(),
  location_id: z.number().int().positive(),
  counted_quantity: z
    .number()
    .int()
    .min(0, 'Quantidade não pode ser negativa.')
    .max(MAX_COUNT_PER_BIPAGEM, `Quantidade máxima por bipagem: ${MAX_COUNT_PER_BIPAGEM}.`),
});

const sessionIdParamSchema = z.object({
  id: z.coerce.number().int().positive('ID de sessão inválido.'),
});

const closeSessionBodySchema = z.object({
  justification: z.string().min(10, 'Justificativa deve ter ao menos 10 caracteres.').optional(),
});

export const createSessionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = requireUser(req);
    const { title, category, blind_count } = createSessionSchema.parse(req.body);

    const result = await createSession(title, category, userId, blind_count);
    res.status(201).json({ success: true, data: result });
  }
);

export const getSessionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = sessionIdParamSchema.parse(req.params);

    const session = await getSession(id);
    res.status(200).json({ success: true, data: session });
  }
);

export const registerCountHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { userId } = requireUser(req);
    const { session_id, product_id, location_id, counted_quantity } =
      registerCountSchema.parse(req.body);

    const { blind_count } = await registerCount(
      session_id,
      product_id,
      location_id,
      counted_quantity,
      userId
    );

    res.status(200).json({
      success: true,
      data: { message: 'Contagem registrada com sucesso.', blind_count },
    });
  }
);

export const cancelSessionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = sessionIdParamSchema.parse(req.params);
    await cancelSession(id);
    res.status(200).json({ success: true, data: { message: 'Sessão cancelada. Produtos desbloqueados.' } });
  }
);

export const closeSessionHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { id } = sessionIdParamSchema.parse(req.params);
    const { justification } = closeSessionBodySchema.parse(req.body);

    const result = await closeSession(id, justification);
    res.status(200).json({
      success: true,
      data: {
        adjusted: result.adjusted,
        message: `Sessão finalizada. ${result.adjusted} saldo(s) de estoque conciliado(s).`,
      },
    });
  }
);
