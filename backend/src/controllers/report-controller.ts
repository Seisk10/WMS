import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/async-handler';
import { getDashboardKPIs, getDivergences, getDashboardStats, getMovimentacoesSemana } from '../services/report-service';

const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const getDashboardHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const kpis = await getDashboardKPIs();
    res.status(200).json({ success: true, data: kpis });
  }
);

export const getDashboardStatsHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const stats = await getDashboardStats();
    res.status(200).json({ success: true, data: stats });
  }
);

export const getMovimentacoesSemanaHandler = asyncHandler(
  async (_req: Request, res: Response): Promise<void> => {
    const data = await getMovimentacoesSemana();
    res.status(200).json({ success: true, data });
  }
);

export const getDivergencesHandler = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    const { page, limit } = paginationSchema.parse(req.query);
    const result = await getDivergences(page, limit);

    res.status(200).json({
      success: true,
      data: result.divergences,
      meta: { total: result.total, page: result.page, limit: result.limit },
    });
  }
);
