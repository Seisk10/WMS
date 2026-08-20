import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth-middleware';
import { createLocationHandler, listLocationsHandler } from '../controllers/location-controller';

const router = Router();

router.use(authMiddleware);

router.get('/', listLocationsHandler);
router.post('/', createLocationHandler);

export default router;
