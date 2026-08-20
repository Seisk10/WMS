import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth-middleware';
import { getDashboardStatsHandler, getMovimentacoesSemanaHandler } from '../controllers/report-controller';

const router = Router();

// Qualquer usuário autenticado pode ver os KPIs do dashboard.
// /reports/* é ADMIN-only; este endpoint serve todos os roles.
router.use(authMiddleware);

router.get('/stats', getDashboardStatsHandler);
router.get('/movimentacoes-semana', getMovimentacoesSemanaHandler);

export default router;
