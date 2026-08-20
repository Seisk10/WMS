import { Router } from 'express';
import { authMiddleware, requireRole } from '../middlewares/auth-middleware';
import {
  createSessionHandler,
  getSessionHandler,
  registerCountHandler,
  cancelSessionHandler,
  closeSessionHandler,
} from '../controllers/inventory-controller';

const router = Router();

router.use(authMiddleware);

router.post('/sessions', createSessionHandler);
router.get('/sessions/:id', getSessionHandler);
router.post('/count', registerCountHandler);
router.post('/sessions/:id/cancel', requireRole('ADMIN'), cancelSessionHandler);
router.post('/sessions/:id/close', requireRole('ADMIN'), closeSessionHandler);

export default router;
