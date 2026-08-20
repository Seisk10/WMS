import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth-middleware';
import { getProduct } from '../controllers/product-controller';

const router = Router();

router.use(authMiddleware);

router.get('/:identifier', getProduct);

export default router;
