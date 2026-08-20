import { Router } from 'express';
import { authMiddleware, requireRole } from '../middlewares/auth-middleware';
import { getDashboardHandler, getDivergencesHandler } from '../controllers/report-controller';

const router = Router();

// Todas as rotas de relatório exigem autenticação + perfil ADMIN
router.use(authMiddleware);
router.use(requireRole('ADMIN'));

router.get('/dashboard', getDashboardHandler);
router.get('/divergences', getDivergencesHandler);

export default router;
