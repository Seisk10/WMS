import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth-middleware';
import { createMovementHandler, getMovementHistoryHandler } from '../controllers/movement-controller';

const router = Router();

router.use(authMiddleware);

router.post('/', createMovementHandler);
router.get('/history', getMovementHistoryHandler);

export default router;
